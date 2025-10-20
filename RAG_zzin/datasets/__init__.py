from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Callable, Dict, Iterable, List, Optional, Any


@dataclass(slots=True)
class IngestRecord:
    text: str
    source: str
    meta: Dict[str, Any]
    chunk: bool = False


@dataclass(slots=True)
class DatasetSpec:
    name: str
    predicate: Callable[[Dict[str, Any]], bool]
    builder: Callable[[Dict[str, Any], str], Optional[IngestRecord]]


def _has_keys(obj: Dict[str, Any], required: Iterable[str]) -> bool:
    return all(key in obj and obj[key] not in (None, "") for key in required)


def _clean_meta(meta: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in meta.items() if value not in (None, "", [], {})}


def _make_record(
    *,
    text: str,
    source: str,
    dataset: str,
    source_file: str,
    extra_meta: Optional[Dict[str, Any]] = None,
    chunk: bool = False,
) -> IngestRecord:
    meta: Dict[str, Any] = {
        "dataset": dataset,
        "source_file": source_file,
    }
    if extra_meta:
        meta.update(extra_meta)
    return IngestRecord(text=text.strip(), source=source, meta=_clean_meta(meta), chunk=chunk)


def _build_bok_terms(obj: Dict[str, Any], source_file: str) -> Optional[IngestRecord]:
    term = obj.get("term")
    definition = obj.get("definition")
    if not term or not definition:
        return None
    text = f"{term}\n{definition}"
    extra = {"term": term, "definition": definition}
    return _make_record(
        text=text,
        source=str(obj.get("source") or source_file),
        dataset="bok_terms",
        source_file=source_file,
        extra_meta=extra,
    )


def _build_econ_terms(obj: Dict[str, Any], source_file: str) -> Optional[IngestRecord]:
    question = obj.get("question")
    answer = obj.get("answer")
    if not question or not answer:
        return None
    text = f"{question}\n{answer}"
    extra = {
        "question": question,
        "answer": answer,
        "title": obj.get("title"),
        "url": obj.get("url"),
    }
    return _make_record(
        text=text,
        source=str(obj.get("source") or source_file),
        dataset="econ_terms",
        source_file=source_file,
        extra_meta=extra,
    )


def _build_naver_terms(obj: Dict[str, Any], source_file: str) -> Optional[IngestRecord]:
    name = obj.get("name")
    summary = obj.get("summary")
    profile = obj.get("profile")
    if not summary and profile:
        summary = _stringify(profile)
    if not name or not summary:
        return None
    text = f"{name}\n{summary}"
    extra = {
        "name": name,
        "summary": summary,
        "profile": profile,
        "url": obj.get("url"),
    }
    return _make_record(
        text=text,
        source=str(obj.get("source") or source_file),
        dataset="naver_terms",
        source_file=source_file,
        extra_meta=extra,
    )


def _build_events_catalog(obj: Dict[str, Any], source_file: str) -> Optional[IngestRecord]:
    name = obj.get("name")
    summary = obj.get("summary")
    year = obj.get("year")
    if not name or not summary or year is None:
        return None
    text_parts = [name, summary]
    if year is not None:
        text_parts.append(f"year: {year}")
    region = obj.get("region")
    if region:
        text_parts.append(f"region: {region}")
    extra = {
        "event_id": obj.get("id"),
        "name": name,
        "summary": summary,
        "year": year,
        "region": region,
        "sources": obj.get("sources"),
    }
    return _make_record(
        text="\n".join(text_parts),
        source=str(obj.get("source") or source_file),
        dataset="events_catalog",
        source_file=source_file,
        extra_meta=extra,
    )


def _build_wise_reports(obj: Dict[str, Any], source_file: str) -> Optional[IngestRecord]:
    market = obj.get("market")
    code = obj.get("code")
    name = obj.get("name")
    if not market or not code or not name:
        return None
    metrics = obj.get("metrics") if isinstance(obj.get("metrics"), dict) else None
    text_parts = [
        f"code: {code}",
        f"name: {name}",
        f"market: {market}",
    ]
    if metrics:
        metric_text = " | ".join(f"{k}: {v}" for k, v in metrics.items())
        text_parts.append(metric_text)
    extra = {
        "market": market,
        "code": code,
        "name": name,
        "metrics": metrics,
        "reports": obj.get("reports"),
    }
    return _make_record(
        text="\n".join(text_parts),
        source=str(obj.get("source") or source_file),
        dataset="wise_reports",
        source_file=source_file,
        extra_meta=extra,
    )


def _build_document_chunk(obj: Dict[str, Any], source_file: str) -> Optional[IngestRecord]:
    content = obj.get("content") or obj.get("text")
    if not content or not isinstance(content, str):
        return None
    extra = {
        "page": obj.get("page"),
        "chunk_id": obj.get("chunk_id"),
        "char_count": obj.get("char_count"),
        "section": obj.get("section"),
        "source_document": obj.get("source"),
        "title": obj.get("title"),
    }
    source = str(obj.get("source") or source_file)
    return _make_record(
        text=content,
        source=source,
        dataset="document_chunks",
        source_file=source_file,
        extra_meta=extra,
    )


def _stringify(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return str(value)


def _build_generic(obj: Dict[str, Any], source_file: str) -> Optional[IngestRecord]:
    text = _stringify(obj)
    if not text.strip():
        return None
    return _make_record(
        text=text,
        source=source_file,
        dataset="generic",
        source_file=source_file,
        chunk=True,
    )


SCHEMA_HANDLERS: List[DatasetSpec] = [
    DatasetSpec(
        name="bok_terms",
        predicate=lambda obj: _has_keys(obj, ("term", "definition")),
        builder=_build_bok_terms,
    ),
    DatasetSpec(
        name="econ_terms",
        predicate=lambda obj: _has_keys(obj, ("question", "answer")),
        builder=_build_econ_terms,
    ),
    DatasetSpec(
        name="events_catalog",
        predicate=lambda obj: obj.get("name") and obj.get("summary") and obj.get("year") is not None,
        builder=_build_events_catalog,
    ),
    DatasetSpec(
        name="naver_terms",
        predicate=lambda obj: obj.get("name") and (obj.get("summary") or obj.get("profile")),
        builder=_build_naver_terms,
    ),
    DatasetSpec(
        name="wise_reports",
        predicate=lambda obj: _has_keys(obj, ("market", "code", "name")),
        builder=_build_wise_reports,
    ),
    DatasetSpec(
        name="document_chunks",
        predicate=lambda obj: isinstance(obj.get("content") or obj.get("text"), str),
        builder=_build_document_chunk,
    ),
]

GENERIC_SPEC = DatasetSpec(
    name="generic",
    predicate=lambda _: True,
    builder=_build_generic,
)


def _pick_spec(obj: Dict[str, Any], current: Optional[DatasetSpec]) -> DatasetSpec:
    if current and current is not GENERIC_SPEC and current.predicate(obj):
        return current
    for spec in SCHEMA_HANDLERS:
        if spec.predicate(obj):
            return spec
    if current and current.predicate(obj):
        return current
    return GENERIC_SPEC


def _load_json_lines(path: str, source_file: str) -> List[IngestRecord]:
    records: List[IngestRecord] = []
    spec: Optional[DatasetSpec] = None

    with open(path, "r", encoding="utf-8", errors="ignore") as handle:
        for raw_line in handle:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                payload = json.loads(raw_line)
            except Exception:
                continue
            if not isinstance(payload, dict):
                continue
            spec = _pick_spec(payload, spec)
            record = spec.builder(payload, source_file)
            if record:
                records.append(record)
    return records


def _load_json_array(path: str, source_file: str) -> List[IngestRecord]:
    records: List[IngestRecord] = []
    spec: Optional[DatasetSpec] = None
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as handle:
            payload = json.load(handle)
    except Exception:
        return records

    if isinstance(payload, dict):
        payload_iterable = payload.values()
    elif isinstance(payload, list):
        payload_iterable = payload
    else:
        return records

    for item in payload_iterable:
        if not isinstance(item, dict):
            continue
        spec = _pick_spec(item, spec)
        record = spec.builder(item, source_file)
        if record:
            records.append(record)
    return records


def load_records_for_path(path: str) -> List[IngestRecord]:
    if not os.path.exists(path):
        return []
    source_file = os.path.basename(path)
    ext = os.path.splitext(path)[1].lower()
    if ext == ".jsonl":
        return _load_json_lines(path, source_file)
    if ext == ".json":
        return _load_json_array(path, source_file)
    return []


__all__ = ["IngestRecord", "load_records_for_path"]
