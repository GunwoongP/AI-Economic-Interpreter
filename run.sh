#!/usr/bin/env bash

# Resilient service orchestrator for the Eco-Mentor stack.
# Improvements over the previous script:
#   - Per-service enable/disable via environment flags.
#   - Port preflight checks (skip launch if something is already listening).
#   - Allows externally managed services (e.g., AI core launched manually).
#   - Logs child exits without immediately tearing down the whole stack.
#   - Optional health verification paths for managed and external services.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
PYTHON_BIN="${PYTHON_BIN:-python}"
NODE_BIN="${NODE_BIN:-npm}"

mkdir -p "$LOG_DIR"

log() {
  local level="$1"; shift
  printf '[run.sh] [%s] %s\n' "$level" "$*" >&2
}

# --------------------------------------------------------------------------- #
# Configuration switches (1 = enabled, 0 = disabled)
# --------------------------------------------------------------------------- #
ENABLE_MARKET_API="${ENABLE_MARKET_API:-1}"
ENABLE_AI_CORE="${ENABLE_AI_CORE:-1}"
ENABLE_FAISS="${ENABLE_FAISS:-1}"
ENABLE_BACKEND="${ENABLE_BACKEND:-1}"
ENABLE_FRONTEND="${ENABLE_FRONTEND:-1}"

MARKET_API_HOST="${MARKET_API_HOST:-127.0.0.1}"
MARKET_API_PORT="${MARKET_API_PORT:-8000}"
MARKET_API_RELOAD="${MARKET_API_RELOAD:-1}"

BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

AI_CHAT_PORT="${AI_CHAT_PORT:-8001}"
AI_CHAT_URL="${AI_CHAT_URL:-http://127.0.0.1:${AI_CHAT_PORT}/chat}"
AI_VERIFY_PAYLOAD='{"messages":[{"role":"user","content":"ping"}]}'

FAISS_PORT="${FAISS_PORT:-8004}"

VERIFY_STARTUP="${VERIFY_STARTUP:-1}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-30}"

# --------------------------------------------------------------------------- #
# AI backend auto-detection (same logic as before)
# --------------------------------------------------------------------------- #
MODEL_BACKEND="${MODEL_BACKEND:-auto}"
if [[ "$MODEL_BACKEND" == "auto" ]]; then
  if command -v rbln-stat >/dev/null 2>&1 && rbln-stat 2>/dev/null | grep -q "RBLN"; then
    log INFO "NPU (RBLN) detected, using compiled models"
    MODEL_BACKEND="rbln"
    ECO_MODEL_ID="${ECO_MODEL_ID:-/home/elicer/yeonsup/compiled_lora_eco_32k/compiled}"
    FIRM_MODEL_ID="${FIRM_MODEL_ID:-/home/elicer/yeonsup/compiled_lora_firm_32k/compiled}"
    HOUSE_MODEL_ID="${HOUSE_MODEL_ID:-/home/elicer/yeonsup/compiled_lora_house_32k/compiled}"
  else
    log INFO "No NPU detected, using GPU/CPU with HuggingFace models"
    MODEL_BACKEND="torch"
    ECO_MODEL_ID="${ECO_MODEL_ID:-Qwen/Qwen3-0.6B}"
    FIRM_MODEL_ID="${FIRM_MODEL_ID:-Qwen/Qwen3-0.6B}"
    HOUSE_MODEL_ID="${HOUSE_MODEL_ID:-Qwen/Qwen3-0.6B}"
  fi
fi

export MODEL_BACKEND ECO_MODEL_ID FIRM_MODEL_ID HOUSE_MODEL_ID

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

service_pids=()
service_names=()
external_services=()

ensure_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log ERROR "Missing required command: $cmd"
    exit 1
  fi
}

ensure_command "$PYTHON_BIN"
ensure_command "$NODE_BIN"
ensure_command curl

port_in_use() {
  local port="$1"
  if lsof -i TCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

register_external() {
  local name="$1"
  external_services+=("$name")
  log INFO "$name is already running (external). Will not manage this process."
}

start_managed_service() {
  local name="$1"; shift
  local workdir="$1"; shift
  local port_hint="${1:-}"; shift || true
  local log_file="$LOG_DIR/${name}.log"

  if [[ -n "$port_hint" ]]; then
    if port_in_use "$port_hint"; then
      register_external "$name"
      return
    fi
  fi

  NAME_TO_LOG["$name"]="$log_file"
  : > "$log_file"
  log INFO "Starting $name (log → ${log_file#$ROOT_DIR/})"
  (
    cd "$workdir"
    exec "$@"
  ) > >(stdbuf -oL tee -a "$log_file") 2>&1 &
  local pid=$!
  service_pids+=("$pid")
  service_names+=("$name")
  log INFO "$name started (pid=$pid)"
}

cleanup() {
  local status=$?
  trap - EXIT SIGINT SIGTERM
  log INFO "Shutting down managed services (status=$status)"
  for i in "${!service_pids[@]}"; do
    local pid="${service_pids[$i]}"
    local name="${service_names[$i]}"
    if kill -0 "$pid" >/dev/null 2>&1; then
      log INFO "Stopping $name (pid=$pid)"
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  for pid in "${service_pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  log INFO "All managed services stopped"
  exit "$status"
}
trap cleanup EXIT SIGINT SIGTERM

wait_for_children() {
  if ((${#service_pids[@]} == 0)); then
    log INFO "No managed services started. Press Ctrl+C to exit."
    while true; do sleep 60; done
  fi

  log INFO "Monitoring managed services..."
  while ((${#service_pids[@]} > 0)); do
    set +e
    wait -n "${service_pids[@]}"
    local exit_code=$?
    set -e

    if ((exit_code == 127)); then
      # No more children
      break
    fi

    # Identify which process exited
    for i in "${!service_pids[@]}"; do
      local pid="${service_pids[$i]}"
      if ! kill -0 "$pid" 2>/dev/null; then
        local name="${service_names[$i]}"
        log WARN "Service '$name' exited (pid=$pid, code=$exit_code)"
        unset 'service_pids[i]'
        unset 'service_names[i]'
      fi
    done

    # Rebuild arrays to avoid sparse indexes
    service_pids=("${service_pids[@]}")
    service_names=("${service_names[@]}")
  done
  log INFO "No more managed services running."
}

verify_http_service() {
  local label="$1"
  local url="$2"
  local timeout="${3:-$HEALTH_TIMEOUT}"

  for ((attempt=1; attempt<=timeout; attempt++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log INFO "Health check succeeded for $label ($url)"
      return 0
    fi
    sleep 1
  done
  log WARN "Health check failed for $label ($url) after ${timeout}s"
  return 1
}

verify_ai_chat() {
  local url="$1"
  for ((attempt=1; attempt<=45; attempt++)); do
    if curl -fsS -H 'Content-Type: application/json' \
      -d "$AI_VERIFY_PAYLOAD" \
      "$url" >/dev/null 2>&1; then
      log INFO "AI core responded ($url)"
      return 0
    fi
    sleep 2
  done
  log WARN "AI core did not respond ($url) after retries"
  return 1
}

# --------------------------------------------------------------------------- #
# Launch services (respect toggles and port preflight)
# --------------------------------------------------------------------------- #

declare -A NAME_TO_LOG=()

if [[ "$ENABLE_MARKET_API" == "1" ]]; then
  declare -a market_cmd=(
    "$PYTHON_BIN" -m uvicorn app:app
    --host "$MARKET_API_HOST"
    --port "$MARKET_API_PORT"
  )
  if [[ "$MARKET_API_RELOAD" != "0" ]]; then
    market_cmd+=(--reload)
  fi
  start_managed_service "market-api" "$ROOT_DIR/market_api" "$MARKET_API_PORT" "${market_cmd[@]}"
else
  log INFO "market-api disabled (ENABLE_MARKET_API=0)"
fi

if [[ "$ENABLE_AI_CORE" == "1" ]]; then
  start_managed_service "ai-core" "$ROOT_DIR/ai" "$AI_CHAT_PORT" \
    "$PYTHON_BIN" main.py
else
  log INFO "ai-core disabled (ENABLE_AI_CORE=0). Assuming external instance."
fi

if [[ "$ENABLE_FAISS" == "1" ]]; then
  start_managed_service "faiss-rag" "$ROOT_DIR/ai" "$FAISS_PORT" \
    "$PYTHON_BIN" main_faiss.py --host 0.0.0.0 --port "$FAISS_PORT"
else
  log INFO "faiss-rag disabled (ENABLE_FAISS=0)"
fi

if [[ "$ENABLE_BACKEND" == "1" ]]; then
  start_managed_service "backend" "$ROOT_DIR/backend" "$BACKEND_PORT" \
    env PORT="$BACKEND_PORT" "$NODE_BIN" run dev
else
  log INFO "backend disabled (ENABLE_BACKEND=0)"
fi

if [[ "$ENABLE_FRONTEND" == "1" ]]; then
  start_managed_service "frontend" "$ROOT_DIR/frontend" "$FRONTEND_PORT" \
    env PORT="$FRONTEND_PORT" "$NODE_BIN" run dev
else
  log INFO "frontend disabled (ENABLE_FRONTEND=0)"
fi

# --------------------------------------------------------------------------- #
# Optional health verification
# --------------------------------------------------------------------------- #
if [[ "$VERIFY_STARTUP" == "1" ]]; then
  log INFO "Verifying service readiness..."

  if [[ "$ENABLE_BACKEND" == "1" || " ${external_services[*]} " == *" backend "* ]]; then
    verify_http_service "backend" "http://127.0.0.1:${BACKEND_PORT}/health" || true
  fi

  if [[ "$ENABLE_AI_CORE" == "1" || " ${external_services[*]} " == *" ai-core "* ]]; then
    verify_ai_chat "$AI_CHAT_URL" || true
  fi

  if [[ "$ENABLE_FAISS" == "1" || " ${external_services[*]} " == *" faiss-rag "* ]]; then
    verify_http_service "faiss-rag" "http://127.0.0.1:${FAISS_PORT}/health" || true
  fi
fi

if ((${#external_services[@]})); then
  log INFO "External services detected: ${external_services[*]}"
fi

log INFO "All startup commands issued. Managed services: ${service_names[*]}"
log INFO "Press Ctrl+C to stop managed services."

wait_for_children
