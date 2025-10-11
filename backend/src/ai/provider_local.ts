export type ChatMsg = { role:'system'|'user'|'assistant'; content:string };
const BASE = process.env.LOCAL_AI_BASE || 'http://localhost:8008';

export async function localGenerate(messages: ChatMsg[], opts?:{max_tokens?:number; temperature?:number}){
  const res = await fetch(`${BASE}/chat`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      messages,
      max_tokens: opts?.max_tokens ?? 512,
      temperature: opts?.temperature ?? 0.2
    })
  });
  console.log('[AI] localGenerate ->', (messages.find(m=>m.role==='user')?.content||'').slice(0,60));
  if(!res.ok) throw new Error(`LOCAL AI HTTP ${res.status}: ${await res.text()}`);
  const json:any = await res.json();
  return { content: (json.content||'').trim(), raw: json };
}