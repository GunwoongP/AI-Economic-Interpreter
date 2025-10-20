#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON:-python3}"
DATA_PATH="${DATA_PATH:-data}"
VENV_PATH="${SCRIPT_DIR}/.venv"

if [[ ! -d "${VENV_PATH}" ]]; then
  echo "Creating virtual environment at ${VENV_PATH}"
  "${PYTHON_BIN}" -m venv "${VENV_PATH}"
fi

VENV_PYTHON="${VENV_PATH}/bin/python"

echo "Upgrading pip"
"${VENV_PYTHON}" -m pip install --upgrade pip

REQUIREMENTS_FILE="${SCRIPT_DIR}/requirements.txt"
if [[ ! -f "${REQUIREMENTS_FILE}" ]]; then
  echo "requirements.txt not found at ${REQUIREMENTS_FILE}" >&2
  exit 1
fi

echo "Installing dependencies from ${REQUIREMENTS_FILE}"
"${VENV_PYTHON}" -m pip install -r "${REQUIREMENTS_FILE}"

DATA_DIR="${SCRIPT_DIR}/${DATA_PATH}"
if [[ ! -d "${DATA_DIR}" ]]; then
  echo "Data directory not found: ${DATA_DIR}" >&2
  exit 1
fi

echo "Building vector index from ${DATA_DIR}"
"${VENV_PYTHON}" -m RAG.ingest --input "${DATA_DIR}"

echo "Setup complete."
