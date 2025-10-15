from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, Iterable, List, Set

from .client import Article, NaverBreakingNewsClient
from .config import ROLE_SECTIONS


def collect_role_articles(
    role: str,
    *,
    target: int,
    max_days: int,
    output_dir: Path,
    append_path: Path | None,
) -> Dict[str, List[dict]]:
    if role not in ROLE_SECTIONS:
        raise ValueError(f"Unknown role '{role}'. Valid roles: {list(ROLE_SECTIONS)}")

    section = ROLE_SECTIONS[role]
    client = NaverBreakingNewsClient()
    collected: List[Article] = []
    seen_urls: Set[str] = set()

    day_offsets = 0
    while len(collected) < target and day_offsets < max_days:
        date_str = _format_date(day_offsets)
        for sid2 in section.sid2_list:
            if len(collected) >= target:
                break
            articles = client.fetch_page(
                role,
                section,
                sid2,
                page=1,
                min_length=section.min_length,
                date=date_str,
            )
            if not articles:
                continue
            for article in articles:
                if article.url in seen_urls:
                    continue
                seen_urls.add(article.url)
                collected.append(article)
                if len(collected) >= target:
                    break
        day_offsets += 1

    if not collected:
        return {role: []}

    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"{role}_naver.json"
    data = [article.to_dict() for article in collected]
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    if append_path:
        append_path.parent.mkdir(parents=True, exist_ok=True)
        existing_urls = _load_existing_urls(append_path)
        written = 0
        with append_path.open("a", encoding="utf-8") as f:
            for article in collected:
                if article.url in existing_urls:
                    continue
                existing_urls.add(article.url)
                f.write(json.dumps(article.to_dict(), ensure_ascii=False) + "\n")
                written += 1
        print(f"[{role}] appended {written} new articles to {append_path}")

    print(f"[{role}] collected {len(collected)} articles")
    return {role: data}


def _load_existing_urls(path: Path) -> Set[str]:
    urls: Set[str] = set()
    if not path.exists():
        return urls
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            url = data.get("url")
            if url:
                urls.add(url)
    return urls


def main(argv: Iterable[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Collect historical articles from Naver breaking news.")
    parser.add_argument("--role", choices=list(ROLE_SECTIONS) + ["all"], default="all")
    parser.add_argument("--target", type=int, default=500)
    parser.add_argument("--max-days", type=int, default=180, help="Maximum number of past days to crawl.")
    parser.add_argument("--out-dir", type=str, default="crawl/naver/output")
    parser.add_argument("--append-dir", type=str, help="Directory to append role-specific JSONL data.")
    args = parser.parse_args(list(argv) if argv is not None else None)

    roles = list(ROLE_SECTIONS)
    if args.role != "all":
        roles = [args.role]

    out_dir = Path(args.out_dir)

    for role_name in roles:
        append_path = Path(args.append_dir) / f"{role_name}.jsonl" if args.append_dir else None
        collect_role_articles(
            role_name,
            target=args.target,
            max_days=args.max_days,
            output_dir=out_dir,
            append_path=append_path,
        )


def _format_date(offset_days: int) -> str:
    from datetime import datetime, timedelta

    target_date = datetime.now() - timedelta(days=offset_days)
    return target_date.strftime("%Y%m%d")


if __name__ == "__main__":
    main()
