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

def detect_device_backend():
    """
    NPU (RBLN Atom) > GPU (CUDA) > CPU 순으로 자동 감지
    """
    # 1. RBLN NPU 감지
    try:
        from optimum.rbln import RBLNAutoModelForCausalLM
        import subprocess
        result = subprocess.run(["rbln-stat"], capture_output=True, text=True)
        if result.returncode == 0 and "RBLN" in result.stdout:
            print("[AI] ✅ NPU (RBLN Atom) detected, using NPU backend")
            return "rbln"
    except Exception as e:
        print(f"[AI] NPU detection failed: {e}")

    # 2. GPU (CUDA) 감지
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            print(f"[AI] ✅ GPU detected: {gpu_name}, using CUDA backend")
            return "torch"
    except Exception as e:
        print(f"[AI] GPU detection failed: {e}")

    # 3. CPU fallback
    print("[AI] ⚠️  No NPU/GPU detected, falling back to CPU (slower)")
    return "torch"

def resolve_model_paths():
    """
    NPU: compiled RBLN 모델 사용
    GPU/CPU: HuggingFace 모델 + LoRA 사용
    """
    backend = os.environ.get("MODEL_BACKEND", detect_device_backend())
    default_model = os.environ.get("MODEL_ID", "Qwen/Qwen3-0.6B")

    if backend == "rbln":
        # NPU: compiled 경로 사용
        eco_model = os.environ.get("ECO_MODEL_ID", "/home/elicer/yeonsup/compiled_lora_eco_32k/compiled")
        firm_model = os.environ.get("FIRM_MODEL_ID", "/home/elicer/yeonsup/compiled_lora_firm_32k/compiled")
        house_model = os.environ.get("HOUSE_MODEL_ID", "/home/elicer/yeonsup/compiled_lora_house_32k/compiled")

        # RBLN LoRA 등록 (핫스왑용 - 현재는 컴파일 시점에 fused되지만 향후 지원 대비)
        register_rbln_loras({
            "eco": "./lora/eco_adapter",
            "firm": "./lora/firm_adapter",
            "house": "./lora/house_adapter",
        })
    else:
        # GPU/CPU: 베이스 모델 + LoRA 어댑터 경로
        eco_model = os.environ.get("ECO_MODEL_ID", default_model)
        firm_model = os.environ.get("FIRM_MODEL_ID", default_model)
        house_model = os.environ.get("HOUSE_MODEL_ID", default_model)

    return {
        "eco": eco_model,
        "firm": firm_model,
        "house": house_model,
    }, backend

def main():
    models, backend = resolve_model_paths()

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  AI Economic Interpreter - Multi-Role Server                 ║
║  Backend: {backend.upper():<50}  ║
╠══════════════════════════════════════════════════════════════╣
║  ECO   (port 8001): {models['eco'][:45]:<45}  ║
║  FIRM  (port 8002): {models['firm'][:45]:<45}  ║
║  HOUSE (port 8003): {models['house'][:45]:<45}  ║
╚══════════════════════════════════════════════════════════════╝
    """)

    procs: Dict[str, Process] = {}

    def shutdown(_sig=None, _frm=None):
        print("[AI-Main] Shutting down...")
        for p in procs.values():
            if p.is_alive():
                p.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    for role, port in ROLE_PORTS.items():
        model_id = models[role]
        p = Process(
            target=run_server,
            args=(role, port, model_id),
            kwargs={"temperature": 0.2, "max_tokens": 4096, "backend": backend},
        )
        p.start()
        procs[role] = p
        print(f"[AI-Main] ✅ Launched {role} on port {port}")

    for p in procs.values():
        p.join()

if __name__ == "__main__":
    main()
