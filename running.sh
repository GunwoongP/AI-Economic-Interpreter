#!/usr/bin/env bash
#
# Wrapper for run.sh that evicts stale dev servers and then launches the full stack.
# Fixes the recurring "connection refused" issues that happen when watch processes
# from a previous session keep holding the service ports.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_SCRIPT="${RUN_SCRIPT:-$ROOT_DIR/run.sh}"

# Ports that must be free before we launch the stack.
PORTS=(
  "${MARKET_API_PORT:-8000}"
  "${BACKEND_PORT:-3001}"
  "${FRONTEND_PORT:-3000}"
  8001
  8002
  8003
)

log() {
  local level="$1"; shift
  printf '[running.sh] [%s] %s\n' "$level" "$*" >&2
}

usage() {
  cat <<'EOF'
Usage: ./running.sh [start|stop|status]

  start   (default) Free critical ports and exec run.sh
  stop    Terminate processes listening on the managed ports
  status  Show which processes are bound to the managed ports
EOF
}

ensure_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log ERROR "Missing required command: $cmd"
    exit 1
  fi
}

collect_pids_for_port() {
  local port="$1"
  ss -ltnp 2>/dev/null | awk -v port=":$port" '$4 ~ port {print $0}'
}

terminate_pid() {
  local pid="$1"
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  log INFO "Stopping pid=${pid}"
  kill "$pid" 2>/dev/null || true
  for _ in {1..10}; do
    sleep 0.2
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  done
  log WARN "pid=${pid} did not exit, sending SIGKILL"
  kill -9 "$pid" 2>/dev/null || true
}

free_ports() {
  declare -A seen=()
  local pid
  for port in "${PORTS[@]}"; do
    [[ -n "$port" ]] || continue
    mapfile -t lines < <(collect_pids_for_port "$port")
    for line in "${lines[@]}"; do
      while [[ "$line" =~ pid=([0-9]+) ]]; do
        pid="${BASH_REMATCH[1]}"
        line="${line#*pid=$pid}"
        if [[ -z "${seen[$pid]:-}" ]]; then
          seen["$pid"]=1
        fi
      done
    done
  done
  for pid in "${!seen[@]}"; do
    terminate_pid "$pid"
  done
}

show_status() {
  local found=0
  for port in "${PORTS[@]}"; do
    [[ -n "$port" ]] || continue
    mapfile -t lines < <(collect_pids_for_port "$port")
    if ((${#lines[@]})); then
      found=1
      for line in "${lines[@]}"; do
        log INFO "Port $port → ${line##*users:(}"
      done
    else
      log INFO "Port $port is free"
    fi
  done
  ((found)) || log INFO "No managed ports are in use."
}

ensure_command ss

cmd="${1:-start}"
case "$cmd" in
  start)
    log INFO "Ensuring all managed ports are free"
    free_ports
    log INFO "Starting stack via ${RUN_SCRIPT#$ROOT_DIR/}"
    exec "$RUN_SCRIPT"
    ;;
  stop)
    log INFO "Stopping processes bound to the managed ports"
    free_ports
    ;;
  status)
    show_status
    ;;
  -h|--help)
    usage
    ;;
  *)
    log ERROR "Unknown command: $cmd"
    usage
    exit 1
    ;;
esac
