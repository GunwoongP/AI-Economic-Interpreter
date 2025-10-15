from __future__ import annotations

import argparse
import glob
import json
import os
from typing import Any, Dict, List

from .pipeline import RAGPipeline
from .utils import read_text_from_file


def _record(text: str, source: str, meta: Dict[str, Any], *, chunk: bool = False) -> Dict[str, Any]:
    return {
        "text": text.strip(),
        "source": source,
        "meta": meta,
        "chunk": chunk,
    }


def _load_records(path: str) -> List[Dict[str, Any]]:
    base = os.path.basename(path)
    base_lower = base.lower()

    if base_lower == "bok_terms_full.jsonl":
        records: List[Dict[str, Any]] = []
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                term = obj.get("term")
                definition = obj.get("definition")
                if not term or not definition:
                    continue
                text = f"{term}\n{definition}"
                meta = {
                    "dataset": "bok_terms",
                    "term": term,
                    "definition": definition,
                    "source_file": base,
                }
                records.append(_record(text, base, meta))
        return records

    if base_lower.startswith("hangkookeconterms"):
        records: List[Dict[str, Any]] = []
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            try:
                data = json.load(fh)
            except Exception:
                return records
        if isinstance(data, list):
            for entry in data:
                if not isinstance(entry, dict):
                    continue
                question = entry.get("question")
                answer = entry.get("answer")
                if not question or not answer:
                    continue
                text = f"{question}\n{answer}"
                meta = {
                    "dataset": "econ_terms",
                    "question": question,
                    "answer": answer,
                    "title": entry.get("title"),
                    "url": entry.get("url"),
                    "source_file": base,
                }
                records.append(_record(text, base, meta))
        return records

    if base_lower.startswith("maileconterms"):
        records: List[Dict[str, Any]] = []
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            try:
                data = json.load(fh)
            except Exception:
                return records
        if isinstance(data, list):
            for entry in data:
                if not isinstance(entry, dict):
                    continue
                question = entry.get("question")
                answer = entry.get("answer")
                if not question or not answer:
                    continue
                text = f"{question}\n{answer}"
                meta = {
                    "dataset": "econ_terms",
                    "question": question,
                    "answer": answer,
                    "title": entry.get("title"),
                    "url": entry.get("url"),
                    "source_file": base,
                }
                records.append(_record(text, base, meta))
        return records

    if base_lower.startswith("naver_terms"):
        records: List[Dict[str, Any]] = []
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            try:
                data = json.load(fh)
            except Exception:
                return records
        if isinstance(data, list):
            for entry in data:
                if not isinstance(entry, dict):
                    continue
                name = entry.get("name")
                summary = entry.get("summary")
                if not name or not summary:
                    continue
                text = f"{name}\n{summary}"
                meta = {
                    "dataset": "naver_terms",
                    "name": name,
                    "summary": summary,
                    "profile": entry.get("profile"),
                    "url": entry.get("url"),
                    "source_file": base,
                }
                records.append(_record(text, base, meta))
        return records

    if base_lower.startswith("wisereport_all"):
        records: List[Dict[str, Any]] = []
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            try:
                data = json.load(fh)
            except Exception:
                return records
        if isinstance(data, list):
            for entry in data:
                if not isinstance(entry, dict):
                    continue
                market = entry.get("market")
                code = entry.get("code")
                name = entry.get("name")
                if not market or not code or not name:
                    continue
                metrics = entry.get("metrics") or {}
                metric_text = (
                    " | ".join(f"{k}: {v}" for k, v in metrics.items())
                    if isinstance(metrics, dict)
                    else ""
                )
                text = f"{market} {code} {name}\n{metric_text}".strip()
                meta = {
                    "dataset": "wise_reports",
                    "market": market,
                    "code": code,
                    "name": name,
                    "metrics": metrics,
                    "reports": entry.get("reports"),
                    "source_file": base,
                }
                records.append(_record(text, base, meta))
        return records

    if base_lower.endswith(".jsonl"):
        records = []
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            for idx, line in enumerate(fh):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if not isinstance(obj, dict):
                    continue

                text = ""
                for key in ("text", "content", "summary", "body", "description"):
                    value = obj.get(key)
                    if isinstance(value, str) and value.strip():
                        text = value.strip()
                        break
                if not text:
                    continue

                meta = {
                    "dataset": "jsonl_generic",
                    "source_file": base,
                    "index": idx,
                }
                if "title" in obj and isinstance(obj["title"], str):
                    meta["title"] = obj["title"].strip()
                if "source" in obj and isinstance(obj["source"], str):
                    meta["source"] = obj["source"].strip()
                if "page" in obj:
                    meta["page"] = obj["page"]
                if "chunk_id" in obj:
                    meta["chunk_id"] = obj["chunk_id"]
                if "tags" in obj and isinstance(obj["tags"], list):
                    meta["tags"] = obj["tags"]

                records.append(_record(text, base, meta))
        if records:
            return records

    fallback_text = read_text_from_file(path)
    if not fallback_text:
        return []
    meta = {"dataset": "generic", "source_file": base}
    return [_record(fallback_text, base, meta, chunk=True)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build vector index for the RAG pipeline")
    parser.add_argument("--input", required=True, help="File or directory to ingest")
    parser.add_argument(
        "--pattern",
        default="*.pdf,*.txt,*.md,*.json,*.jsonl",
        help="Glob pattern when ingesting a directory (comma separated)",
    )
    args = parser.parse_args()

    pipeline = RAGPipeline()

    if os.path.isdir(args.input):
        patterns = [item.strip() for item in args.pattern.split(",") if item.strip()]
        paths: List[str] = []
        for pattern in patterns:
            paths.extend(glob.glob(os.path.join(args.input, "**", pattern), recursive=True))
    else:
        paths = [args.input]

    chunk_false_texts: List[str] = []
    chunk_false_sources: List[str] = []
    chunk_false_metas: List[Dict[str, Any]] = []

    chunk_true_texts: List[str] = []
    chunk_true_sources: List[str] = []
    chunk_true_metas: List[Dict[str, Any]] = []

    processed = 0
    for path in sorted(set(paths)):
        for record in _load_records(path):
            text = record.get("text", "").strip()
            if not text:
                continue
            source = record.get("source") or os.path.basename(path)
            meta = record.get("meta") or {}
            if record.get("chunk"):
                chunk_true_texts.append(text)
                chunk_true_sources.append(source)
                chunk_true_metas.append(meta)
            else:
                chunk_false_texts.append(text)
                chunk_false_sources.append(source)
                chunk_false_metas.append(meta)
            processed += 1

    added = 0
    if chunk_false_texts:
        added += pipeline.add_texts(
            chunk_false_texts,
            sources=chunk_false_sources,
            metas=chunk_false_metas,
            chunk=False,
        )
    if chunk_true_texts:
        added += pipeline.add_texts(
            chunk_true_texts,
            sources=chunk_true_sources,
            metas=chunk_true_metas,
            chunk=True,
        )

    stats = pipeline.store.stats()
    print(f"Documents processed: {processed}")
    print(f"Added chunks: {added}")
    print(f"Index: {stats}")


if __name__ == "__main__":
    main()
