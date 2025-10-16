from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List


def load_pipeline() -> Any:
    root = Path(__file__).resolve().parents[2]
    eco_root = root / "Eco-Mentos2"
    data_dir = root / "data" / "combined_index"

    os.environ.setdefault("DATA_DIR", str(data_dir))
    os.environ.setdefault("INDEX_NAME", "default")

    if str(eco_root) not in sys.path:
        sys.path.insert(0, str(eco_root))

    from RAG.pipeline import RAGPipeline  # type: ignore

    return RAGPipeline()


def run_queries(pipeline: Any, queries: List[str], *, top_k: int = 3) -> Dict[str, Any]:
    stats = pipeline.store.stats()
    results: List[Dict[str, Any]] = []

    for query in queries:
        contexts = pipeline.retriever.retrieve(query, top_k=top_k)
        entries: List[Dict[str, Any]] = []
        for idx, ctx in enumerate(contexts, start=1):
            text = ctx.get("text", "")
            snippet = text if len(text) <= 260 else f"{text[:257]}..."
            entries.append(
                {
                    "rank": idx,
                    "score": round(float(ctx.get("score", 0.0)), 4),
                    "source": ctx.get("source", "unknown"),
                    "chunk_id": ctx.get("chunk_id"),
                    "text": snippet,
                }
            )
        results.append({"query": query, "hits": entries})

    return {"stats": stats, "results": results}


def to_markdown(payload: Dict[str, Any]) -> str:
    stats = payload.get("stats", {})
    lines: List[str] = []
    lines.append("# 통합 RAG 지표 테스트")
    lines.append("")
    lines.append(f"- 인덱스 경로: `{stats.get('path', 'unknown')}`")
    lines.append(f"- 문서 수: {stats.get('count', 0)}개")
    lines.append(f"- 차원: {stats.get('dim', 'n/a')}")
    lines.append(f"- 인덱스 타입: {stats.get('index_spec', 'n/a')} (metric={stats.get('metric', 'n/a')})")
    lines.append("")
    lines.append("## 질의 결과 (Top 3)")
    lines.append("")

    for block in payload.get("results", []):
        lines.append(f"### {block['query']}")
        hits: List[Dict[str, Any]] = block.get("hits", [])
        if not hits:
            lines.append("- 검색 결과 없음")
            lines.append("")
            continue
        for hit in hits:
            lines.append(
                f"- Top {hit['rank']} (score={hit['score']:.4f}) `{hit['source']}` [{hit['chunk_id']}]"
            )
            lines.append(f"  - {hit['text']}")
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    queries = [
        "국민소득통계의 주요 구성 요소는?",
        "산업연관표가 제공하는 정보는 무엇인가?",
        "가계 부채 관련 최신 뉴스 요약은?",
        "반도체 기업 실적 전망은 어떠한가?",
        "물가 지표는 정책 결정에 어떻게 활용되나?",
        "주택 시장 거래 동향은?",
        "중소기업 금융 지원 정책 변화는?",
        "소비자심리지수 추세는?",
        "에너지 시장 리스크 요인은?",
        "금융당국의 최근 규제 발표는?",
    ]

    pipeline = load_pipeline()
    payload = run_queries(pipeline, queries, top_k=3)
    report = to_markdown(payload)

    report_path = Path(__file__).resolve().parent / "report.md"
    report_path.write_text(report, encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
