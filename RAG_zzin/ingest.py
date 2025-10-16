from __future__ import annotations

import argparse
import glob
import os
from collections import defaultdict
from typing import Any, Dict, List

from .pipeline import RAGPipeline
from .datasets import IngestRecord, load_records_for_path
from .utils import read_text_from_file


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
            paths.extend(
                p
                for p in glob.glob(os.path.join(args.input, "**", pattern), recursive=True)
                if os.path.isfile(p)
            )
    else:
        paths = [args.input]

    chunk_false_texts: List[str] = []
    chunk_false_sources: List[str] = []
    chunk_false_metas: List[Dict[str, Any]] = []

    chunk_true_texts: List[str] = []
    chunk_true_sources: List[str] = []
    chunk_true_metas: List[Dict[str, Any]] = []

    processed = 0
    file_coverage: Dict[str, int] = defaultdict(int)
    dataset_counts: Dict[str, int] = defaultdict(int)
    skipped_paths: List[str] = []
    for path in sorted(set(paths)):
        local_records: List[IngestRecord] = load_records_for_path(path)
        if not local_records:
            fallback_text = read_text_from_file(path)
            if fallback_text.strip():
                source_file = os.path.basename(path)
                meta = {"dataset": "generic", "source_file": source_file}
                local_records = [
                    IngestRecord(
                        text=fallback_text,
                        source=source_file,
                        meta=meta,
                        chunk=True,
                    )
                ]
            else:
                skipped_paths.append(path)
                continue

        file_coverage[path] = len(local_records)
        for record in local_records:
            text = record.text.strip()
            if not text:
                continue
            dataset_name = record.meta.get("dataset", "unknown")
            dataset_counts[dataset_name] += 1
            if record.chunk:
                chunk_true_texts.append(text)
                chunk_true_sources.append(record.source)
                chunk_true_metas.append(record.meta)
            else:
                chunk_false_texts.append(text)
                chunk_false_sources.append(record.source)
                chunk_false_metas.append(record.meta)
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
    if dataset_counts:
        print("Dataset coverage:")
        for name, count in sorted(dataset_counts.items(), key=lambda item: item[0]):
            print(f"  - {name}: {count}")
    if skipped_paths:
        print("Skipped paths (no readable content):")
        for item in skipped_paths:
            print(f"  - {item}")


if __name__ == "__main__":
    main()
