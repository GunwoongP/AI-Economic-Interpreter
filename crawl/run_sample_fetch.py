from __future__ import annotations

import json
from pathlib import Path
import argparse
import json
from typing import Dict, Iterable, List
from datetime import datetime, timezone

from .eco_news import fetch_eco_news
from .firm_news import fetch_firm_news
from .house_news import fetch_house_news
from .utils import to_dicts

ROLE_FETCHERS = {
    "eco": fetch_eco_news,
    "firm": fetch_firm_news,
    "house": fetch_house_news,
}


def run_sample(roles: Iterable[str], limit_per_source: int) -> Dict[str, List[dict]]:
    data: Dict[str, List[dict]] = {}
    for role in roles:
        fetcher = ROLE_FETCHERS[role]
        data[role] = to_dicts(fetcher(limit_per_source=limit_per_source))
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch news items for RAG sources (per role).")
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Number of articles to fetch per source (default: 10).",
    )
    parser.add_argument(
        "--append-to",
        type=str,
        help="Optional JSONL file to append unique articles to (deduped by URL/title).",
    )
    parser.add_argument(
        "--append-dir",
        type=str,
        help="Directory to store role-specific JSONL append files (one file per role).",
    )
    parser.add_argument(
        "--roles",
        nargs="+",
        default=["eco", "firm", "house"],
        choices=["eco", "firm", "house", "all"],
        help="Roles to fetch (eco, firm, house). Default: all roles.",
    )
    parser.add_argument(
        "--out-dir",
        type=str,
        default="crawl/samples",
        help="Directory to output role-specific JSON files.",
    )
    args = parser.parse_args()

    roles = args.roles
    if "all" in roles:
        roles = ["eco", "firm", "house"]

    data = run_sample(roles, limit_per_source=args.limit)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for role, items in data.items():
        out_path = out_dir / f"{role}_news.json"
        out_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Saved {len(items)} articles for role '{role}' to {out_path}")

    if args.append_to:
        _append_records(Path(args.append_to), data)

    if args.append_dir:
        base = Path(args.append_dir)
        base.mkdir(parents=True, exist_ok=True)
        for role in roles:
            subset = {role: data.get(role, [])}
            _append_records(base / f"{role}.jsonl", subset)


def _append_records(target_path: Path, data: Dict[str, List[dict]]) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    seen_keys = set()
    if target_path.exists():
        with target_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                key = item.get("url") or item.get("title")
                if key:
                    seen_keys.add(key)

    new_entries = []
    fetched_at = datetime.now(timezone.utc).isoformat()
    for role, items in data.items():
        for item in items:
            key = item.get("url") or item.get("title")
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            record = dict(item)
            record.setdefault("role", role)
            record["fetched_at"] = fetched_at
            new_entries.append(record)

    if new_entries:
        with target_path.open("a", encoding="utf-8") as f:
            for record in new_entries:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        print(f"Appended {len(new_entries)} new articles to {target_path}")
    else:
        print(f"No new articles to append; {target_path} already up to date.")


if __name__ == "__main__":
    main()
