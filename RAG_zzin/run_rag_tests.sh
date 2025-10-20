#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Allow callers to skip ingestion by passing --skip-ingest.
RUN_INGEST=1
if [[ "${1-}" == "--skip-ingest" ]]; then
  RUN_INGEST=0
  shift
fi

export PYTHONPATH="${PYTHONPATH:-${REPO_ROOT}}"
export DATA_DIR="${DATA_DIR:-${REPO_ROOT}/RAG_zzin/data/index}"
export INDEX_NAME="${INDEX_NAME:-default}"

if [[ ${RUN_INGEST} -eq 1 ]]; then
  echo "[run_rag_tests] Rebuilding index at ${DATA_DIR}"
  python -m RAG_zzin.ingest --input "${REPO_ROOT}/RAG_zzin/data" "$@"
else
  echo "[run_rag_tests] Skipping ingestion (DATA_DIR=${DATA_DIR})"
fi

echo "[run_rag_tests] Running query regression tests"
python "${REPO_ROOT}/RAG_zzin/tests/run_tests.py"
