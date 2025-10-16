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

const LEGACY_DATA_ROOT = path.resolve(process.cwd(), 'data', 'rag');
const RAG_ZZIN_DATA_ROOT = path.resolve(process.cwd(), '..', 'RAG_zzin', 'data');

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
    if (typeof value === 'number') {
      const trimmed = String(value).trim();
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

function loadLegacyDocs(role: RoleKey): LoadedDoc[] {
  const filePath = path.join(LEGACY_DATA_ROOT, `${role}.jsonl`);
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

function clipText(value: unknown, max = 560): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function slugify(value: string, fallback: string): string {
  const normalized = value
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-zA-Z가-힣]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return normalized || fallback;
}

function asUniqueTags(...inputs: unknown[]): string[] {
  const acc = new Set<string>();
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      for (const item of input) {
        if (typeof item === 'string' || typeof item === 'number') {
          const normalized = String(item).trim();
          if (normalized) acc.add(normalized);
        }
      }
      continue;
    }
    if (typeof input === 'string') {
      const parts = input
        .split(/[,;|]/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length) {
        for (const part of parts) acc.add(part);
      } else if (input.trim()) {
        acc.add(input.trim());
      }
      continue;
    }
    if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        const normalizedKey = key.trim();
        if (normalizedKey) acc.add(normalizedKey);
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (typeof entry === 'string' || typeof entry === 'number') {
              const normalized = String(entry).trim();
              if (normalized) acc.add(normalized);
            }
          }
        } else if (typeof value === 'string') {
          const normalized = value.trim();
          if (normalized) acc.add(normalized);
        }
      }
      continue;
    }
  }
  return Array.from(acc).slice(0, 12);
}

function extractHostname(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.hostname || undefined;
  } catch {
    return undefined;
  }
}

function normalizeReportDate(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{2}[./-]\d{2}[./-]\d{2}$/.test(trimmed)) {
    const parts = trimmed.replace(/-/g, '.').replace(/\//g, '.').split('.');
    if (parts.length === 3) {
      const [yy, mm, dd] = parts;
      const yearNum = Number(yy);
      const fullYear = yearNum >= 70 ? 1900 + yearNum : 2000 + yearNum;
      const month = mm.padStart(2, '0');
      const day = dd.padStart(2, '0');
      return `${fullYear}-${month}-${day}`;
    }
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return undefined;
}

function readJsonArray(filePath: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn(`[RAG] expected JSON array at ${filePath}`);
      return [];
    }
    return parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  } catch (err) {
    console.warn(`[RAG] failed to read ${filePath}:`, err);
    return [];
  }
}

function readJsonl(filePath: string): Record<string, unknown>[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const records: Record<string, unknown>[] = [];
    lines.forEach((line, index) => {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === 'object') {
          records.push(parsed as Record<string, unknown>);
        }
      } catch (err) {
        console.warn(`[RAG] invalid JSON in ${filePath} (line ${index + 1}):`, err);
      }
    });
    return records;
  } catch (err) {
    console.warn(`[RAG] failed to read ${filePath}:`, err);
    return [];
  }
}

function toLoadedDocs(list: NormalizedDoc[]): LoadedDoc[] {
  return list.map((doc) => {
    const tokens = new Set(tokenize(`${doc.title} ${doc.summary} ${doc.tags.join(' ')}`));
    const tagTokens = new Set(doc.tags.flatMap((tag) => tokenize(tag)));
    return { ...doc, tokens, tagTokens };
  });
}

function loadRagZzinDocs(): Record<RoleKey, LoadedDoc[]> | null {
  if (!fs.existsSync(RAG_ZZIN_DATA_ROOT)) {
    return null;
  }
  try {
    if (!fs.statSync(RAG_ZZIN_DATA_ROOT).isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  const aggregated: Record<RoleKey, NormalizedDoc[]> = {
    eco: [],
    firm: [],
    house: [],
  };

  const pushDoc = (role: RoleKey, doc: NormalizedDoc | null | undefined) => {
    if (!doc) return;
    const summary = clipText(doc.summary);
    if (!summary) return;
    aggregated[role].push({
      ...doc,
      summary,
      tags: doc.tags.filter((tag, idx, arr) => tag && arr.indexOf(tag) === idx).slice(0, 12),
    });
  };

  const eventsPath = path.join(RAG_ZZIN_DATA_ROOT, 'events_catalog_v2.json');
  if (fs.existsSync(eventsPath)) {
    const events = readJsonArray(eventsPath);
    events.forEach((event, index) => {
      const name = pickFirstString(event.name, event.title) ?? `Event ${index + 1}`;
      const summary = clipText(pickFirstString(event.summary, event.description));
      if (!summary) return;
      const yearValue = pickFirstString(event.year);
      const sources = Array.isArray(event.sources)
        ? event.sources.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const tags = asUniqueTags('macro event', event.region, sources.map((src) => extractHostname(src) ?? src));
      pushDoc('eco', {
        id: `event_${slugify(pickFirstString(event.id, name) ?? `event_${index + 1}`, `event_${index + 1}`)}`,
        role: 'eco',
        title: `${name}${yearValue ? ` (${yearValue})` : ''}`,
        summary,
        date: yearValue ? `${yearValue}-01-01` : undefined,
        source: sources[0],
        tags,
      });
    });
  }

  const bokPath = path.join(RAG_ZZIN_DATA_ROOT, 'bok_terms_full.jsonl');
  if (fs.existsSync(bokPath)) {
    readJsonl(bokPath).forEach((item, index) => {
      const term = pickFirstString(item.term, item.title);
      const definition = clipText(pickFirstString(item.definition, item.content, item.text));
      if (!term || !definition) return;
      pushDoc('eco', {
        id: `bok_${slugify(term, `term_${index + 1}`)}`,
        role: 'eco',
        title: term,
        summary: definition,
        source: '한국은행 경제용어사전',
        tags: asUniqueTags('경제용어', 'BOK', item.category),
      });
    });
  }

  const indicatorPath = path.join(RAG_ZZIN_DATA_ROOT, '알기_쉬운_경제지표해설(2023)F.jsonl');
  if (fs.existsSync(indicatorPath)) {
    readJsonl(indicatorPath).forEach((item, index) => {
      const content = clipText(pickFirstString(item.content, item.text, item.body));
      if (!content) return;
      const source = pickFirstString(item.source);
      const page = pickFirstString(item.page, item.page_label);
      const titleSource = source ?? '알기 쉬운 경제지표 해설';
      pushDoc('eco', {
        id: `indicator_${slugify(`${titleSource}_${page ?? index + 1}`, `indicator_${index + 1}`)}`,
        role: 'eco',
        title: `${titleSource}${page ? ` p.${page}` : ''}`,
        summary: content,
        source,
        tags: asUniqueTags('경제지표', source),
      });
    });
  }

  const mailPath = path.join(RAG_ZZIN_DATA_ROOT, 'maileconterms_jung.json');
  if (fs.existsSync(mailPath)) {
    readJsonArray(mailPath).forEach((item, index) => {
      const title = pickFirstString(item.title, item.name);
      const answer = clipText(pickFirstString(item.answer, item.summary));
      if (!title || !answer) return;
      pushDoc('firm', {
        id: `mail_${slugify(title, `mail_${index + 1}`)}`,
        role: 'firm',
        title,
        summary: answer,
        source: '매일경제 용어사전',
        tags: asUniqueTags('경제용어', 'Mail', item.topic),
      });
    });
  }

  const hankyungPath = path.join(RAG_ZZIN_DATA_ROOT, 'hangkookeconterms_jung.json');
  if (fs.existsSync(hankyungPath)) {
    readJsonArray(hankyungPath).forEach((item, index) => {
      const title = pickFirstString(item.title, item.name);
      const answer = clipText(pickFirstString(item.answer, item.summary, item.description));
      if (!title || !answer) return;
      pushDoc('firm', {
        id: `hk_${slugify(title, `hk_${index + 1}`)}`,
        role: 'firm',
        title,
        summary: answer,
        source: '한국경제 용어사전',
        tags: asUniqueTags('경제용어', '한국경제', item.topic),
      });
    });
  }

  const naverPath = path.join(RAG_ZZIN_DATA_ROOT, 'naver_terms_name_summary_profile.json');
  if (fs.existsSync(naverPath)) {
    readJsonArray(naverPath).forEach((item, index) => {
      const name = pickFirstString(item.name, item.title);
      const summary = clipText(pickFirstString(item.summary, item.description));
      if (!name || !summary) return;
      pushDoc('firm', {
        id: `naver_${slugify(name, `naver_${index + 1}`)}`,
        role: 'firm',
        title: name,
        summary,
        source: '네이버 기업 개요',
        tags: asUniqueTags('기업', item.profile),
      });
    });
  }

  const wisePath = path.join(RAG_ZZIN_DATA_ROOT, 'wisereport_all copy.json');
  if (fs.existsSync(wisePath)) {
    readJsonArray(wisePath).forEach((item, itemIndex) => {
      const code = pickFirstString(item.code);
      const name = pickFirstString(item.name) ?? code ?? `기업 ${itemIndex + 1}`;
      const baseTags = asUniqueTags('리포트', item.market, code, name, item.metrics);
      const reports = Array.isArray(item.reports) ? item.reports : [];
      reports.forEach((report, reportIndex) => {
        if (!report || typeof report !== 'object') return;
        const reportTitle = pickFirstString(report.report_title, report.title) ?? '리포트';
        const summary = clipText(pickFirstString(report.report_summary, report.summary));
        if (!summary) return;
        const date = normalizeReportDate(pickFirstString(report.report_date, report.date));
        pushDoc('firm', {
          id: `wise_${slugify(`${code ?? name}_${reportIndex + 1}`, `wise_${itemIndex}_${reportIndex}`)}`,
          role: 'firm',
          title: `${name} - ${reportTitle}`,
          summary,
          date,
          source: 'WISEfn 리포트',
          tags: asUniqueTags(baseTags, report.report_rank),
        });
      });
    });
  }

  const chunksPath = path.join(RAG_ZZIN_DATA_ROOT, 'chunks_flat.jsonl');
  if (fs.existsSync(chunksPath)) {
    readJsonl(chunksPath).forEach((item, index) => {
      const text = clipText(pickFirstString(item.text, item.content, item.body));
      if (!text) return;
      const meta = (item.metadata && typeof item.metadata === 'object') ? (item.metadata as Record<string, unknown>) : {};
      const sourceName = pickFirstString(meta.source_name, meta.source, meta.title) ?? '리서치 리포트';
      const page = pickFirstString(meta.page_label, meta.page);
      const id = pickFirstString(item.id, `${sourceName}_${page ?? index + 1}`);
      const date = normalizeReportDate(pickFirstString(meta.moddate, meta.creationdate, meta.created_at, meta.date));
      pushDoc('firm', {
        id: `chunk_${slugify(id ?? `chunk_${index + 1}`, `chunk_${index + 1}`)}`,
        role: 'firm',
        title: `${sourceName}${page ? ` p.${page}` : ''}`,
        summary: text,
        date,
        source: sourceName,
        tags: asUniqueTags('리포트', meta.producer, meta.creator, meta.author, meta.dataset, meta.ticker, meta.symbol),
      });
    });
  }

  const storyPath = path.join(RAG_ZZIN_DATA_ROOT, '알기쉬운 경제이야기.jsonl');
  if (fs.existsSync(storyPath)) {
    readJsonl(storyPath).forEach((item, index) => {
      const content = clipText(pickFirstString(item.content, item.text, item.body));
      if (!content) return;
      const source = pickFirstString(item.source);
      const page = pickFirstString(item.page, item.page_label);
      const titleSource = source ?? '알기 쉬운 경제이야기';
      pushDoc('house', {
        id: `story_${slugify(`${titleSource}_${page ?? index + 1}`, `story_${index + 1}`)}`,
        role: 'house',
        title: `${titleSource}${page ? ` p.${page}` : ''}`,
        summary: content,
        source,
        tags: asUniqueTags('생활경제', '기초학습', source),
      });
    });
  }

  const beginnerPath = path.join(RAG_ZZIN_DATA_ROOT, '초보투자자를위한 증권과 투자 따라잡기.jsonl');
  if (fs.existsSync(beginnerPath)) {
    readJsonl(beginnerPath).forEach((item, index) => {
      const content = clipText(pickFirstString(item.content, item.text, item.body));
      if (!content) return;
      const source = pickFirstString(item.source);
      const chapter = pickFirstString(item.chapter, item.section_title);
      pushDoc('house', {
        id: `invest_${slugify(`${chapter ?? 'section'}_${index + 1}`, `invest_${index + 1}`)}`,
        role: 'house',
        title: chapter ?? '증권 투자 따라잡기',
        summary: content,
        source,
        tags: asUniqueTags('투자기초', source, chapter),
      });
    });
  }

  const totals = {
    eco: aggregated.eco.length,
    firm: aggregated.firm.length,
    house: aggregated.house.length,
  };

  if (!totals.eco && !totals.firm && !totals.house) {
    return null;
  }

  console.info(`[RAG] loaded RAG_zzin dataset (eco=${totals.eco}, firm=${totals.firm}, house=${totals.house})`);
  return {
    eco: toLoadedDocs(aggregated.eco),
    firm: toLoadedDocs(aggregated.firm),
    house: toLoadedDocs(aggregated.house),
  };
}

function buildDocs(): Record<RoleKey, LoadedDoc[]> {
  const ragDocs = loadRagZzinDocs();
  if (ragDocs) {
    return ragDocs;
  }
  return {
    eco: loadLegacyDocs('eco'),
    firm: loadLegacyDocs('firm'),
    house: loadLegacyDocs('house'),
  };
}

const DOCS: Record<RoleKey, LoadedDoc[]> = buildDocs();

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
