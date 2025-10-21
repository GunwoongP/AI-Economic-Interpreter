import type { Card, Role } from '../types.js';
import { localGenerate, ChatMsg, ProviderMetrics } from './provider_local.js';
import { draftPrompt, editorPrompt, routerPrompt, type PromptEvidence } from './prompts.js';

export type AskRole = 'eco' | 'firm' | 'house';

const ROLE_LORA_NAMES: Record<AskRole, string> = {
  eco: 'eco',
  firm: 'firm',
  house: 'house',
};

function resolveMaxTokens(value: string | undefined, fallback: number): number {
  if (value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(Math.floor(parsed), 8192);
    }
  }
  return fallback;
}

const ROLE_MAX_TOKENS = resolveMaxTokens(
  process.env.ASK_ROLE_MAX_TOKENS ?? process.env.ASK_MAX_TOKENS,
  4096,
);

const EDITOR_MAX_TOKENS = resolveMaxTokens(
  process.env.ASK_EDITOR_MAX_TOKENS ?? process.env.ASK_MAX_TOKENS,
  4096,
);

const ATTACHED_ROLES = new Set<AskRole>();

export async function attachAdapters(roles: Role[]) {
  ATTACHED_ROLES.clear();
  roles.forEach((role) => {
    if (role === 'eco' || role === 'firm' || role === 'house') {
      ATTACHED_ROLES.add(role);
    }
  });
  return true;
}
export async function detachAll() {
  ATTACHED_ROLES.clear();
  return true;
}

function resolveLoraName(role: Role): string | undefined {
  if (role === 'eco' || role === 'firm' || role === 'house') {
    return ROLE_LORA_NAMES[role];
  }
  return undefined;
}

export type Evidence = {
  text: string;
  meta?: any;
  sim?: number;
  label?: string;
  source?: string;
  date?: string;
};
function sanitizeGenerated(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<\/?think>/gi, '');
  text = text
    .replace(/\(모순\/중복[^)]*\)/gi, '')
    .replace(/모순\/중복[^)\n]*\)?/gi, '')
    .replace(/반증\/리스크[^)\n]*\)?/gi, '')
    .replace(/투자권유 금지[^)\n]*\)?/gi, '');
  text = text.replace(/^(?:[\*\-]\s*)?(?:Thought|Analysis|Reasoning|Plan)\s*:.*$/gim, '');
  text = text.replace(/RAG#/gi, '근거');
  text = text.replace(/근거\s*#?(\d+)/gi, '[$1]');
  const seen = new Set<string>();
  text = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/모순\/중복|반증|투자권유 금지/i.test(trimmed)) return '';
      const cleaned = trimmed.replace(/^제목:\s*/i, '');
      if (!/[가-힣]/.test(cleaned) && !/[\d]/.test(cleaned)) {
        return '';
      }
      const canonical = cleaned.replace(/\s+/g, ' ').toLowerCase();
      if (seen.has(canonical)) return '';
      seen.add(canonical);
      return cleaned;
    })
    .filter(Boolean)
    .join('\n');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export async function genDraft(
  role: Role,
  q: string,
  evidences: Evidence[],
  opts: { previous?: Card[]; temperature?: number } = {},
): Promise<Card> {
  if (!['eco', 'firm', 'house'].includes(role)) {
    return { type: 'combined', title: '요약', content: 'N/A', conf: 0.5 };
  }

  const previousCards = opts.previous?.slice(-3);
  const temperature = opts.temperature ?? 0.2;

  const promptEvidences: PromptEvidence[] = evidences.slice(0, 2).map((e, idx) => {
    const meta = (e.meta && typeof e.meta === 'object') ? (e.meta as Record<string, unknown>) : {};
    const sourceCandidate =
      e.source && e.source.trim().length
        ? e.source.trim()
        : (typeof meta.title === 'string' && meta.title.trim().length
            ? meta.title.trim()
            : typeof meta.source === 'string' && meta.source.trim().length
            ? meta.source.trim()
            : undefined);
    const dateCandidate = e.date && e.date.trim().length
      ? e.date.trim()
      : typeof meta.date === 'string' && meta.date.trim().length
      ? meta.date.trim()
      : undefined;
    return {
      label: e.label ?? `근거${idx + 1}`,
      text: e.text,
      source: sourceCandidate,
      date: dateCandidate,
    };
  });

  const msgs = draftPrompt(role as any, q, promptEvidences, previousCards) as ChatMsg[];
  const { content } = await localGenerate(role, msgs, {
    max_tokens: ROLE_MAX_TOKENS,
    temperature,
    loraName: resolveLoraName(role),
  });
  const cleaned = sanitizeGenerated(content) || content;
  const referenceEntries = promptEvidences.map((item, idx) => {
    const num = idx + 1;
    const dateLabel = (item.date ?? '').trim() || '날짜 미상';
    const sourceLabel = (item.source ?? '').trim() || '출처 미상';
    const normalizedText = item.text.replace(/\s+/g, ' ').trim();
    const summary = normalizedText
      ? (normalizedText.length > 80 ? `${normalizedText.slice(0, 77)}…` : normalizedText)
      : '핵심 요약 없음';
    return {
      num,
      line: `${num}. ${dateLabel} | ${sourceLabel} | ${summary}`,
      date: item.date,
    };
  });

  let contentWithRefs = cleaned.trim();
  if (referenceEntries.length) {
    const citationRegex = /\[\d+\]/;
    const bulletRegex = /^(?:[-*•·]|[\d]+[.)])\s*/;
    const lines = contentWithRefs.split('
');
    let assigned = 0;
    const decorated = lines.map((line) => {
      if (assigned < referenceEntries.length) {
        const trimmedLine = line.trim();
        if (
          trimmedLine &&
          (bulletRegex.test(trimmedLine) || (assigned === 0 && trimmedLine.length > 0)) &&
          !citationRegex.test(line)
        ) {
          assigned += 1;
          return `${line} [${assigned}]`.trim();
        }
      }
      return line;
    });
    contentWithRefs = decorated.join('
').trim();
    if (!citationRegex.test(contentWithRefs)) {
      contentWithRefs = `${contentWithRefs} [1]`.trim();
    }
    const refLines = referenceEntries.map((entry) => entry.line);
    contentWithRefs = contentWithRefs.replace(/
+근거[\s\S]*$/i, '').trim();
    contentWithRefs = `${contentWithRefs}

근거
${refLines.join('
')}`;
  }

  return {
    type: role,
    title:
      role === 'eco'
        ? '거시 핵심'
        : role === 'firm'
        ? '기업 스냅샷'
        : '가계 프레임',
    content: contentWithRefs,
    conf: 0.7,
    sources: referenceEntries.map((entry, idx) => ({
      title: entry.line,
      date: promptEvidences[idx]?.date,
      score: evidences[idx]?.sim,
    })),
  };
}

export async function classifyQueryWithRouter(
  q: string,
  opts?: { timeout?: number }
): Promise<{ roles: AskRole[]; confidence: number } | null> {
  try {
    const { routerPromptV2 } = await import('./prompts.js');
    const msgs = routerPromptV2(q);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts?.timeout ?? 150);

    try {
      const { content } = await localGenerate('router', msgs, {
        max_tokens: 30,
        temperature: 0,
      });

      clearTimeout(timeoutId);

      // JSON 파싱
      const text = content.trim().replace(/^```json\s*|```$/g, '');
      const match = text.match(/\{[^}]+\}/);
      if (!match) return null;

      const data = JSON.parse(match[0]);

      if (!Array.isArray(data.roles)) return null;

      const roles = data.roles.filter(
        (r: string) => r === 'eco' || r === 'firm' || r === 'house'
      ) as AskRole[];

      if (!roles.length) return null;

      // 응답 길이로 신뢰도 추정
      const confidence = content.length < 50 ? 0.9 : 0.7;

      return { roles, confidence };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn('[Router] Classification failed:', err);
    return null;
  }
}

export async function genEditor(params: {
  query: string;
  drafts: Card[];
  mode: 'parallel' | 'sequential';
  roles: Role[];
}): Promise<{ cards: Card[]; metrics?: ProviderMetrics }> {
  const msgs = editorPrompt(
    params.query,
    params.drafts.map((d) => `${d.title}\n${d.content}`),
    params.mode,
    params.roles,
  ) as ChatMsg[];
  const { content, metrics } = await localGenerate('editor', msgs, {
    max_tokens: EDITOR_MAX_TOKENS,
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
  return { cards, metrics };
}

export interface PlanResult {
  path: AskRole[];
  mode: 'parallel' | 'sequential';
  reason?: string;
  confidence?: number;
}

const ALLOWED_PATHS: AskRole[][] = [
  ['eco'],
  ['firm'],
  ['house'],
  ['eco', 'firm'],
  ['firm', 'house'],
  ['eco', 'house'],
  ['eco', 'firm', 'house'],
];

function normalizePath(path: unknown): AskRole[] | null {
  if (!Array.isArray(path) || !path.length) return null;
  const seen = new Set<AskRole>();
  const normalized: AskRole[] = [];
  for (const item of path) {
    if (item === 'eco' || item === 'firm' || item === 'house') {
      if (!seen.has(item)) {
        seen.add(item);
        normalized.push(item);
      }
    }
  }
  if (!normalized.length) return null;
  return normalized;
}

function isAllowed(path: AskRole[]): boolean {
  return ALLOWED_PATHS.some(
    (allowed) => allowed.length === path.length && allowed.every((role, idx) => role === path[idx]),
  );
}

function parseRouterResponse(raw: string): PlanResult | null {
  try {
    const text = raw.trim().replace(/^```json\s*|```$/g, '').replace(/^```\s*json\s*/i, '').replace(/```\s*$/g, '');
    const data = JSON.parse(text);
    const path = normalizePath(data.path ?? data.roles);
    if (!path || !isAllowed(path)) {
      return null;
    }
    const mode = data.mode === 'sequential' || path.length > 1 ? 'sequential' : 'parallel';
    const confidence = typeof data.confidence === 'number' ? data.confidence : undefined;
    return {
      path,
      mode,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
      confidence,
    };
  } catch {
    return null;
  }
}

export async function planRoles(params: { query: string; prefer?: Role[]; hintMode?: 'auto'|'parallel'|'sequential' }): Promise<PlanResult | null> {
  const msgs = routerPrompt(params.query, params.prefer ?? []);
  try {
    const response = await localGenerate('router', msgs, { max_tokens: 250, temperature: 0 });
    const parsed = parseRouterResponse(response.content || response.raw?.content || '');
    if (!parsed) {
      console.warn('[ASK][router] unable to parse router response:', response.content);
    }
    return parsed ?? null;
  } catch (err) {
    console.error('[ASK][router][ERROR]', err);
    return null;
  }
}

function stripChainOfThought(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<\/?think>/gi, '');

  if (/\/think/i.test(text)) {
    const hasExplicitFinal = /\/(?:final|answer|response|assistant)\b/i.test(text);
    if (hasExplicitFinal) {
      text = text.replace(/\/think[\s\S]*?(?=\/(?:final|answer|response|assistant)\b)/gi, '');
      text = text.replace(/\/(?:final|answer|response|assistant)\b[:\s]*/gi, '');
    } else {
      const lower = text.toLowerCase();
      const lastIdx = lower.lastIndexOf('/think');
      if (lastIdx >= 0) {
        text = text.slice(lastIdx + '/think'.length);
      }
    }
  }

  text = text
    .split('\n')
    .filter((line) => !line.trim().toLowerCase().startsWith('/think'))
    .join('\n');

  return text.trim();
}

function normalizeInsightEntry(entry: any): InsightSnippet | null {
  if (!entry || typeof entry !== 'object') return null;
  const rawTitle = typeof entry.title === 'string' ? entry.title.trim() : '';
  const lines = normalizeLines(entry.lines ?? entry.description ?? entry.text);
  if (!lines.length) {
    return null;
  }
  const title = (rawTitle || lines[0]).slice(0, 80);
  return { title, lines };
}


