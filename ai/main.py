from __future__ import annotations
import os, signal, sys
from multiprocessing import Process, set_start_method
from typing import Dict
from server_base import run_server, register_rbln_loras
from pathlib import Path
import importlib.util
import shutil

ROLE_PORTS = {
    "eco": 8001,
    "firm": 8002,
    "house": 8003,
}

def _has_model_weights(path: Path) -> bool:
    if path.is_file():
        return path.suffix.lower() in {".bin", ".safetensors", ".pt"}
    if path.is_dir():
        required_names = {
            "pytorch_model.bin",
            "model.safetensors",
            "tf_model.h5",
            "model.ckpt.index",
            "flax_model.msgpack",
        }
        if any((path / name).exists() for name in required_names):
            return True
        if any(path.glob("*.safetensors")) or any(path.glob("pytorch_model*.bin")):
            return True
    return False


def _iter_model_candidates(model_id: str):
    # Absolute path provided → use as-is if it exists.
    path_candidate = Path(model_id)
    if path_candidate.is_absolute() and path_candidate.exists():
        yield path_candidate
        return

    # Potential roots to probe for local copies.
    roots = [
        os.environ.get("MODEL_CACHE_DIR"),
        os.environ.get("HF_HOME"),
        os.environ.get("TRANSFORMERS_CACHE"),
    ]

    base_dir = Path(__file__).resolve().parent
    roots.extend(
        [
            base_dir,
            base_dir / "models",
            base_dir.parent / "models",
            base_dir.parent,  # repo root
        ]
    )

    # De-duplicate while preserving order.
    seen = set()
    ordered_roots = []
    for root in roots:
        if not root:
            continue
        root_path = Path(root).expanduser().resolve()
        if root_path in seen:
            continue
        if root_path.exists():
            ordered_roots.append(root_path)
            seen.add(root_path)

    rel_paths = []
    try:
        rel_paths.append(Path(model_id))
    except Exception:
        pass
    rel_paths.append(Path(model_id).name if "/" in model_id else Path(model_id))

    for root in ordered_roots:
        for rel in rel_paths:
            candidate = (root / rel).resolve()
            if candidate.exists() and _has_model_weights(candidate):
                yield candidate

def resolve_local_model(model_id: str | None) -> str:
    """
    Prefer a local path for model_id when available.
    """
    if not model_id:
        return model_id or ""
    for candidate in _iter_model_candidates(model_id):
        if candidate.is_dir() or candidate.is_file():
            print(f"[AI] Using local model for {model_id}: {candidate}")
            return str(candidate)
    return model_id

def detect_device_backend():
    """
    NPU (RBLN Atom) > GPU (CUDA) > CPU 순으로 자동 감지
    """
    # 1. RBLN NPU 감지 (optimum + rbln-stat 모두 있어야 시도)
    rbln_available = False
    try:
        spec = importlib.util.find_spec("optimum")
        if spec is not None:
            rbln_available = importlib.util.find_spec("optimum.rbln") is not None
    except (ModuleNotFoundError, AttributeError, ImportError):
        pass
    rbln_stat_path = shutil.which("rbln-stat")
    if rbln_available and rbln_stat_path:
        try:
            from optimum.rbln import RBLNAutoModelForCausalLM  # noqa: F401
            import subprocess
            result = subprocess.run([rbln_stat_path], capture_output=True, text=True)
            if result.returncode == 0 and "RBLN" in result.stdout:
                print("[AI] ✅ NPU (RBLN Atom) detected, using NPU backend")
                return "rbln"
            else:
                print("[AI] NPU probe returned no RBLN device, skipping.")
        except Exception as e:
            print(f"[AI] NPU detection failed: {e}")
    else:
        print("[AI] NPU runtime not available (optimum.rbln or rbln-stat missing).")

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
    backend_env = (os.environ.get("MODEL_BACKEND") or "").strip().lower()
    if backend_env == "rbln":
        detected = detect_device_backend()
        if detected != "rbln":
            print("[AI] Requested MODEL_BACKEND=rbln but NPU not available. Falling back to torch.")
            backend = "torch"
        else:
            backend = "rbln"
    elif backend_env in {"torch", "gpu", "cuda", "cpu"}:
        backend = "torch"
    else:
        backend = detect_device_backend()

    default_model = os.environ.get("MODEL_ID", "Qwen/Qwen3-0.6B")
    default_model = resolve_local_model(default_model)

    if backend == "rbln":
        # NPU: compiled 경로 사용 (프로젝트 기준 상대 경로)
        base_dir = Path(__file__).resolve().parent
        eco_model = resolve_local_model(os.environ.get("ECO_MODEL_ID") or str(base_dir / "compiled/lora_eco_32k"))
        firm_model = resolve_local_model(os.environ.get("FIRM_MODEL_ID") or str(base_dir / "compiled/lora_firm_32k"))
        house_model = resolve_local_model(os.environ.get("HOUSE_MODEL_ID") or str(base_dir / "compiled/lora_house_32k"))

        # RBLN LoRA 등록 (핫스왑용 - 절대 경로 사용)
        register_rbln_loras({
            "eco": str(base_dir / "lora/eco_adapter"),
            "firm": str(base_dir / "lora/firm_adapter"),
            "house": str(base_dir / "lora/house_adapter"),
        })
    else:
        # GPU/CPU: 베이스 모델 + LoRA 어댑터 경로
        eco_model = resolve_local_model(os.environ.get("ECO_MODEL_ID") or default_model)
        firm_model = resolve_local_model(os.environ.get("FIRM_MODEL_ID") or default_model)
        house_model = resolve_local_model(os.environ.get("HOUSE_MODEL_ID") or default_model)

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
    try:
        set_start_method("spawn")
    except RuntimeError:
        # start method is already set (e.g., when reusing this module)
        pass
    main()
