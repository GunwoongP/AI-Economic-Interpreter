# -*- coding: utf-8 -*-
"""
BOK 경제용어사전 크롤러
-----------------------

기존 Selenium 기반 구현은 2025-09 기준 사이트 개편으로 인해
탭 클릭/DOM 탐색이 정상 동작하지 않아 빈 결과를 반환했습니다.
본 스크립트는 사이트가 내부적으로 사용하는 JSON API
(`/portal/ecEdu/ecWordDicary/searchWord.json`)를 직접 호출해
경제용어 전체 목록을 수집하고, 본문 HTML은 BeautifulSoup으로
정제한 뒤 JSONL로 저장합니다.

용례:
    python bok_crawl_terms.py --letters ㄱㄴ --out data/bok_terms_full.jsonl --overwrite
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Dict, Iterable, List

import requests
from bs4 import BeautifulSoup
from requests import Response, Session
from requests.exceptions import RequestException

BASE_SEARCH_URL = "https://www.bok.or.kr/portal/ecEdu/ecWordDicary/searchWord.json"
DEFAULT_LETTERS = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎABCDEFGHIJKLMNOPQRSTUVWXYZ"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Referer": "https://www.bok.or.kr/portal/ecEdu/ecWordDicary/search.do?menuNo=200688",
}


def html_to_text(raw_html: str) -> str:
    """Convert the HTML body returned by the API into readable plain text."""
    if not raw_html:
        return ""

    soup = BeautifulSoup(raw_html, "html.parser")

    for script in soup(["script", "style"]):
        script.decompose()

    for br in soup.find_all("br"):
        br.replace_with("\n")

    for img in soup.find_all("img"):
        alt = (img.get("alt") or "").strip()
        if alt:
            img.replace_with(f" [{alt}] ")
        else:
            img.decompose()

    # Preserve bullet points by prefixing list items.
    for li in soup.find_all("li"):
        text = li.get_text(" ", strip=True)
        li.clear()
        li.append(f"• {text}")

    text = soup.get_text("\n", strip=True)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def fetch_json(session: Session, params: Dict[str, str], retries: int = 3) -> Dict:
    """Perform a GET request with simple retry/back-off."""
    for attempt in range(1, retries + 1):
        try:
            resp: Response = session.get(BASE_SEARCH_URL, params=params, timeout=20)
            resp.raise_for_status()
            return resp.json()
        except (RequestException, ValueError) as exc:  # ValueError -> JSON decode
            if attempt == retries:
                raise RuntimeError(f"API request failed for params={params}") from exc
            sleep_for = 1.5 * attempt
            print(f"  ! 요청 실패({exc}); {sleep_for:.1f}s 후 재시도...", file=sys.stderr)
            time.sleep(sleep_for)
    return {}


def fetch_letter(session: Session, letter: str) -> List[Dict]:
    """Fetch all dictionary entries for a given initial letter."""
    params = {
        "collection": "dic",
        "category": letter,
        "initYn": "Y",
    }
    data = fetch_json(session, params)
    word_list = data.get("wordList") or []
    if not isinstance(word_list, list):
        print(f"  ! 예상치 못한 응답 구조: {type(word_list)}", file=sys.stderr)
        return []
    return word_list


def load_existing_terms(path: Path) -> set[str]:
    """Load existing terms to avoid duplicates when appending."""
    if not path.exists():
        return set()
    terms: set[str] = set()
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            term = rec.get("term")
            if isinstance(term, str):
                terms.add(term.strip())
    return terms


def build_record(item: Dict) -> Dict:
    term = item["ecWordNm"].strip()
    raw_html = item.get("ecWordCn", "")
    definition = html_to_text(raw_html)
    return {
        "term": term,
        "definition": definition,
    }


def write_jsonl(path: Path, records: Iterable[Dict], overwrite: bool) -> int:
    mode = "w" if overwrite else "a"
    count = 0
    with path.open(mode, encoding="utf-8") as fh:
        for rec in records:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            count += 1
    return count


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BOK 경제용어사전 수집")
    parser.add_argument(
        "--letters",
        default=DEFAULT_LETTERS,
        help="탐색할 자모/알파벳 문자열 (기본: 전체)",
    )
    parser.add_argument(
        "--out",
        default="data/bok_terms_full.jsonl",
        help="저장할 JSONL 경로",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="기존 파일을 덮어쓰고 새로 작성",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.3,
        help="요청 사이 간격(초)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    letters = [ch for ch in args.letters if not ch.isspace()]
    if not letters:
        print("letters 인자가 비어 있습니다.", file=sys.stderr)
        return 1

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update(HEADERS)

    existing_terms = set() if args.overwrite else load_existing_terms(out_path)
    letter_records: List[tuple[str, Dict]] = []
    total_found = 0
    order_map = {letter: idx for idx, letter in enumerate(letters)}

    print(f"[INFO] 대상 글자: {''.join(letters)}")

    for letter in letters:
        print(f"\n[LETTER] {letter}")
        try:
            word_items = fetch_letter(session, letter)
        except RuntimeError as exc:
            print(f"  ! {exc}", file=sys.stderr)
            continue

        print(f"  - {len(word_items)}건 발견")
        total_found += len(word_items)

        for item in word_items:
            try:
                record = build_record(item)
            except Exception as exc:
                print(f"  ! 레코드 변환 실패 (id={item.get('ecWordSn')}): {exc}", file=sys.stderr)
                continue

            term_key = record.get("term", "").strip()
            if not term_key:
                continue
            if term_key in existing_terms:
                continue

            letter_records.append((letter, record))
            existing_terms.add(term_key)

        time.sleep(max(0.0, args.delay))

    if not letter_records:
        print("\n[INFO] 추가된 항목이 없습니다.")
        return 0

    # 정렬: 글자 > 용어 이름
    letter_records.sort(key=lambda pair: (order_map.get(pair[0], 999), pair[1]["term"]))
    ordered_records = [rec for _, rec in letter_records]
    written = write_jsonl(out_path, ordered_records, overwrite=args.overwrite)

    print(f"\n[DONE] 전체 발견 {total_found}건, 신규 저장 {written}건 → {out_path.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
