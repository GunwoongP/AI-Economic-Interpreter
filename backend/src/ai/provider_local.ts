import type { Role } from '../types.js';

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

type Target = Role | 'editor' | 'planner' | 'router' | 'market';

const BASE_HINT =
  process.env.LOCAL_AI_BASE ||
  process.env.AI_BASE_URL ||
  '';

const fallbackBase = (port: number) =>
  (BASE_HINT ? BASE_HINT : `http://localhost:${port}`).replace(/\/+$/, '');

const ROLE_BASE: Record<'eco' | 'firm' | 'house' | 'editor' | 'planner' | 'router' | 'market', string> = {
  eco: (process.env.ECO_AI_BASE || fallbackBase(8001)).replace(/\/+$/, ''),
  firm: (process.env.FIRM_AI_BASE || process.env.ECO_AI_BASE || fallbackBase(8002)).replace(/\/+$/, ''),
  house: (process.env.HOUSE_AI_BASE || process.env.ECO_AI_BASE || fallbackBase(8003)).replace(/\/+$/, ''),
  editor: (process.env.EDITOR_AI_BASE || process.env.ECO_AI_BASE || fallbackBase(8001)).replace(/\/+$/, ''),
  planner: (process.env.PLANNER_AI_BASE || process.env.EDITOR_AI_BASE || process.env.ECO_AI_BASE || fallbackBase(8001)).replace(/\/+$/, ''),
  router: (process.env.ROUTER_AI_BASE || process.env.PLANNER_AI_BASE || process.env.EDITOR_AI_BASE || process.env.ECO_AI_BASE || fallbackBase(8001)).replace(/\/+$/, ''),
  market: (process.env.MARKET_AI_BASE || process.env.EDITOR_AI_BASE || process.env.ECO_AI_BASE || fallbackBase(8001)).replace(/\/+$/, ''),
};

function baseFor(target: Target): string {
  if (target === 'combined') return ROLE_BASE.editor;
  if (target in ROLE_BASE) {
    return ROLE_BASE[target as keyof typeof ROLE_BASE];
  }
  return ROLE_BASE.editor;
}

type GenerateOpts = {
  max_tokens?: number;
  temperature?: number;
  loraName?: string;
};

export async function localGenerate(
  target: Target,
  messages: ChatMsg[],
  opts?: GenerateOpts,
) {
  const base = baseFor(target).replace(/\/+$/, '');
  const payload: Record<string, unknown> = {
    messages,
    max_tokens: opts?.max_tokens ?? 512,
    temperature: opts?.temperature ?? 0.2,
  };
  if (opts?.loraName) {
    payload.lora_name = opts.loraName;
  }
  const endpoint = `${base}/chat`;
  const loraLabel = opts?.loraName ? ` lora=${opts.loraName}` : '';
  console.log(`[AI][request] target=${target} url=${endpoint}${loraLabel}
${JSON.stringify(payload, null, 2)}`);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log(`[AI][response] target=${target} status=${res.status} url=${endpoint}
${responseText}`);

  if (!res.ok) {
    throw new Error(`LOCAL AI HTTP ${res.status} (${target}@${base}): ${responseText}`);
  }

  let json: any = {};
  try {
    json = responseText ? JSON.parse(responseText) : {};
  } catch (err) {
    throw new Error(`LOCAL AI JSON parse failed (${target}@${base}): ${(err as Error).message}
${responseText}`);
  }
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
