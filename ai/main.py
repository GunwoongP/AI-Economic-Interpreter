from __future__ import annotations
import os, signal, sys
from multiprocessing import Process
from typing import Dict
from server_base import run_server, register_rbln_loras

ROLE_PORTS = {
    "eco": 8001,
    "firm": 8002,
    "house": 8003,
}

def main():
    # 🔧 등록: 멀티 LoRA 어댑터 (이름: 경로)
    register_rbln_loras({
        "eco": "./lora/eco_adapter",
        "firm": "./lora/firm_adapter",
        "house": "./lora/house_adapter",
    })

    procs: Dict[str, Process] = {}

    def shutdown(_sig=None, _frm=None):
        print("[AI-Main] Shutting down...")
        for p in procs.values():
            if p.is_alive():
                p.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    default_model_id = os.environ.get("MODEL_ID", "Qwen3-0.6B")
    backend = os.environ.get("MODEL_BACKEND", "rbln")

    for role, port in ROLE_PORTS.items():
        role_env_key = f"{role.upper()}_MODEL_ID"
        model_id = os.environ.get(role_env_key, default_model_id)
        p = Process(
            target=run_server,
            args=(role, port, model_id),
            kwargs={"temperature": 0.2, "max_tokens": 2048, "backend": backend},
        )
        p.start()
        procs[role] = p
        print(f"[AI-Main] launched {role} on {port}")

    for p in procs.values():
        p.join()

if __name__ == "__main__":
    main()
