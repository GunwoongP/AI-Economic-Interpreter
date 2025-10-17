#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable, List


def ensure_repo_on_path() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))


ensure_repo_on_path()

from RAG_zzin import RAGPipeline


def load_queries(path: Path) -> List[str]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "queries" in raw:
        source: Iterable[Any] = raw["queries"]
    else:
        source = raw
    queries: List[str] = []
    for item in source:
        if isinstance(item, str):
            queries.append(item.strip())
        elif isinstance(item, dict):
            text = item.get("question") or item.get("query")
            if isinstance(text, str):
                queries.append(text.strip())
        else:
            raise ValueError(f"Unsupported query item: {item!r}")
    if not queries:
        raise ValueError("No queries found in the input file.")
    return queries


def shorten(text: str, limit: int = 220) -> str:
    text = (text or "").strip().replace("\n", " ")
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    default_input = script_dir / "queries.json"

    parser = argparse.ArgumentParser(
        description="간단한 RAG 파이프라인 검증 스크립트 (Top-K 컨텍스트 프린트)"
    )
    parser.add_argument(
        "--input",
        "-i",
        type=Path,
        default=default_input,
        help=f"질의 JSON 경로 (기본값: {default_input})",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=3,
        help="가져올 상위 컨텍스트 수 (기본값: 3)",
    )
    parser.add_argument(
        "--use-llm",
        action="store_true",
        help="LLM 요약을 포함해서 답변 출력",
    )
    args = parser.parse_args()

    queries = load_queries(args.input)
    pipeline = RAGPipeline()

    for idx, query in enumerate(queries, start=1):
        print("=" * 60)
        print(f"[{idx}] Query: {query}")
        answer, contexts = pipeline.answer_query(query, top_k=args.top_k, use_llm=args.use_llm)
        print("- Answer -")
        print(shorten(answer, 600))
        print("- Contexts -")
        if not contexts:
            print("  (no contexts)")
            continue
        for rank, ctx in enumerate(contexts, start=1):
            score = float(ctx.get("score", 0.0))
            dataset = ctx.get("dataset", "unknown")
            source = ctx.get("source", "unknown")
            chunk_id = ctx.get("chunk_id")
            snippet = shorten(ctx.get("text", ""), 260)
            descriptor: List[str] = [
                f"rank={rank}",
                f"score={score:.3f}",
                f"dataset={dataset}",
                f"source={source}",
            ]
            if chunk_id not in (None, ""):
                descriptor.append(f"chunk={chunk_id}")
            print("  " + " | ".join(descriptor))
            print(f"    {snippet}")


if __name__ == "__main__":
    main()
