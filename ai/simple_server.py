#!/usr/bin/env python3
"""
Simplified Single-Server with Dynamic LoRA Swapping
Loads ONE base model and swaps LoRA adapters per request
"""
import os
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer
import uvicorn

try:
    from peft import PeftModel
    PEFT_AVAILABLE = True
except ImportError:
    PEFT_AVAILABLE = False
    print("[WARN] peft not available - LoRA swapping disabled")

app = FastAPI(title="Eco-Mento AI (Unified)", version="1.0.0")

# Global state
model = None
tokenizer = None
device = None
current_lora = None
lora_paths = {
    "eco": "./lora/eco_adapter",
    "firm": "./lora/firm_adapter",
    "house": "./lora/house_adapter",
}

def load_base_model():
    global model, tokenizer, device

    model_id = os.environ.get("MODEL_ID", "Qwen/Qwen3-0.6B")
    print(f"[AI] Loading base model: {model_id}")

    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)

    if torch.cuda.is_available():
        device = torch.device("cuda:0")
        model = AutoModelForCausalLM.from_pretrained(
            model_id,
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )
        print(f"[AI] Loaded on GPU: {torch.cuda.get_device_name(0)}")
    else:
        device = torch.device("cpu")
        model = AutoModelForCausalLM.from_pretrained(
            model_id,
            trust_remote_code=True,
        )
        print("[AI] Loaded on CPU")

    model.eval()
    print("[AI] Base model ready")

def swap_lora(lora_name: str):
    """Swap LoRA adapter (future implementation)"""
    global current_lora

    if not PEFT_AVAILABLE:
        return

    if lora_name == current_lora:
        return  # Already loaded

    # TODO: Implement PEFT adapter swapping
    # For now, just track which one is requested
    current_lora = lora_name
    print(f"[AI] Requested LoRA: {lora_name} (swapping not yet implemented)")

class ChatRequest(BaseModel):
    messages: list[dict]
    max_tokens: int = 512
    temperature: float = 0.2
    lora_name: str | None = None

@app.on_event("startup")
async def startup():
    load_base_model()

@app.post("/chat")
async def chat(req: ChatRequest):
    if model is None:
        raise HTTPException(500, "Model not loaded")

    # Swap LoRA if needed
    if req.lora_name:
        swap_lora(req.lora_name)

    # Apply chat template
    prompt = tokenizer.apply_chat_template(
        req.messages,
        tokenize=False,
        add_generation_prompt=True
    )

    # Tokenize
    inputs = tokenizer(prompt, return_tensors="pt").to(device)

    # Generate
    try:
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=req.max_tokens,
                temperature=req.temperature,
                do_sample=req.temperature > 0,
                eos_token_id=tokenizer.eos_token_id,
                pad_token_id=tokenizer.eos_token_id,
            )

        # Decode
        generated_ids = outputs[0][inputs["input_ids"].shape[-1]:]
        generated_text = tokenizer.decode(generated_ids, skip_special_tokens=True)

        return {
            "content": generated_text.strip(),
            "metrics": {
                "prompt_tokens": inputs["input_ids"].shape[-1],
                "lora": req.lora_name or "base",
            }
        }

    except Exception as e:
        raise HTTPException(500, f"Generation failed: {str(e)}")

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "device": str(device) if device else None,
        "current_lora": current_lora,
    }

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"[AI] Starting unified server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
