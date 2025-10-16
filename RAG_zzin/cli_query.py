from __future__ import annotations

import argparse
import json
from typing import Any, Dict, Iterable

from .pipeline import RAGPipeline


def _stringify_profile(profile: Any) -> str:
    if isinstance(profile, dict):
        items = []
        for key, value in profile.items():
            if isinstance(value, list):
                joined = ", ".join(str(v) for v in value)
                items.append(f"{key}: {joined}")
            else:
                items.append(f"{key}: {value}")
        return "; ".join(items)
    return json.dumps(profile, ensure_ascii=False) if profile is not None else ""


def format_contexts(contexts: Iterable[Dict[str, Any]]) -> str:
    lines = []
    for idx, ctx in enumerate(contexts, start=1):
        score = ctx.get("score", 0.0)
        source = ctx.get("source", "unknown")
        dataset = ctx.get("dataset", "unknown")
        segments = [f"[{idx}] ({score:.3f}) {source} | dataset={dataset}"]

        if dataset == "bok_terms":
            segments.append(f"term={ctx.get('term')} definition={ctx.get('definition')}")
        elif dataset == "econ_terms":
            segments.append(f"question={ctx.get('question')} answer={ctx.get('answer')}")
        elif dataset == "naver_terms":
            segments.append(f"name={ctx.get('name')} summary={ctx.get('summary')}")
            profile = _stringify_profile(ctx.get("profile"))
            if profile:
                segments.append(f"profile={profile}")
        elif dataset == "wise_reports":
            segments.append(
                f"market={ctx.get('market')} code={ctx.get('code')} name={ctx.get('name')}"
            )
            metrics = ctx.get("metrics")
            if isinstance(metrics, dict):
                metric_summary = ", ".join(f"{k}:{v}" for k, v in metrics.items())
                segments.append(f"metrics={metric_summary}")
        elif dataset == "document_chunks":
            page = ctx.get("page")
            section = ctx.get("section")
            chunk_id = ctx.get("chunk_id")
            descriptor_parts = []
            if page is not None:
                descriptor_parts.append(f"page={page}")
            if section:
                descriptor_parts.append(f"section={section}")
            if chunk_id:
                descriptor_parts.append(f"id={chunk_id}")
            if descriptor_parts:
                segments.append(", ".join(descriptor_parts))
            text = ctx.get("text", "").strip().replace("\n", " ")
            segments.append(text[:400])
        else:
            text = ctx.get("text", "").strip().replace("\n", " ")
            segments.append(text[:400])

        lines.append(" | ".join(segment for segment in segments if segment))
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a RAG query from the CLI")
    parser.add_argument("--question", "-q", help="Query text", default=None)
    parser.add_argument("--top-k", type=int, default=5, help="Retriever top-k (default: 5)")
    parser.add_argument("--use-llm", action="store_true", help="Use LLM for the final answer")
    args = parser.parse_args()

    question = args.question or input("Enter question: ")

    pipeline = RAGPipeline()
    answer, contexts = pipeline.answer_query(question, top_k=args.top_k, use_llm=args.use_llm)

    print("\n=== Answer ===")
    print(answer)
    print("\n=== Contexts ===")
    if contexts:
        print(format_contexts(contexts))
    else:
        print("(no contexts)")


if __name__ == "__main__":
    main()

