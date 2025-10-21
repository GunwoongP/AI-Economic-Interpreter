from __future__ import annotations
import os, json, time
from pathlib import Path
from threading import Thread
from typing import Any, Iterable, Tuple
import torch
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ValidationError
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer

try:
    from peft import PeftModel
except ImportError:
    PeftModel = None

try:
    from optimum.rbln import RBLNAutoModelForCausalLM
except ImportError:
    RBLNAutoModelForCausalLM = None

_MODEL_CACHE: dict[str, Any] = {}
_RBLN_SENTINEL_FILES = ("prefill.rbln", "decoder_batch_1.rbln")

# 🔧 새: 여러 LoRA 모듈 사전
_RBLN_LORA_MODULES: dict[str, str] = {}

def _detect_rbln_directory(model_id: str) -> bool:
    d = Path(model_id)
    return d.is_dir() and all((d / n).exists() for n in _RBLN_SENTINEL_FILES)

def _resolve_backend(model_id: str, requested: str | None = None) -> str:
    if requested and requested.lower() == "torch":
        return "torch"
    if RBLNAutoModelForCausalLM and _detect_rbln_directory(model_id):
        return "rbln"
    return "torch"

def _load_rbln_model(model_id: str) -> Any:
    print(f"[AI] Loading RBLN model: {model_id}")
    tok = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
    model = RBLNAutoModelForCausalLM.from_pretrained(model_id, export=False)
    try:
        model.eval()
    except AttributeError:
        # 일부 RBLN wrapper는 eval() 호출 시 HF PreTrainedModel 속성을 기대한다.
        # 이미 추론 전용으로 로드되므로 학습 모드 전환을 건너뛴다.
        pass
    return tok, model, torch.device("cpu")

def register_rbln_loras(lora_map: dict[str, str]):
    """사전으로 여러 LoRA adapter 등록"""
    global _RBLN_LORA_MODULES
    _RBLN_LORA_MODULES = {k: str(Path(v).resolve()) for k, v in lora_map.items()}
    print(f"[AI] Registered {len(_RBLN_LORA_MODULES)} LoRA modules for RBLN: {list(_RBLN_LORA_MODULES.keys())}")

def build_app(
    role_name: str,
    model_id: str,
    *,
    default_temp: float,
    default_max_tokens: int,
    backend: str,
    enable_trace: bool = False,
) -> FastAPI:
    if backend == "rbln":
        tokenizer, model, device = _load_rbln_model(model_id)
    else:
        tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        if torch.cuda.is_available():
            model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype=torch.float16, device_map="auto")
            device = next(model.parameters()).device
        else:
            model = AutoModelForCausalLM.from_pretrained(model_id)
            device = torch.device("cpu")

    class ChatIn(BaseModel):
        messages: list[dict]
        max_tokens: int = default_max_tokens
        temperature: float = default_temp
        lora_name: str | None = None  # 🔧 추가

    app = FastAPI(title=f"Eco-Mentos AI ({role_name})", version="0.5.0")

    @app.post("/chat")
    async def chat(req: Request):
        body = await req.json()
        data = ChatIn.model_validate(body)
        msgs = data.messages
        add_prompt = not msgs or msgs[-1]["role"] != "assistant"
        prompt = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=add_prompt)
        inputs = tokenizer(prompt, return_tensors="pt").to(device)
        prompt_len = int(inputs["input_ids"].shape[-1])

        # 🔧 RBLN 백엔드의 LoRA hot-swap 처리
        if backend == "rbln" and data.lora_name:
            lora_dir = _RBLN_LORA_MODULES.get(data.lora_name)
            if lora_dir:
                if hasattr(model, "set_active_lora"):
                    print(f"[AI] Using RBLN-LoRA adapter: {data.lora_name} ({lora_dir})")
                    model.set_active_lora(data.lora_name)  # vllm-rbln PR #48 기능
                else:
                    print(f"[AI-WARN] Backend lacks set_active_lora; using fused weights only ({data.lora_name}).")
            else:
                print(f"[AI-WARN] Unknown lora_name={data.lora_name}, base model only.")

        metrics: dict[str, Any] = {"prompt_tokens": prompt_len}
        t_start = time.perf_counter()

        base_kwargs = dict(
            **inputs,
            max_new_tokens=data.max_tokens,
            temperature=data.temperature,
            do_sample=data.temperature > 0,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.eos_token_id,
        )

        try:
            streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
            stream_kwargs = {**base_kwargs, "streamer": streamer}
            pieces: list[str] = []
            first_token_at: float | None = None

            def _run_generate():
                with torch.no_grad():
                    model.generate(**stream_kwargs)

            worker = Thread(target=_run_generate)
            worker.start()
            try:
                for piece in streamer:
                    if not piece:
                        continue
                    now = time.perf_counter()
                    if first_token_at is None:
                        first_token_at = now
                    pieces.append(piece)
            finally:
                worker.join()

            generated_text = "".join(pieces).strip()
            t_end = time.perf_counter()

            total_ms = (t_end - t_start) * 1000.0
            ttft_ms = ((first_token_at - t_start) * 1000.0) if first_token_at else total_ms
            decode_ms = ((t_end - first_token_at) * 1000.0) if first_token_at else total_ms

            metrics.update(
                {
                    "ttft_ms": ttft_ms,
                    "decode_ms": decode_ms,
                    "total_ms": total_ms,
                }
            )

            if generated_text:
                gen_ids = tokenizer(
                    generated_text,
                    add_special_tokens=False,
                    return_tensors="pt",
                )["input_ids"][0]
                gen_tokens = int(gen_ids.shape[-1])
            else:
                gen_tokens = 0
            metrics["tokens"] = gen_tokens
            decode_sec = (decode_ms / 1000.0) if decode_ms else (total_ms / 1000.0)
            if decode_sec and decode_sec > 0:
                metrics["tps"] = gen_tokens / decode_sec

            return {"content": generated_text, "metrics": metrics}
        except Exception as err:
            print(f"[AI-WARN] Streaming generation failed ({err}); reverting to blocking mode.")
            with torch.no_grad():
                out = model.generate(**base_kwargs)
            generated = out[0]
            generated_text = tokenizer.decode(
                generated[prompt_len:], skip_special_tokens=True
            ).strip()
            t_end = time.perf_counter()
            total_ms = (t_end - t_start) * 1000.0
            gen_tokens = int(generated.shape[-1] - prompt_len)
            metrics.update(
                {
                    "ttft_ms": total_ms,
                    "total_ms": total_ms,
                    "decode_ms": total_ms,
                    "tokens": max(gen_tokens, 0),
                }
            )
            duration = t_end - t_start
            if duration > 0:
                metrics["tps"] = metrics["tokens"] / duration
            return {"content": generated_text, "metrics": metrics}

    return app

def run_server(role: str, port: int, model_id: str, *, temperature: float, max_tokens: int, backend: str):
    app = build_app(role, model_id, default_temp=temperature, default_max_tokens=max_tokens, backend=backend)
    print(f"[AI] Starting {role} on port {port} (backend={backend})")
    uvicorn.run(app, host="0.0.0.0", port=port)
