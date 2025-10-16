import type { Card, Role, SeriesResp } from '../types.js';
import { localGenerate, ChatMsg } from './provider_local.js';
import { draftPrompt, editorPrompt, routerPrompt, dailyInsightPrompt, marketSummaryPrompt, type PromptEvidence } from './prompts.js';

export type AskRole = 'eco' | 'firm' | 'house';

const ROLE_LORA_NAMES: Record<AskRole, string> = {
  eco: 'eco',
  firm: 'firm',
  house: 'house',
};

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
export interface InsightSnippet {
  title: string;
  lines: string[];
}

export interface InsightBundle {
  label: string;
  kospi?: InsightSnippet | null;
  ixic?: InsightSnippet | null;
}

interface SeriesSummaryInfo {
  trend: string;
  summary: string;
  change: number;
  pct: number;
  direction: '상승' | '하락' | '보합';
  latest: number;
  previous: number;
  spanChange: number;
  spanPct: number;
  spanStart: string;
}

function describeSeries(series: SeriesResp): SeriesSummaryInfo {
  const first = series.values[0];
  const last = series.values.at(-1)!;
  const prev = series.values.length > 1 ? series.values.at(-2)! : last;
  const change = last.close - prev.close;
  const pct = prev.close ? (change / prev.close) * 100 : 0;
  const spanChange = last.close - first.close;
  const spanPct = first.close ? (spanChange / first.close) * 100 : 0;
  const direction: SeriesSummaryInfo['direction'] =
    change > 0 ? '상승' : change < 0 ? '하락' : '보합';
  const marketLabel = series.symbol === 'KOSPI' ? '코스피' : '나스닥';
  const trend = `${marketLabel} ${direction} (${change >= 0 ? '+' : ''}${change.toFixed(
    2,
  )}, ${pct.toFixed(2)}%)`;
  const dailyRefDate = new Date(prev.t).toLocaleDateString();
  const summary = `${series.stamp} ${marketLabel} 종가 ${last.close.toFixed(
    2,
  )}p, 전일(${dailyRefDate}) 대비 ${change >= 0 ? '+' : ''}${change.toFixed(2)}p (${pct.toFixed(2)}%)`;
  return {
    trend,
    summary,
    change,
    pct,
    direction,
    latest: last.close,
    previous: prev.close,
    spanChange,
    spanPct,
    spanStart: new Date(first.t).toLocaleDateString(),
  };
}

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
      label: e.label ?? `RAG#${idx + 1}`,
      text: e.text,
      source: sourceCandidate,
      date: dateCandidate,
    };
  });

  const msgs = draftPrompt(role as any, q, promptEvidences, previousCards) as ChatMsg[];
  const { content } = await localGenerate(role, msgs, {
    max_tokens: 600,
    temperature,
    loraName: resolveLoraName(role),
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
    sources: promptEvidences.map((item, idx) => ({
      title: item.source ? `${item.label} ${item.source}` : item.label,
      date: item.date,
      score: evidences[idx]?.sim,
    })),
  };
}

export async function genEditor(params: {
  query: string;
  drafts: Card[];
  mode: 'parallel' | 'sequential';
  roles: Role[];
}) {
  const msgs = editorPrompt(
    params.query,
    params.drafts.map((d) => `${d.title}\n${d.content}`),
    params.mode,
    params.roles,
  ) as ChatMsg[];
  const { content } = await localGenerate('editor', msgs, {
    max_tokens: 1200,
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

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/g, '')
    .trim();
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null;
  }
  return withoutFence.slice(firstBrace, lastBrace + 1);
}

function normalizeLines(value: unknown): string[] {
  let candidates: string[] = [];
  if (Array.isArray(value)) {
    candidates = value.flatMap((item) =>
      String(item ?? '')
        .split(/\r?\n+/)
        .map((line) => line.trim()),
    );
  } else if (typeof value === 'string') {
    candidates = value.split(/\r?\n+/).map((line) => line.trim());
  }
  candidates = candidates
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return candidates.slice(0, 3);
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

function parseDailyInsightPayload(raw: string): InsightBundle | null {
  const jsonText = extractJsonObject(stripChainOfThought(raw));
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    const label =
      typeof parsed.label === 'string' && parsed.label.trim()
        ? parsed.label.trim().slice(0, 40)
        : '오늘의 해설';
    const kospi = normalizeInsightEntry(parsed.kospi);
    const ixic = normalizeInsightEntry(parsed.ixic);
    if (!kospi && !ixic) {
      return { label, kospi: null, ixic: null };
    }
    return { label, kospi: kospi ?? null, ixic: ixic ?? null };
  } catch {
    return null;
  }
}

export async function genDailyInsight(params: {
  focus: string;
  kospi: SeriesResp;
  ixic: SeriesResp;
  news: { title: string; description: string; link?: string; pubDate?: string }[];
}): Promise<{ summary: string; insights: InsightBundle | null; raw: string }> {
  const kospiInfo = describeSeries(params.kospi);
  const ixicInfo = describeSeries(params.ixic);
  const structuredMsgs = dailyInsightPrompt({
    focus: params.focus,
    kospi: kospiInfo,
    ixic: ixicInfo,
    news: params.news,
  }) as ChatMsg[];
  const structured = await localGenerate('editor', structuredMsgs, { max_tokens: 420, temperature: 0.2 });
  const raw = stripChainOfThought(structured.raw?.content ?? structured.content ?? '');
  const parsedInsights = parseDailyInsightPayload(raw);
  const fallback = buildFallbackInsights('오늘의 해설', kospiInfo, ixicInfo, params.news);
  const insights = mergeInsights(parsedInsights, fallback);

  const headlines = params.news
    .map((item) => `${(item.title || '').trim()} :: ${(item.description || '').trim()}`.trim())
    .filter((line) => line.replace(/::/g, '').trim().length > 0);
  const marketMsgs = marketSummaryPrompt({
    focus: params.focus,
    kospi: {
      trend: kospiInfo.trend,
      summary: kospiInfo.summary,
      changeText: formatChangeText(kospiInfo),
    },
    ixic: {
      trend: ixicInfo.trend,
      summary: ixicInfo.summary,
      changeText: formatChangeText(ixicInfo),
    },
    headlines,
  }) as ChatMsg[];
  const narrative = await localGenerate('market', marketMsgs, { max_tokens: 420, temperature: 0.25 });
  const summaryRaw = stripChainOfThought(narrative.raw?.content ?? narrative.content ?? '');
  const summary = sanitizeGenerated(summaryRaw) || summaryRaw;

  return {
    raw,
    summary,
    insights,
  };
}

function clampLine(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 80) {
    return normalized;
  }
  const truncated = normalized.slice(0, 77);
  const lastSpace = truncated.lastIndexOf(' ');
  const safe = lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated;
  return `${safe.trim()}…`;
}

function ensureMarketSnippet(
  market: '코스피' | '나스닥',
  primarySnippet: InsightSnippet | null | undefined,
  fallbackSnippet: InsightSnippet | null | undefined,
): InsightSnippet | null {
  if (!primarySnippet && !fallbackSnippet) {
    return null;
  }

  const directionSource = primarySnippet?.title ?? fallbackSnippet?.title ?? '';
  const directionMatch = directionSource.match(/(상승|하락|보합)/);
  const direction = directionMatch?.[1] ?? '보합';

  const stripMarketPrefix = (value: string | undefined) =>
    (value ?? '').replace(/^(코스피|나스닥)\s*(상승|하락|보합)?\s*[·:\-]?\s*/i, '').trim();

  const primaryBody = stripMarketPrefix(primarySnippet?.title);
  const fallbackBody = stripMarketPrefix(fallbackSnippet?.title);
  const titleBody = primaryBody || fallbackBody || '핵심 요약';

  const collected: string[] = [];
  const pushLine = (line: string | undefined) => {
    const next = clampLine(line ?? '');
    if (!next) return;
    if (collected.some((existing) => existing === next)) return;
    collected.push(next);
  };

  (fallbackSnippet?.lines ?? []).forEach((line) => pushLine(line));
  (primarySnippet?.lines ?? []).forEach((line) => pushLine(line));

  return {
    title: `${market} ${direction} · ${titleBody}`,
    lines: collected.slice(0, 3),
  };
}

function directionNarrative(direction: SeriesSummaryInfo['direction']): string {
  if (direction === '상승') return '상승세';
  if (direction === '하락') return '약세';
  return '보합권';
}

function formatChangeLine(market: '코스피' | '나스닥', info: SeriesSummaryInfo): string {
  const changeText = formatChangeText(info);
  const mood = directionNarrative(info.direction);
  return clampLine(
    `오늘 ${market}은 ${mood}로 마감했고 종가는 ${info.latest.toFixed(2)}p(전일 대비 ${changeText})입니다.`,
  );
}

function formatChangeText(info: SeriesSummaryInfo): string {
  const change = info.change >= 0 ? `+${info.change.toFixed(2)}` : info.change.toFixed(2);
  const pct = info.pct >= 0 ? `+${info.pct.toFixed(2)}` : info.pct.toFixed(2);
  return `${change}p (${pct}%)`;
}

function formatNewsLine(
  market: '코스피' | '나스닥',
  newsItem: { title?: string; description?: string } | undefined,
): string {
  if (!newsItem) {
    return '';
  }
  const title = newsItem.title?.replace(/<\/?[^>]+>/g, '').trim() || '';
  const desc = newsItem.description?.replace(/<\/?[^>]+>/g, '').trim() || '';
  const combined = `${title || desc}`.trim();
  if (!combined) {
    return '';
  }
  return clampLine(`오늘 ${market} 관련 이슈로는 ${combined} 등이 주목받았습니다. [뉴스]`);
}

function formatSummaryLine(info: SeriesSummaryInfo): string {
  const spanChangeText = info.spanChange >= 0 ? `+${info.spanChange.toFixed(2)}p` : info.spanChange.toFixed(2);
  const spanPctText = info.spanPct >= 0 ? `+${info.spanPct.toFixed(2)}%` : info.spanPct.toFixed(2);
  return clampLine(`${info.spanStart} 이후 누적 흐름은 ${spanChangeText} (${spanPctText})입니다.`);
}

function buildFallbackInsights(
  label: string,
  kospiInfo: ReturnType<typeof describeSeries>,
  ixicInfo: ReturnType<typeof describeSeries>,
  news: { title: string; description: string }[],
): InsightBundle {
  const headlines = Array.isArray(news) ? news : [];
  const [headline1, headline2] = headlines;

  const makeLines = (
    market: '코스피' | '나스닥',
    info: ReturnType<typeof describeSeries>,
    headline: { title: string; description: string } | undefined,
  ): string[] => {
    const lines: string[] = [];
    lines.push(formatChangeLine(market, info));
    const newsLine = formatNewsLine(market, headline);
    if (newsLine) {
      lines.push(newsLine);
    }
    const summaryLine = formatSummaryLine(info);
    if (summaryLine) {
      lines.push(summaryLine);
    }
    return lines.filter(Boolean).slice(0, 3);
  };

  const kospiLines = makeLines('코스피', kospiInfo, headline1);
  const ixicLines = makeLines('나스닥', ixicInfo, headline2 ?? headline1);

  return {
    label,
    kospi: kospiLines.length
      ? {
          title: clampLine(`코스피 ${kospiInfo.direction} · ${formatChangeText(kospiInfo)}`),
          lines: kospiLines,
        }
      : null,
    ixic: ixicLines.length
      ? {
          title: clampLine(`나스닥 ${ixicInfo.direction} · ${formatChangeText(ixicInfo)}`),
          lines: ixicLines,
        }
      : null,
  };
}


function mergeInsights(primary: InsightBundle | null, fallback: InsightBundle): InsightBundle {
  if (!primary) {
    return fallback;
  }

  const label = primary.label?.trim() || fallback.label;
  const kospi = ensureMarketSnippet('코스피', primary.kospi, fallback.kospi);
  const ixic = ensureMarketSnippet('나스닥', primary.ixic, fallback.ixic);

  return {
    label,
    kospi: kospi ?? null,
    ixic: ixic ?? null,
  };
}
