from __future__ import annotations

import os
import signal
import sys
from multiprocessing import Process
from typing import Dict, Tuple

from server_base import run_server

ROLE_CONFIG: Tuple[Tuple[str, str, str, int], ...] = (
  ("eco", "ECO_PORT", "ECO_MODEL_ID", 8001),
  ("firm", "FIRM_PORT", "FIRM_MODEL_ID", 8002),
  ("house", "HOUSE_PORT", "HOUSE_MODEL_ID", 8003),
)


def should_trace_queries() -> bool:
  flag = os.environ.get("AI_TRACE_LOGS")
  if flag is None:
    return True
  return flag.lower() not in {"0", "false", "off", "no"}


def resolve_float(*keys: str, default: float) -> float:
  for key in keys:
    val = os.environ.get(key)
    if val is not None:
      try:
        return float(val)
      except ValueError:
        pass
  return default


def resolve_int(*keys: str, default: int) -> int:
  for key in keys:
    val = os.environ.get(key)
    if val is not None:
      try:
        return int(val)
      except ValueError:
        pass
  return default


def spawn_role(role: str, port_env: str, model_env: str, default_port: int, enable_trace: bool | None = None) -> Process:
  port = resolve_int(port_env, "PORT", default=default_port)
  model_id = (
    os.environ.get(model_env)
    or os.environ.get("MODEL_ID")
    or "Qwen/Qwen3-0.6B"
  )
  temperature = resolve_float(f"{role.upper()}_TEMP", "TEMP", default=0.2)
  max_tokens = resolve_int(f"{role.upper()}_MAX_NEW", "MAX_NEW", default=1024)
  if enable_trace is None:
    enable_trace = should_trace_queries()

  proc = Process(
    target=run_server,
    name=f"{role}-server",
    args=(role, port, model_id),
    kwargs={
      "temperature": temperature,
      "max_tokens": max_tokens,
      "enable_trace": enable_trace,
    },
    daemon=False,
  )
  proc.start()
  trace_state = "on" if enable_trace else "off"
  print(
    f"[AI-Main] launched {role} -> port {port}, model {model_id}, "
    f"temperature={temperature}, max_tokens={max_tokens}, trace={trace_state}"
  )
  return proc


def should_enable_editor() -> bool:
  flag = os.environ.get("EDITOR_ENABLED")
  if flag is None:
    return True
  return flag.lower() not in {"0", "false", "off", "no"}


def main():
  procs: Dict[str, Process] = {}

  def shutdown(_signum=None, _frame=None):
    print("[AI-Main] shutting down...")
    for role, proc in procs.items():
      if proc.is_alive():
        print(f"[AI-Main] terminating {role} (pid={proc.pid})")
        proc.terminate()
    for role, proc in procs.items():
      proc.join(timeout=5)
      if proc.is_alive():
        print(f"[AI-Main] {role} did not exit gracefully; killing.")
        proc.kill()
    sys.exit(0)

  signal.signal(signal.SIGINT, shutdown)
  signal.signal(signal.SIGTERM, shutdown)

  try:
    trace_enabled = should_trace_queries()
    trace_state = "enabled" if trace_enabled else "disabled"
    print(f"[AI-Main] query tracing is {trace_state}. Set AI_TRACE_LOGS=0 to disable.")
    for role, port_env, model_env, default_port in ROLE_CONFIG:
      procs[role] = spawn_role(role, port_env, model_env, default_port, enable_trace=trace_enabled)

    if should_enable_editor():
      port = resolve_int("EDITOR_PORT", default=8008)
      model_id = os.environ.get("EDITOR_MODEL_ID") or (
        os.environ.get("MODEL_ID") or "Qwen/Qwen3-0.6B"
      )
      temperature = resolve_float("EDITOR_TEMP", "TEMP", default=0.2)
      max_tokens = resolve_int("EDITOR_MAX_NEW", "MAX_NEW", default=512)
      proc = Process(
        target=run_server,
        name="editor-server",
        args=("editor", port, model_id),
        kwargs={
          "temperature": temperature,
          "max_tokens": max_tokens,
          "enable_trace": trace_enabled,
        },
        daemon=False,
      )
      proc.start()
      procs["editor"] = proc
      trace_state_editor = "on" if trace_enabled else "off"
      print(
        f"[AI-Main] launched editor -> port {port}, model {model_id}, "
        f"temperature={temperature}, max_tokens={max_tokens}, trace={trace_state_editor}"
      )

    for proc in procs.values():
      proc.join()
  except KeyboardInterrupt:
    shutdown()


if __name__ == "__main__":
  main()
