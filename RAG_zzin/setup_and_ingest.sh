#!/usr/bin/env bash
# End-to-end helper for preparing the RAG_zzin index.
# 1) Optionally creates/uses a venv (default: .venv under this directory)
# 2) Installs requirements
# 3) Builds the FAISS index from data/
# 4) Optionally runs the regression queries

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: setup_and_ingest.sh [options]

Options:
  --no-venv            Use system Python instead of creating/using .venv
  --skip-install       Assume dependencies are already installed
  --skip-ingest        Skip rebuilding the FAISS index
  --run-tests          Execute RAG_zzin/tests/run_tests.py after ingest
  --data-dir PATH      Override input data directory (default: data)
  --index-dir PATH     Override vector index output dir (default: data/index)
  -h, --help           Display this help

Environment overrides:
  PYTHON        Python executable to use (default: python3)
  DATA_DIR      Effective FAISS directory (default: <index-dir>)
  INDEX_NAME    Index name (default: default)
USAGE
}

USE_VENV=1
RUN_INSTALL=1
RUN_INGEST=1
RUN_TESTS=0
DATA_PATH="data"
INDEX_PATH="data/index"

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-venv) USE_VENV=0; shift ;;
    --skip-install) RUN_INSTALL=0; shift ;;
    --skip-ingest) RUN_INGEST=0; shift ;;
    --run-tests) RUN_TESTS=1; shift ;;
    --data-dir) DATA_PATH="$2"; shift 2 ;;
    --index-dir) INDEX_PATH="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

PYTHON_BIN="${PYTHON:-python3}"
PY_CMD="${PYTHON_BIN}"

if [[ ${USE_VENV} -eq 1 ]]; then
  VENV_PATH="${SCRIPT_DIR}/.venv"
  if [[ ! -d "${VENV_PATH}" ]]; then
    echo "[setup] creating virtual environment at ${VENV_PATH}"
    "${PYTHON_BIN}" -m venv "${VENV_PATH}"
  fi
  PY_CMD="${VENV_PATH}/bin/python"
fi

if [[ ${RUN_INSTALL} -eq 1 ]]; then
  echo "[setup] upgrading pip"
  "${PY_CMD}" -m pip install --upgrade pip
  REQ_FILE="${SCRIPT_DIR}/requirements.txt"
  if [[ ! -f "${REQ_FILE}" ]]; then
    echo "[setup] requirements.txt not found at ${REQ_FILE}" >&2
    exit 1
  fi
  echo "[setup] installing dependencies from ${REQ_FILE}"
  "${PY_CMD}" -m pip install -r "${REQ_FILE}"
else
  echo "[setup] skipping dependency installation"
fi

INPUT_DIR="${SCRIPT_DIR}/${DATA_PATH}"
if [[ ${RUN_INGEST} -eq 1 ]]; then
  if [[ ! -d "${INPUT_DIR}" ]]; then
    echo "[setup] data directory not found: ${INPUT_DIR}" >&2
    exit 1
  fi
fi

export PYTHONPATH="${REPO_ROOT}:${PYTHONPATH:-}"
export DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/${INDEX_PATH}}"
export INDEX_NAME="${INDEX_NAME:-default}"

if [[ ${RUN_INGEST} -eq 1 ]]; then
  echo "[setup] building vector index (${INDEX_NAME}) from ${INPUT_DIR}"
  "${PY_CMD}" -m RAG_zzin.ingest --input "${INPUT_DIR}" "${ARGS[@]}"
else
  echo "[setup] skipping index build (DATA_DIR=${DATA_DIR})"
fi

if [[ ${RUN_TESTS} -eq 1 ]]; then
  echo "[setup] running regression queries"
  "${PY_CMD}" "${SCRIPT_DIR}/tests/run_tests.py"
fi

echo "[setup] Done."
