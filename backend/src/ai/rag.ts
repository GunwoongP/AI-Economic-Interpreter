import fs from 'node:fs';
import path from 'node:path';

export type NS = 'macro' | 'firm' | 'household';
export type Hit = {
  ns: NS;
  text: string;
  meta?: {
    id?: string;
    title?: string;
    source?: string;
    date?: string;
    tags?: string[];
    score?: number;
  };
  sim?: number;
};

type RoleKey = 'eco' | 'firm' | 'house';
const ROLE_KEYS: RoleKey[] = ['eco', 'firm', 'house'];

interface RawDoc {
  id?: string;
  role?: string;
  title?: string;
  summary?: string;
  content?: string;
  text?: string;
  body?: string;
  description?: string;
  heading?: string;
  headline?: string;
  chapter?: string;
  section_title?: string;
  date?: string;
  published_at?: string;
  source?: string;
  origin?: string;
  publisher?: string;
  originallink?: string;
  tags?: string[] | string;
  keywords?: string[] | string;
  categories?: string[] | string;
  chunk_id?: number | string;
  page?: number | string;
  [extra: string]: unknown;
}

interface NormalizedDoc {
  id: string;
  role: RoleKey;
  title: string;
  summary: string;
  date?: string;
  source?: string;
  tags: string[];
}

interface LoadedDoc extends NormalizedDoc {
  tokens: Set<string>;
  tagTokens: Set<string>;
}

const DATA_ROOT = path.resolve(process.cwd(), 'data', 'rag');

const ROLE_TO_NS: Record<RoleKey, NS> = {
  eco: 'macro',
  firm: 'firm',
  house: 'household',
};

const ROLE_FALLBACK_TITLE: Record<RoleKey, string> = {
  eco: 'Macro reference',
  firm: 'Firm reference',
  house: 'Household reference',
};

const STOPWORDS = new Set([
  '그리고',
  '그러나',
  '하지만',
  '대한',
  '관련',
  '기반',
  '위해',
  '가장',
  '다가',
  '이후',
  '현재',
  '전망',
  '요인',
  '대해',
  '증가',
  '감소',
  '영향',
  '시장',
  '투자',
  '리스크',
  '확대',
  '유지',
  '가능성',
  '중요',
  '중심',
  '요약',
  '포인트',
  '전략',
  '필요',
  '필요하다',
]);

function pickFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function coerceTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;|]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function normalizeRawDoc(raw: RawDoc, fallbackRole: RoleKey, index: number): NormalizedDoc | null {
  const resolvedRole =
    typeof raw.role === 'string' && ROLE_KEYS.includes(raw.role as RoleKey)
      ? (raw.role as RoleKey)
      : fallbackRole;

  const summary =
    pickFirstString(raw.summary, raw.content, raw.text, raw.body, raw.description) ?? '';
  if (!summary) {
    console.warn(`[RAG] skipped ${resolvedRole} doc at line ${index + 1}: missing summary/content`);
    return null;
  }

  const sourceText = pickFirstString(raw.source, raw.origin, raw.publisher);
  const pageText =
    typeof raw.page === 'number' || typeof raw.page === 'string'
      ? String(raw.page).trim()
      : undefined;

  const title =
    pickFirstString(raw.title, raw.heading, raw.headline, raw.chapter, raw.section_title) ??
    (sourceText ? `${sourceText}${pageText ? ` p.${pageText}` : ''}` : `${ROLE_FALLBACK_TITLE[resolvedRole]} ${index + 1}`);

  const id =
    pickFirstString(raw.id, typeof raw.chunk_id === 'number' || typeof raw.chunk_id === 'string' ? String(raw.chunk_id) : undefined) ??
    `${resolvedRole}_${index + 1}`;

  const date = pickFirstString(raw.date, raw.published_at);
  const tags = coerceTags(raw.tags ?? raw.keywords ?? raw.categories);

  return {
    id,
    role: resolvedRole,
    title,
    summary,
    date,
    source: sourceText,
    tags,
  };
}

function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-zA-Z가-힣]+/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function loadDocs(role: RoleKey): LoadedDoc[] {
  const filePath = path.join(DATA_ROOT, `${role}.jsonl`);
  if (!fs.existsSync(filePath)) {
    console.warn(`[RAG] dataset file missing for ${role}: ${filePath}`);
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const docs: LoadedDoc[] = [];
  lines.forEach((line, index) => {
    try {
      const parsed = JSON.parse(line) as RawDoc;
      const normalized = normalizeRawDoc(parsed, role, index);
      if (!normalized) return;
      const tokens = new Set(tokenize(`${normalized.title} ${normalized.summary} ${normalized.tags.join(' ')}`));
      const tagTokens = new Set(normalized.tags.flatMap((tag) => tokenize(tag)));
      docs.push({ ...normalized, tokens, tagTokens });
    } catch (err) {
      console.warn(`[RAG] invalid JSON in ${role} dataset (line ${index + 1}):`, err);
    }
  });
  return docs;
}

const DOCS: Record<RoleKey, LoadedDoc[]> = {
  eco: loadDocs('eco'),
  firm: loadDocs('firm'),
  house: loadDocs('house'),
};

function recencyScore(date?: string): number {
  if (!date) return 0.7;
  const stamp = new Date(date).getTime();
  if (Number.isNaN(stamp)) return 0.7;
  const ageDays = (Date.now() - stamp) / 86_400_000;
  if (ageDays <= 180) return 1;
  if (ageDays <= 365) return 0.9;
  if (ageDays <= 730) return 0.8;
  return 0.7;
}

const SOURCE_CONFIDENCE: Record<string, number> = {
  한국은행: 1,
  통계청: 0.95,
  IMF: 0.95,
  OECD: 0.9,
  FRB: 0.9,
  IEA: 0.88,
  '삼성전자 IR': 0.88,
  'SK하이닉스 IR': 0.88,
  'Tesla Earnings': 0.85,
  'Naver IR': 0.85,
  LGES: 0.85,
  포스코퓨처엠: 0.83,
  대한항공: 0.83,
  롯데쇼핑: 0.82,
  금융감독원: 0.88,
  국세청: 0.86,
  신한은행: 0.83,
  국토부: 0.82,
  기재부: 0.82,
  보험연구원: 0.8,
};

function confidenceScore(source?: string): number {
  if (!source) return 0.75;
  return SOURCE_CONFIDENCE[source] ?? 0.78;
}

function computeScore(doc: LoadedDoc, queryTokens: string[]): number {
  if (!queryTokens.length) return 0.2 + recencyScore(doc.date) * 0.5;
  const docTokens = doc.tokens;
  const matchCount = queryTokens.filter((token) => docTokens.has(token)).length;
  const coverage = matchCount / Math.max(1, queryTokens.length);
  const tagMatches = queryTokens.filter((token) => doc.tagTokens.has(token)).length;
  const tagScore = tagMatches > 0 ? 0.5 + (tagMatches / Math.max(1, queryTokens.length)) * 0.5 : 0;
  const recency = recencyScore(doc.date);
  const confidence = confidenceScore(doc.source);
  const lengthPenalty = Math.min(1, doc.summary.length / 400);
  return (
    0.55 * coverage +
    0.15 * tagScore +
    0.15 * recency +
    0.1 * confidence +
    0.05 * lengthPenalty
  );
}

export async function searchRAG(q: string, roles: RoleKey[], k = 3): Promise<Hit[]> {
  const queryTokens = tokenize(q);
  const namespaces = [...new Set(roles.map((role) => ROLE_TO_NS[role]))] as NS[];

  const hits: Hit[] = [];
  for (const role of roles) {
    const docs = DOCS[role];
    const scored = docs
      .map((doc) => ({ doc, score: computeScore(doc, queryTokens) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ doc, score }) => ({
        ns: ROLE_TO_NS[role],
        text: doc.summary,
        meta: {
          id: doc.id,
          title: doc.title,
          source: doc.source,
          date: doc.date,
          tags: doc.tags,
          score,
        },
        sim: score,
      } satisfies Hit));
    hits.push(...scored);
  }

  // Normalize score ranking across roles, keep top k per namespace
  const byNs: Record<NS, Hit[]> = { macro: [], firm: [], household: [] };
  for (const hit of hits) {
    byNs[hit.ns].push(hit);
  }
  const final: Hit[] = [];
  for (const ns of namespaces) {
    const list = byNs[ns].sort((a, b) => (b.meta?.score ?? 0) - (a.meta?.score ?? 0)).slice(0, k);
    final.push(...list);
  }
  return final;
}
