import os
import sys
from pathlib import Path

try:
  from ..server_base import run_server
except ImportError:  # pragma: no cover
  sys.path.append(str(Path(__file__).resolve().parents[1]))
  from server_base import run_server  # type: ignore


def main():
  port = int(os.environ.get("HOUSE_PORT") or os.environ.get("PORT", "8003"))
  model_id = os.environ.get("HOUSE_MODEL_ID") or os.environ.get("MODEL_ID", "Qwen/Qwen3-0.6B")
  temperature = float(os.environ.get("HOUSE_TEMP") or os.environ.get("TEMP", "0.2"))
  max_tokens = int(os.environ.get("HOUSE_MAX_NEW") or os.environ.get("MAX_NEW", "512"))
  run_server("house", port, model_id, temperature=temperature, max_tokens=max_tokens)


if __name__ == "__main__":
  main()
