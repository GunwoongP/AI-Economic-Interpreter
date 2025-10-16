from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any


def run_queries(queries: List[str], top_k: int = 3) -> Dict[str, Any]:
    """Load the RAG pipeline and execute queries."""
    root = Path(__file__).resolve().parent.parent
    eco_module = root / "Eco-Mentos2"
    data_dir = root / "data" / "news_index"

    # Ensure environment is configured before importing pipeline/config
    os.environ.setdefault("DATA_DIR", str(data_dir))
    os.environ.setdefault("INDEX_NAME", "default")

    if str(eco_module) not in sys.path:
        sys.path.insert(0, str(eco_module))

    from RAG.pipeline import RAGPipeline  # type: ignore

    pipeline = RAGPipeline()
    stats = pipeline.store.stats()

    results = []
    for query in queries:
        contexts = pipeline.retriever.retrieve(query, top_k=top_k)
        formatted = []
        for idx, ctx in enumerate(contexts, start=1):
            text = ctx.get("text", "")
            snippet = text if len(text) <= 240 else f"{text[:237]}..."
            formatted.append(
                {
                    "rank": idx,
                    "score": round(float(ctx.get("score", 0.0)), 4),
                    "source": ctx.get("source", "unknown"),
                    "chunk_id": ctx.get("chunk_id"),
                    "text": snippet,
                }
            )
        results.append({"query": query, "hits": formatted})

    return {"stats": stats, "results": results}


def to_markdown(payload: Dict[str, Any]) -> str:
    lines: List[str] = []
    stats = payload.get("stats", {})
    lines.append("# Eco-Mentos2 RAG 테스트")
    lines.append("")
    lines.append(f"- 벡터 저장소 경로: `{stats.get('path', 'unknown')}`")
    lines.append(f"- 문서 수: {stats.get('count', 0)}개")
    lines.append(f"- 차원: {stats.get('dim', 'n/a')}")
    lines.append(f"- 인덱스 타입: {stats.get('index_spec', 'n/a')} (metric={stats.get('metric', 'n/a')})")
    lines.append("")
    lines.append("## 질의별 상위 문단")
    lines.append("")

    for block in payload.get("results", []):
        lines.append(f"### {block['query']}")
        hits: List[Dict[str, Any]] = block.get("hits", [])
        if not hits:
            lines.append("- 결과 없음")
            lines.append("")
            continue
        for hit in hits:
            score = hit["score"]
            lines.append(f"- Top {hit['rank']} (score={score:.4f}) `{hit['source']}` [{hit['chunk_id']}]")
            lines.append(f"  - {hit['text']}")
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    queries = [
        "국민소득통계는 어떤 지표를 포함하나?",
        "산업연관표의 목적은 무엇인가?",
        "국민대차대조표는 무엇을 보여주지?",
        "경기판단지표에는 어떤 종류가 있나?",
        "고용 통계가 경제 분석에서 의미하는 바는?",
    ]

    payload = run_queries(queries)
    report = to_markdown(payload)

    report_path = Path(__file__).resolve().parent / "report.md"
    report_path.write_text(report, encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
