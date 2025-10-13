import type { Card, Role, SeriesResp } from '../types.js';
import { localGenerate, ChatMsg } from './provider_local.js';
import { draftPrompt, editorPrompt, plannerPrompt, dailyInsightPrompt } from './prompts.js';

export async function attachAdapters(_roles: Role[]) {
  return true;
}
export async function detachAll() {
  return true;
}

type Evidence = { text: string; meta?: any; sim?: number };
export type AskRole = 'eco' | 'firm' | 'house';

function summarizeDraft(draft: Card): string {
  const body = (draft.content || '').replace(/\s+/g, ' ').slice(0, 320);
  return `[${draft.type}] ${draft.title}: ${body}`;
}

function sanitizeGenerated(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<\/?think>/gi, '');
  text = text.replace(/^(?:[\*\-]\s*)?(?:Thought|Analysis|Reasoning|Plan)\s*:.*$/gim, '');
  text = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (!/[가-힣]/.test(trimmed) && !/[\d]/.test(trimmed)) {
        return '';
      }
      return line;
    })
    .filter(Boolean)
    .join('\n');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export async function genDraft(
  role: Role,
  q: string,
  evidences: Evidence[],
  opts: { previous?: Card[] } = {},
): Promise<Card> {
  if (!['eco', 'firm', 'house'].includes(role)) {
    return { type: 'combined', title: '요약', content: 'N/A', conf: 0.5 };
  }

  const previousSummaries =
    opts.previous?.map(summarizeDraft).slice(-3) ?? [];

  const msgs = draftPrompt(
    role as any,
    q,
    evidences.map((e) => e.text),
    previousSummaries,
  ) as ChatMsg[];
  const { content } = await localGenerate(role, msgs, {
    max_tokens: 450,
    temperature: 0.2,
  });
  const cleaned = sanitizeGenerated(content) || content;

  return {
    type: role,
    title:
      role === 'eco'
        ? '거시 핵심'
        : role === 'firm'
        ? '기업 스냅샷'
        : '가계 프레임',
    content: cleaned,
    conf: 0.7,
    sources: evidences.slice(0, 3).map((e) => ({
      title: 'RAG',
      date: e.meta?.date,
      score: e.sim,
    })),
  };
}

export async function genEditor(params: {
  query: string;
  drafts: Card[];
  mode: 'parallel' | 'sequential';
}) {
  const msgs = editorPrompt(
    params.query,
    params.drafts.map((d) => `${d.title}\n${d.content}`),
    params.mode,
  ) as ChatMsg[];
  const { content } = await localGenerate('editor', msgs, {
    max_tokens: 700,
    temperature: 0.2,
  });
  const cleaned = sanitizeGenerated(content) || content;

  const blocks: string[] = cleaned.split(/\n{2,}/).slice(0, 3);
  const cards: Card[] = blocks.map((block, index) => ({
    type: index === 0 ? 'combined' : (params.drafts[index - 1]?.type ?? 'eco'),
    title:
      (block.match(/^[^\n]{2,80}/)?.[0] ??
        (index === 0 ? '통합 해석' : '보조 해석')
      ).trim(),
    content: block.replace(/^[^\n]{2,80}\n?/, '').trim() || block.trim(),
    conf: 0.75,
  }));

  if (cards.length && cards[0].type === 'combined') {
    const present = new Set(cards.slice(1).map((c) => c.type));
    params.drafts.forEach((draft) => {
      if (!present.has(draft.type)) {
        cards.push(draft);
        present.add(draft.type);
      }
    });
  }
  return { cards };
}

export interface PlanResult {
  roles: AskRole[];
  mode: 'parallel' | 'sequential';
  reason?: string;
  confidence?: number;
}

function parsePlannerResponse(raw: string): PlanResult | null {
  try {
    const text = raw.trim().replace(/^```json\s*|```$/g, '');
    const data = JSON.parse(text);
    if (!Array.isArray(data.roles) || !data.roles.length) return null;
    const roles = data.roles.filter((r: any) => r === 'eco' || r === 'firm' || r === 'house');
    if (!roles.length) return null;
    const mode = data.mode === 'sequential' ? 'sequential' : 'parallel';
    const confidence = typeof data.confidence === 'number' ? data.confidence : undefined;
    return {
      roles: Array.from(new Set(roles)) as AskRole[],
      mode,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
      confidence,
    };
  } catch {
    return null;
  }
}

export async function planRoles(params: { query: string; prefer?: Role[]; hintMode?: 'auto'|'parallel'|'sequential' }): Promise<PlanResult | null> {
  const msgs = plannerPrompt(params.query, params.prefer ?? [], params.hintMode ?? 'auto');
  try {
    const response = await localGenerate('planner', msgs, { max_tokens: 200, temperature: 0 });
    const parsed = parsePlannerResponse(response.content);
    if (!parsed) {
      console.warn('[ASK][planner] unable to parse planner response:', response.content);
    }
    return parsed ?? null;
  } catch (err) {
    console.error('[ASK][planner][ERROR]', err);
    return null;
  }
}

export async function genDailyInsight(params: {
  focus: string;
  kospi: SeriesResp;
  ixic: SeriesResp;
  news: { title: string; description: string; link?: string; pubDate?: string }[];
}) {
  const describeSeries = (series: SeriesResp) => {
    const first = series.values[0];
    const last = series.values.at(-1)!;
    const change = last.close - first.close;
    const pct = first.close ? (change / first.close) * 100 : 0;
    const direction = change > 0 ? '상승' : change < 0 ? '하락' : '보합';
    const trend = `${series.symbol} ${direction} (${change >= 0 ? '+' : ''}${change.toFixed(2)}, ${pct.toFixed(2)}%)`;
    const summary = `${series.stamp} 기준 종가 ${last.close.toFixed(2)} / ${new Date(first.t).toLocaleDateString()} 대비 ${direction}`;
    return { trend, summary };
  };

  const kospiInfo = describeSeries(params.kospi);
  const ixicInfo = describeSeries(params.ixic);
  const msgs = dailyInsightPrompt({
    focus: params.focus,
    kospi: kospiInfo,
    ixic: ixicInfo,
    news: params.news,
  }) as ChatMsg[];
  const { content } = await localGenerate('editor', msgs, { max_tokens: 400, temperature: 0.3 });
  return sanitizeGenerated(content) || content;
}
