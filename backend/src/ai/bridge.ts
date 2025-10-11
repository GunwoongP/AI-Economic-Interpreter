import type { Card, Role } from '../types.js';
import { localGenerate, ChatMsg } from './provider_local.js';
import { draftPrompt, editorPrompt } from './prompts.js';

export async function attachAdapters(_roles: Role[]) { return true; }
export async function detachAll(){ return true; }

export async function genDraft(role: Role, q: string, evidences: {text:string}[]): Promise<Card> {
  if(!['eco','firm','house'].includes(role))
    return { type:'combined', title:'요약', content:'N/A', conf:0.5 };

  const msgs = draftPrompt(role as any, q, evidences.map(e=>e.text)) as ChatMsg[];
  const { content } = await localGenerate(msgs, { max_tokens: 450, temperature: 0.2 });

  return {
    type: role,
    title: role==='eco' ? '거시 핵심' : role==='firm' ? '기업 스냅샷' : '가계 프레임',
    content,
    conf: 0.7,
    sources: evidences.slice(0,3).map((e)=>({ title:'RAG', date: e.meta?.date, score: e.sim }))
  };
}

export async function genEditor(params: { query: string; drafts: Card[] }) {
  const msgs = editorPrompt(params.query, params.drafts.map(d=>`${d.title}\n${d.content}`)) as ChatMsg[];
  const { content } = await localGenerate(msgs, { max_tokens: 700, temperature: 0.2 });

  const blocks = content.split(/\n{2,}/).slice(0,3);
  const cards: Card[] = blocks.map((b,i)=>({
    type: i===0 ? 'combined' : (params.drafts[i-1]?.type ?? 'eco'),
    title: (b.match(/^[^\n]{2,80}/)?.[0] ?? (i===0?'통합 해석':'보조 해석')).trim(),
    content: b.replace(/^[^\n]{2,80}\n?/, '').trim() || b.trim(),
    conf: 0.75
  }));
  return { cards };
}
