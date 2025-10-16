#!/usr/bin/env bash

# Simplified service orchestrator for the Eco-Mentos stack.
# Responsibilities:
#   1. Start the market API, AI core, backend, and frontend.
#   2. Stream logs to logs/<service>.log.
#   3. Optionally verify the backend health endpoint and AI chat endpoint.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
PYTHON_BIN="${PYTHON_BIN:-python}"
NODE_BIN="${NODE_BIN:-npm}"

MARKET_API_HOST="${MARKET_API_HOST:-127.0.0.1}"
MARKET_API_PORT="${MARKET_API_PORT:-8000}"
MARKET_API_RELOAD="${MARKET_API_RELOAD:-1}"

BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# AI main.py launches multiple role-specific workers.
AI_CHAT_URL="${AI_CHAT_URL:-http://127.0.0.1:8001/chat}"
AI_VERIFY_PAYLOAD='{"messages":[{"role":"user","content":"ping"}]}'

VERIFY_STARTUP="${VERIFY_STARTUP:-1}"

# Bind AI services to the freshly compiled 32K LoRA models by default (can be overridden via env)
MODEL_BACKEND="${MODEL_BACKEND:-rbln}"
ECO_MODEL_ID="${ECO_MODEL_ID:-/home/elicer/yeonsup/compiled_lora_eco_32k/compiled}"
FIRM_MODEL_ID="${FIRM_MODEL_ID:-/home/elicer/yeonsup/compiled_lora_firm_32k/compiled}"
HOUSE_MODEL_ID="${HOUSE_MODEL_ID:-/home/elicer/yeonsup/compiled_lora_house_32k/compiled}"
export MODEL_BACKEND ECO_MODEL_ID FIRM_MODEL_ID HOUSE_MODEL_ID

mkdir -p "$LOG_DIR"

declare -a SERVICE_PIDS=()
declare -A PID_TO_NAME=()
declare -A NAME_TO_LOG=()

log() {
  local level="$1"; shift
  printf '[run.sh] [%s] %s\n' "$level" "$*" >&2
}

ensure_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "ERROR" "Missing required command: '$cmd'"
    exit 1
  fi
}

start_service() {
  local name="$1"
  local workdir="$2"
  shift 2
  local log_file="$LOG_DIR/${name}.log"
  NAME_TO_LOG["$name"]="$log_file"
  : > "$log_file"
  log "INFO" "Starting ${name} (log → ${log_file#$ROOT_DIR/})"
  (
    cd "$workdir"
    exec "$@"
  ) > >(stdbuf -oL tee -a "$log_file") 2>&1 &
  local pid=$!
  SERVICE_PIDS+=("$pid")
  PID_TO_NAME["$pid"]="$name"
  log "INFO" "${name} started (pid=${pid})"
}

cleanup() {
  local status=$?
  trap - EXIT SIGINT SIGTERM
  log "INFO" "Shutting down services (status=${status})"
  for pid in "${SERVICE_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      local name="${PID_TO_NAME[$pid]}"
      log "INFO" "Stopping ${name} (pid=${pid})"
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "${SERVICE_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  log "INFO" "All services stopped"
  exit "$status"
}
trap cleanup EXIT SIGINT SIGTERM

verify_backend() {
  local url="http://127.0.0.1:${BACKEND_PORT}/health"
  for attempt in {1..30}; do
    if curl -fsS "$url" >/dev/null; then
      log "INFO" "Backend health check succeeded (${url})"
      return 0
    fi
    sleep 1
  done
  log "WARN" "Backend health check failed (${url}). Check ${NAME_TO_LOG[backend]}"
  return 1
}

verify_ai_core() {
  for attempt in {1..45}; do
    if curl -fsS -H 'Content-Type: application/json' \
      -d "$AI_VERIFY_PAYLOAD" \
      "$AI_CHAT_URL" >/dev/null; then
      log "INFO" "AI core responded (${AI_CHAT_URL})"
      return 0
    fi
    sleep 2
  done
  log "WARN" "AI core did not respond (${AI_CHAT_URL}). Check ${NAME_TO_LOG[ai-core]}"
  return 1
}

ensure_command "$PYTHON_BIN"
ensure_command "$NODE_BIN"
ensure_command curl

# Service launch definitions -------------------------------------------------
MARKET_API_CMD=(
  "$PYTHON_BIN" -m uvicorn app:app
  --host "$MARKET_API_HOST"
  --port "$MARKET_API_PORT"
)
if [[ "$MARKET_API_RELOAD" != "0" ]]; then
  MARKET_API_CMD+=("--reload")
fi

start_service "market-api" "$ROOT_DIR/market_api" "${MARKET_API_CMD[@]}"

start_service "ai-core" "$ROOT_DIR/ai" \
  "$PYTHON_BIN" main.py

start_service "backend" "$ROOT_DIR/backend" \
  env PORT="$BACKEND_PORT" "$NODE_BIN" run dev

start_service "frontend" "$ROOT_DIR/frontend" \
  env PORT="$FRONTEND_PORT" "$NODE_BIN" run dev

log "INFO" "All services launched. Press Ctrl+C to stop."

if [[ "$VERIFY_STARTUP" == "1" ]]; then
  if verify_backend && verify_ai_core; then
    log "INFO" "Verification completed successfully."
  else
    log "WARN" "One or more verification steps failed."
  fi
fi

# Wait for any child to exit, then let the trap handle cleanup.
supports_wait_n=0
if (( ${BASH_VERSINFO[0]:-0} > 4 || ( ${BASH_VERSINFO[0]:-0} == 4 && ${BASH_VERSINFO[1]:-0} >= 3 ) )); then
  supports_wait_n=1
fi

if (( supports_wait_n )); then
  wait -n "${SERVICE_PIDS[@]}"
else
  for pid in "${SERVICE_PIDS[@]}"; do
    wait "$pid"
  done
fi
