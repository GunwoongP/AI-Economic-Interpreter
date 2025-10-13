#!/usr/bin/env bash
set -euo pipefail

# Root of the Eco-Mentos project (directory containing this script)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Allow overriding the Python executable and service ports with env vars.
PYTHON_BIN="${PYTHON_BIN:-python}"
MARKET_API_HOST="${MARKET_API_HOST:-127.0.0.1}"
MARKET_API_PORT="${MARKET_API_PORT:-8000}"
# ai/main.py reads its own port configuration from environment; defaults cover development.
AI_WORKDIR="${AI_WORKDIR:-$ROOT_DIR/ai}"
BACKEND_WORKDIR="${BACKEND_WORKDIR:-$ROOT_DIR/backend}"
FRONTEND_WORKDIR="${FRONTEND_WORKDIR:-$ROOT_DIR/frontend}"
MARKET_API_WORKDIR="${MARKET_API_WORKDIR:-$ROOT_DIR/market_api}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"

mkdir -p "$LOG_DIR"

declare -a PIDS=()
declare -A PID_TO_NAME=()
declare -A NAME_TO_LOG=()

cleanup() {
  local status=$?
  trap - EXIT SIGINT SIGTERM
  echo "[run.sh] shutting down (status=$status)..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      local name="${PID_TO_NAME[$pid]}"
      echo "[run.sh] stopping ${name} (pid=$pid)"
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "${PIDS[@]}"; do
    if wait "$pid" 2>/dev/null; then
      continue
    fi
  done
  echo "[run.sh] all services stopped."
  exit "$status"
}
trap cleanup EXIT SIGINT SIGTERM

start_service() {
  local name="$1"
  local workdir="$2"
  shift 2
  local log_file="$LOG_DIR/${name}.log"
  NAME_TO_LOG["$name"]="$log_file"
  : > "$log_file"
  echo "[run.sh] starting ${name} (log: ${log_file#$ROOT_DIR/})..."
  (
    cd "$workdir"
    exec "$@"
  ) > >(stdbuf -oL tee -a "$log_file") 2>&1 &
  local pid=$!
  PIDS+=("$pid")
  PID_TO_NAME["$pid"]="$name"
  echo "[run.sh] ${name} started (pid=$pid)"
}

# --- Launch services -------------------------------------------------------

# 1. Market data API (FastAPI + uvicorn)
MARKET_API_CMD=("$PYTHON_BIN" -m uvicorn app:app --host "$MARKET_API_HOST" --port "$MARKET_API_PORT")
if [[ "${MARKET_API_RELOAD:-1}" != "0" ]]; then
  MARKET_API_CMD+=(--reload)
fi
start_service "market-api" "$MARKET_API_WORKDIR" "${MARKET_API_CMD[@]}"

# 2. AI Core (spins up eco/firm/house/[editor] workers)
start_service "ai-core" "$AI_WORKDIR" "$PYTHON_BIN" main.py

# 3. Backend (Express + TypeScript)
start_service "backend" "$BACKEND_WORKDIR" npm run dev

# 4. Frontend (Next.js)
start_service "frontend" "$FRONTEND_WORKDIR" npm run dev

echo "[run.sh] all services launched. Press Ctrl+C to stop."

set +e
supports_wait_n=0
if (( ${BASH_VERSINFO[0]:-0} > 4 || ( ${BASH_VERSINFO[0]:-0} == 4 && ${BASH_VERSINFO[1]:-0} >= 3 ) )); then
  supports_wait_n=1
fi

if (( supports_wait_n )); then
  wait -n "${PIDS[@]}"
  exit_code=$?
  failed_pid=""
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      failed_pid="$pid"
      break
    fi
  done
  if [[ -n "$failed_pid" ]]; then
    name="${PID_TO_NAME[$failed_pid]}"
    log="${NAME_TO_LOG[$name]}"
    echo "[run.sh] '${name}' exited (status=$exit_code). Check log: ${log#$ROOT_DIR/}"
  else
    echo "[run.sh] a service exited (status=$exit_code)."
  fi
  exit "$exit_code"
else
  for pid in "${PIDS[@]}"; do
    wait "$pid"
    exit_code=$?
    if (( exit_code != 0 )); then
      name="${PID_TO_NAME[$pid]}"
      log="${NAME_TO_LOG[$name]}"
      echo "[run.sh] '${name}' exited (status=$exit_code). Check log: ${log#$ROOT_DIR/}"
      exit "$exit_code"
    fi
  done
fi
