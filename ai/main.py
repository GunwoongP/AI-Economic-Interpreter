import os, torch
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = os.environ.get("MODEL_ID", "LGAI-EXAONE/EXAONE-3.5-2.4B-Instruct")
TEMP = float(os.environ.get("TEMP", "0.2"))
MAX_NEW = int(os.environ.get("MAX_NEW", "512"))

print(f"Loading tokenizer for {MODEL_ID}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True, use_fast=True)

print(f"Loading model {MODEL_ID}...")
load_kwargs = dict(trust_remote_code=True)
if torch.cuda.is_available():
    load_kwargs.update(dict(torch_dtype=torch.float16, device_map="auto"))
model = AutoModelForCausalLM.from_pretrained(MODEL_ID, **load_kwargs)
print("Model loaded successfully.")

app = FastAPI()

class ChatIn(BaseModel):
    messages: list[dict]   # [{role:'system'|'user'|'assistant', content:str}]
    max_tokens: int = MAX_NEW
    temperature: float = TEMP

def to_prompt(msgs):
    sys = next((m["content"] for m in msgs if m.get("role")=="system"), "")
    users = "\n\n".join([m["content"] for m in msgs if m.get("role")=="user"])
    # EXAONE/인스트럭션 계열에 잘 먹는 간단 포맷
    return (f"[SYSTEM]\n{sys}\n\n" if sys else "") + f"[USER]\n{users}\n\n[ASSISTANT]\n"

@app.post("/chat")
def chat(inp: ChatIn):
    prompt = to_prompt(inp.messages)
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    out = model.generate(
        **inputs,
        max_new_tokens=inp.max_tokens,
        temperature=inp.temperature,
        do_sample=inp.temperature > 0,
        eos_token_id=tokenizer.eos_token_id,
        pad_token_id=tokenizer.eos_token_id,
    )
    text = tokenizer.decode(out[0], skip_special_tokens=True)
    # 프롬프트 부분 제거
    resp = text[len(prompt):].strip()
    return {"content": resp}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT","8008")))