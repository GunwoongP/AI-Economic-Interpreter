from __future__ import annotations

import functools
import os
import json
import time
from pathlib import Path
from typing import Any, Iterable, Tuple

import torch
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ValidationError
from transformers import AutoModelForCausalLM, AutoTokenizer

try:  # Optional dependency for LoRA
  from peft import PeftModel
except ImportError:  # pragma: no cover
  PeftModel = None  # type: ignore

_MODEL_CACHE: dict[tuple[str, str], Tuple[AutoTokenizer, AutoModelForCausalLM, torch.device]] = {}


def _normalize_cache_key(model_id: str, lora_path: str | None) -> tuple[str, str]:
  return (model_id, str(Path(lora_path).resolve()) if lora_path else "__base__")


def _load_model(model_id: str, lora_path: str | None = None) -> Tuple[AutoTokenizer, AutoModelForCausalLM, torch.device]:
  key = _normalize_cache_key(model_id, lora_path)
  if key in _MODEL_CACHE:
    return _MODEL_CACHE[key]

  print(f"[AI] loading model {model_id} ...")
  tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True, use_fast=True)
  load_kwargs: dict = {"trust_remote_code": True}
  if torch.cuda.is_available():
    load_kwargs.update({"torch_dtype": torch.float16, "device_map": "auto"})
    model = AutoModelForCausalLM.from_pretrained(model_id, **load_kwargs)
    device = next(model.parameters()).device
  else:
    load_kwargs.update({"torch_dtype": torch.float32})
    model = AutoModelForCausalLM.from_pretrained(model_id, **load_kwargs)
    device = torch.device("cpu")
    model.to(device)

  if lora_path:
    if PeftModel is None:
      raise RuntimeError("peft 패키지가 설치되어 있지 않습니다. LoRA를 사용하려면 'pip install peft'를 실행하세요.")
    adapter_dir = Path(lora_path).expanduser().resolve()
    if not adapter_dir.exists():
      raise FileNotFoundError(f"LoRA 어댑터 디렉터리를 찾을 수 없습니다: {adapter_dir}")
    if not any((adapter_dir / name).exists() for name in ("adapter_config.json", "adapter_model.bin", "adapter_model.safetensors")):
      raise FileNotFoundError(f"LoRA 어댑터로 보이는 파일이 없습니다: {adapter_dir}")
    print(f"[AI] attaching LoRA adapter from {adapter_dir}")
    model = PeftModel.from_pretrained(model, str(adapter_dir))
    model.to(device)

  model.eval()
  _MODEL_CACHE[key] = (tokenizer, model, device)
  if lora_path:
    print(f"[AI] model {model_id} with LoRA ({lora_path}) ready on {device}.")
  else:
    print(f"[AI] model {model_id} ready on {device}.")
  return _MODEL_CACHE[key]


def _score_lora_candidate(path: Path) -> tuple[int, int]:
  parts = [p.lower() for p in path.parts]
  score = 0
  if "final" in parts:
    score += 20
  if "best" in parts:
    score += 10
  if "checkpoint" in path.name.lower():
    score -= 5
  return (score, -len(path.parts))


def guess_lora_path(role_name: str, explicit: str | None = None) -> str | None:
  """
  역할 이름과 환경변수를 바탕으로 LoRA 디렉터리를 추론한다.
  우선순위:
    1. 명시 경로(explicit)
    2. {ROLE}_LORA_PATH 환경 변수
    3. LORA_PATH 환경 변수
    4. ai/{role}/lora 하위에서 adapter_config.json이 있는 디렉터리 (final 우선)
  """
  checks = [explicit]
  env_key = f"{role_name.upper()}_LORA_PATH"
  checks.append(os.environ.get(env_key))
  checks.append(os.environ.get("LORA_PATH"))

  for item in checks:
    if not item:
      continue
    resolved = Path(item).expanduser()
    if resolved.is_dir():
      return str(resolved.resolve())
    print(f"[AI] WARN: 지정한 LoRA 경로를 찾을 수 없습니다 ({item}) — 무시합니다.")

  # default lookup inside repo
  base_dir = Path(__file__).resolve().parent / role_name / "lora"
  if base_dir.is_dir():
    adapter_dirs = []
    for adapter_file in base_dir.glob("**/adapter_config.json"):
      adapter_dirs.append(adapter_file.parent)
    if adapter_dirs:
      adapter_dirs.sort(key=_score_lora_candidate, reverse=True)
      return str(adapter_dirs[0].resolve())

  return None


def _normalize_messages(msgs: Iterable[dict]) -> list[dict]:
  normalized: list[dict] = []
  system_text = ""
  for msg in msgs:
    role = msg.get("role")
    content = msg.get("content", "")
    if not isinstance(content, str):
      content = str(content)
    if role == "system":
      system_text = content
    elif role in {"user", "assistant"}:
      normalized.append({"role": role, "content": content})
  if system_text:
    normalized.insert(0, {"role": "system", "content": system_text})
  return normalized


def build_app(
  role_name: str,
  model_id: str,
  *,
  default_temp: float,
  default_max_tokens: int,
  lora_path: str | None = None,
  enable_trace: bool = False,
) -> FastAPI:
  tokenizer, model, device = _load_model(model_id, lora_path)

  class ChatIn(BaseModel):
    messages: list[dict]
    max_tokens: int = default_max_tokens
    temperature: float = default_temp

  app = FastAPI(title=f"Eco-Mento AI ({role_name})", version="0.4.0")

  def _trace(event: str, **payload: Any) -> None:
    if not enable_trace:
      return
    flat: dict[str, Any] = {}
    for key, value in payload.items():
      if isinstance(value, (str, int, float, bool)) or value is None:
        flat[key] = value
      else:
        flat[key] = str(value)
    print(f"[AI-TRACE][{role_name}] {event} :: {json.dumps(flat, ensure_ascii=False)}")

  @app.post("/chat")
  async def chat(request: Request):
    data: ChatIn | None = None
    try:
      raw_body = await request.json()
    except Exception:
      raw_body = None

    if isinstance(raw_body, dict):
      try:
        data = ChatIn.model_validate(raw_body)
      except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    if data is None:
      raw = request.query_params.get("inp")
      if raw:
        try:
          data = ChatIn.model_validate_json(raw)
        except ValidationError as exc:  # pragma: no cover
          raise HTTPException(status_code=422, detail=exc.errors()) from exc

    if data is None:
      raise HTTPException(status_code=422, detail="Chat payload required")

    messages = _normalize_messages(data.messages)
    client = request.client
    client_host = client.host if client else "unknown"
    client_port = client.port if client else None
    last_user = ""
    for msg in reversed(messages):
      if msg.get("role") == "user":
        last_user = msg.get("content", "")
        break
    preview = (last_user or (messages[-1]["content"] if messages else ""))[:160].replace("\n", " ")
    started = time.time()
    _trace(
      "request",
      client_host=client_host,
      client_port=client_port,
      model_id=model_id,
      temperature=data.temperature,
      max_tokens=data.max_tokens,
      message_count=len(messages),
      user_preview=preview,
    )

    add_generation_prompt = not messages or messages[-1]["role"] != "assistant"
    prompt = tokenizer.apply_chat_template(
      messages,
      tokenize=False,
      add_generation_prompt=add_generation_prompt,
    )
    inputs = tokenizer(prompt, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
      out = model.generate(
        **inputs,
        max_new_tokens=data.max_tokens,
        temperature=data.temperature,
        do_sample=data.temperature > 0,
        eos_token_id=tokenizer.eos_token_id,
        pad_token_id=tokenizer.eos_token_id,
      )

    generated = out[0][inputs["input_ids"].shape[-1]:]
    text = tokenizer.decode(generated, skip_special_tokens=True).strip()
    duration_ms = int((time.time() - started) * 1000)
    _trace(
      "response",
      model_id=model_id,
      duration_ms=duration_ms,
      content_preview=text[:160].replace("\n", " "),
      content_length=len(text),
    )
    return {"content": text}

  return app


def run_server(
  role_name: str,
  port: int,
  model_id: str,
  *,
  temperature: float,
  max_tokens: int,
  host: str = "0.0.0.0",
  lora_path: str | None = None,
  enable_trace: bool = False,
):
  resolved_lora = guess_lora_path(role_name, lora_path)
  app = build_app(
    role_name,
    model_id,
    default_temp=temperature,
    default_max_tokens=max_tokens,
    lora_path=resolved_lora,
    enable_trace=enable_trace,
  )
  if resolved_lora:
    print(f"[AI] starting {role_name} server on {host}:{port} (model={model_id}, lora={resolved_lora})")
  else:
    print(f"[AI] starting {role_name} server on {host}:{port} (model={model_id})")
  uvicorn.run(app, host=host, port=port)
