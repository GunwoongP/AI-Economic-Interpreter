from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable, List, Dict, Any

try:
    from RAG import RAGPipeline  # type: ignore
except ImportError:
    from RAG_zzin import RAGPipeline  # type: ignore


def load_queries(path: Path) -> List[str]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "queries" in raw:
        seq: Iterable[Any] = raw["queries"]
    else:
        seq = raw
    queries: List[str] = []
    for item in seq:
        if isinstance(item, str):
            queries.append(item)
        elif isinstance(item, dict):
            q = item.get("question") or item.get("query")
            if isinstance(q, str):
                queries.append(q)
        else:
            raise ValueError(f"Unsupported query entry: {item!r}")
    if not queries:
        raise ValueError("No queries provided.")
    return queries


def shorten(text: str, limit: int = 600) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def build_markdown(
    results: List[Dict[str, Any]],
    file_rows: List[tuple[str, str, int]],
    dataset_totals: Dict[str, int],
) -> str:
    lines: List[str] = []
    lines.append("# RAG 테스트 결과")
    lines.append("")
    lines.append("## 1. 데이터 커버리지")
    lines.append("| 파일 | 데이터셋 | 문서 수 |")
    lines.append("| --- | --- | ---: |")
    for name, dataset, count in file_rows:
        lines.append(f"| {name} | {dataset} | {count:,} |")
    lines.append("")
    lines.append("| 데이터셋 | 총 문서 수 |")
    lines.append("| --- | ---: |")
    for dataset, count in dataset_totals.items():
        lines.append(f"| {dataset} | {count:,} |")
    lines.append("")
    lines.append("## 2. 질의 결과")
    for item in results:
        idx = item.get("id")
        query = item.get("query")
        lines.append(f"### 2.{idx} {query}")
        lines.append("")
        answer_preview = shorten(item.get("answer", ""), 700).replace("\n", "  \n")
        lines.append(f"- **Answer:**  {answer_preview}")
        contexts = item.get("contexts") or []
        if contexts:
            lines.append("- **Top Contexts:**")
            for ctx in contexts:
                snippet = shorten(ctx.get("snippet", ""), 200).replace("\n", " ")
                score = ctx.get("score")
                if isinstance(score, (int, float)):
                    score_str = f"{score:.3f}"
                else:
                    score_str = "-"
                extras: List[str] = []
                for key in ("code", "name", "chunk_id"):
                    value = ctx.get(key)
                    if value not in (None, ""):
                        extras.append(f"{key}={value}")
                extra_str = f" ({', '.join(extras)})" if extras else ""
                lines.append(
                    f"  - dataset={ctx.get('dataset')}, source={ctx.get('source')}{extra_str}, "
                    f"score={score_str}, snippet=\"{snippet}\""
                )
        else:
            lines.append("- **Top Contexts:** (none)")
        lines.append("")
    return "\n".join(lines)


def collect_dataset_stats(data_dir: Path) -> tuple[List[tuple[str, str, int]], Dict[str, int]]:
    from collections import Counter
    try:
        from RAG.datasets import load_records_for_path  # type: ignore
        from RAG.utils import read_text_from_file  # type: ignore
    except ImportError:
        from RAG_zzin.datasets import load_records_for_path  # type: ignore
        from RAG_zzin.utils import read_text_from_file  # type: ignore

    file_rows: List[tuple[str, str, int]] = []
    dataset_totals: Dict[str, int] = Counter()
    for path in sorted(data_dir.glob("*")):
        if path.name.startswith("."):
            continue
        records = load_records_for_path(str(path))
        if not records:
            fallback = read_text_from_file(str(path))
            if fallback.strip():
                file_rows.append((path.name, "generic", 1))
                dataset_totals["generic"] += 1
            continue
        counter: Dict[str, int] = Counter(rec.meta.get("dataset", "unknown") for rec in records)
        for dataset, count in counter.items():
            file_rows.append((path.name, dataset, count))
            dataset_totals[dataset] += count
    return file_rows, dict(sorted(dataset_totals.items(), key=lambda x: x[0]))


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    default_input = script_dir / "queries.json"
    default_json_out = Path("RAG/reports/query_results.json")
    default_report_out = Path("RAG/reports/report.md")

    parser = argparse.ArgumentParser(description="Run RAG benchmark queries from JSON.")
    parser.add_argument(
        "--input",
        "-i",
        type=Path,
        default=default_input,
        help=f"JSON 파일 경로 (기본값: {default_input})",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        default=default_json_out,
        help=f"결과 JSON 저장 경로 (기본값: {default_json_out})",
    )
    parser.add_argument(
        "--report-output",
        type=Path,
        default=default_report_out,
        help=f"리포트 Markdown 저장 경로 (기본값: {default_report_out})",
    )
    parser.add_argument("--top-k", type=int, default=5, help="검색할 컨텍스트 수 (기본 5)")
    parser.add_argument("--use-llm", action="store_true", help="LLM 요약 사용 여부")
    args = parser.parse_args()

    queries = load_queries(args.input)
    pipeline = RAGPipeline()

    results: List[Dict[str, Any]] = []
    for idx, query in enumerate(queries, start=1):
        answer, contexts = pipeline.answer_query(query, top_k=args.top_k, use_llm=args.use_llm)
        formatted: List[Dict[str, Any]] = []
        for ctx in contexts:
            snippet = (ctx.get("text", "") or "").strip().replace("\n", " ")
            formatted.append(
                {
                    "dataset": ctx.get("dataset"),
                    "source": ctx.get("source"),
                    "score": ctx.get("score"),
                    "code": ctx.get("code"),
                    "name": ctx.get("name"),
                    "chunk_id": ctx.get("chunk_id"),
                    "snippet": snippet[:400],
                }
            )
        results.append({"id": idx, "query": query, "answer": answer, "contexts": formatted})

    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    file_rows, dataset_totals = collect_dataset_stats(Path("RAG/data"))
    report_markdown = build_markdown(results, file_rows, dataset_totals)
    args.report_output.parent.mkdir(parents=True, exist_ok=True)
    args.report_output.write_text(report_markdown, encoding="utf-8")

    print(f"Saved JSON -> {args.json_output}")
    print(f"Saved report -> {args.report_output}")


if __name__ == "__main__":
    main()
