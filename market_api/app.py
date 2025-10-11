from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, Literal, Optional

import requests
from fastapi import FastAPI, HTTPException

SymbolKey = Literal["KOSPI", "IXIC"]

SYMBOL_MAP: Dict[SymbolKey, str] = {
    "KOSPI": "^KS11",
    "IXIC": "^IXIC",
}

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/"
CACHE_TTL = timedelta(minutes=10)

CachePayload = Dict[str, object]

cache: Dict[SymbolKey, Dict[str, object]] = {}

session = requests.Session()
session.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
    }
)

app = FastAPI(title="Market Timeseries API", version="0.2.0")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _get_cached(symbol: SymbolKey) -> Optional[CachePayload]:
    entry = cache.get(symbol)
    if not entry:
        return None
    if entry["expires"] <= _utc_now():
        cache.pop(symbol, None)
        return None
    payload = entry.get("payload")
    if isinstance(payload, dict):
        return payload
    return None


def _set_cache(symbol: SymbolKey, payload: CachePayload) -> None:
    cache[symbol] = {
        "payload": payload,
        "expires": _utc_now() + CACHE_TTL,
    }


def _format_values(symbol: SymbolKey, data: dict) -> CachePayload:
    chart = data.get("chart") or {}

    error = chart.get("error")
    if error:
        detail = error.get("description") or str(error)
        raise HTTPException(status_code=502, detail=f"Yahoo Finance 오류: {detail}")

    results = chart.get("result")
    if not results:
        raise HTTPException(status_code=502, detail="Yahoo Finance 응답에 result가 없습니다.")

    result = results[0]
    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    quote = (indicators.get("quote") or [{}])[0] or {}

    closes = quote.get("close") or []
    volumes = quote.get("volume") or []

    values = []
    for idx, ts in enumerate(timestamps):
        if ts is None:
            continue
        close = closes[idx] if idx < len(closes) else None
        if close is None:
            continue
        try:
            dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
        except (TypeError, ValueError) as exc:  # pragma: no cover
            raise HTTPException(status_code=502, detail=f"잘못된 타임스탬프 데이터: {ts}") from exc

        volume = volumes[idx] if idx < len(volumes) else None
        values.append(
            {
                "t": int(dt.timestamp() * 1000),
                "close": float(close),
                "volume": None if volume is None else float(volume),
            }
        )

    if not values:
        raise HTTPException(status_code=502, detail="시세 항목이 없습니다.")

    values.sort(key=lambda item: item["t"])

    return {
        "symbol": symbol,
        "stamp": _utc_now().strftime("%Y-%m-%d %H:%M"),
        "values": values,
    }


def _fetch_from_yahoo(symbol: SymbolKey) -> CachePayload:
    ticker = SYMBOL_MAP[symbol]
    try:
        resp = session.get(
            f"{YAHOO_CHART_URL}{ticker}",
            params={"range": "3mo", "interval": "1d"},
            timeout=10,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Yahoo Finance 요청 실패: {exc}") from exc

    if resp.status_code != 200:
        snippet = resp.text.strip()[:200]
        raise HTTPException(
            status_code=502,
            detail=f"Yahoo Finance 응답 오류 ({resp.status_code}): {snippet}",
        )

    try:
        json_data = resp.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Yahoo Finance 응답이 JSON이 아닙니다.") from exc

    return _format_values(symbol, json_data)


@app.get("/series/{symbol}")
def get_series(symbol: SymbolKey):
    if symbol not in SYMBOL_MAP:
        raise HTTPException(status_code=400, detail="지원하지 않는 지수입니다.")

    cached = _get_cached(symbol)
    if cached:
        return cached

    payload = _fetch_from_yahoo(symbol)
    _set_cache(symbol, payload)
    return payload


@app.get("/health")
def health():
    return {"status": "ok", "ts": _utc_now().isoformat()}
