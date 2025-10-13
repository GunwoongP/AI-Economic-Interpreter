import type { Role } from '../types.js';

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

type Target = Role | 'editor' | 'planner';

const FALLBACK_BASE =
  process.env.LOCAL_AI_BASE ||
  process.env.AI_BASE_URL ||
  'http://localhost:8008';

const ROLE_BASE: Record<'eco' | 'firm' | 'house' | 'editor' | 'planner', string> = {
  eco: process.env.ECO_AI_BASE || FALLBACK_BASE,
  firm: process.env.FIRM_AI_BASE || FALLBACK_BASE,
  house: process.env.HOUSE_AI_BASE || FALLBACK_BASE,
  editor: process.env.EDITOR_AI_BASE || process.env.ECO_AI_BASE || FALLBACK_BASE,
  planner: process.env.PLANNER_AI_BASE || process.env.EDITOR_AI_BASE || FALLBACK_BASE,
};

function baseFor(target: Target): string {
  if (target === 'combined') return ROLE_BASE.editor;
  if (target in ROLE_BASE) {
    return ROLE_BASE[target as keyof typeof ROLE_BASE];
  }
  return ROLE_BASE.editor;
}

export async function localGenerate(
  target: Target,
  messages: ChatMsg[],
  opts?: { max_tokens?: number; temperature?: number },
) {
  const base = baseFor(target).replace(/\/+$/, '');
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      max_tokens: opts?.max_tokens ?? 512,
      temperature: opts?.temperature ?? 0.2,
    }),
  });
  const preview = (messages.find((m) => m.role === 'user')?.content || '').slice(0, 60);
  console.log(`[AI] ${target} -> ${base} ::`, preview);
  if (!res.ok) {
    throw new Error(`LOCAL AI HTTP ${res.status} (${target}@${base}): ${await res.text()}`);
  }
  const json: any = await res.json();
  return { content: (json.content || '').trim(), raw: json };
}

export function getRoleBases(): Record<'eco' | 'firm' | 'house' | 'editor', string> {
  return {
    eco: ROLE_BASE.eco.replace(/\/+$/, ''),
    firm: ROLE_BASE.firm.replace(/\/+$/, ''),
    house: ROLE_BASE.house.replace(/\/+$/, ''),
    editor: ROLE_BASE.editor.replace(/\/+$/, ''),
  };
}
