import { Router } from 'express';
import type { AskInput, AskOutput, Card, Role } from '../types.js';
import { attachAdapters, detachAll, genDraft, genEditor, classifyQueryWithRouter, AskRole, Evidence } from '../ai/bridge.js';
import { getRoleBases } from '../ai/provider_local.js';
// import { searchRAG } from '../ai/rag.js';  // Legacy token-based search
import { searchRAG, isFaissAvailable } from '../ai/rag_faiss.js';  // FAISS vector search

const router = Router();

class AskHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ROLE_ORDER: AskRole[] = ['eco', 'firm', 'house'];
const ALLOWED_PATHS: AskRole[][] = [
  ['eco'],
  ['firm'],
  ['house'],
  ['eco', 'firm'],
  ['firm', 'house'],
  ['eco', 'house'],
  ['eco', 'firm', 'house'],
];

function isAllowedPath(path: AskRole[]): boolean {
  return ALLOWED_PATHS.some(
    (allowed) => allowed.length === path.length && allowed.every((role, idx) => role === path[idx]),
  );
}

function sanitizeSequence(input?: Role[]): AskRole[] {
  if (!Array.isArray(input)) return [];
  const result: AskRole[] = [];
  for (const role of input) {
    if ((role === 'eco' || role === 'firm' || role === 'house') && !result.includes(role)) {
      result.push(role);
    }
  }
  return result;
}

function enforceAllowed(path: AskRole[]): AskRole[] {
  if (isAllowedPath(path)) {
    return path;
  }
  const normalized = ROLE_ORDER.filter((role) => path.includes(role));
  if (normalized.length && isAllowedPath(normalized)) {
    return normalized;
  }
  if (path.length === 1 && (path[0] === 'eco' || path[0] === 'firm' || path[0] === 'house')) {
    return path;
  }
  return ['eco'];
}

// ✅ 질문에서 역할 자동 분류 (prefer 병합)
function selectRoles(q: string, prefer: Role[] = []): AskRole[] {
  const s = (q || '').toLowerCase();
  const preferSeed = Array.isArray(prefer) ? sanitizeSequence(prefer.slice(0, 3)) : [];
  const preferActive = preferSeed.length > 0;
  const hasInvest = /(투자|포트폴리오|리밸런싱|매수|매도|분산투자|자산배분|전략)/.test(s);
  const hasMacroCue = /(gdp|국내총생산|금리|환율|정책|경기|경제|물가|부동산|dxy|유가)/.test(s);
  const hasSpecificFirm =
    /(삼성|하이닉스|네이버|카카오|현대|sk|lg|테슬라|엔비디아|애플|apple|msft|마이크로소프트|구글|알파벳|meta|아마존|tsmc|엔씨|ncsoft|카카오페이|kb|국민은행|신한|이마트|롯데|posco)/i.test(
      s,
    );
  const hasGenericFirm = /(기업|회사|업종|섹터|산업|종목|분야|시장)/.test(s);
  const hasHouseCue =
    /(가계|가족|은퇴|연금|저축|예금|적금|채권|포트폴리오|dsr|대출|분산|예산|리스크|현금흐름|레버리지|재무설계|자산배분|보험)/.test(
      s,
    );

  if (!preferActive) {
    if (/(gdp|국내총생산)/.test(s)) {
      return ['eco'];
    }
    if (hasSpecificFirm && hasInvest) {
      return ['firm', 'house'];
    }
    if (hasSpecificFirm && !hasInvest && !hasMacroCue) {
      return ['firm'];
    }
    if (hasHouseCue && !hasSpecificFirm && !hasGenericFirm) {
      return hasMacroCue ? ['eco', 'house'] : ['house'];
    }
    if (hasMacroCue && hasInvest && !hasSpecificFirm && !hasGenericFirm) {
      return ['eco', 'house'];
    }
    if (!hasSpecificFirm && hasGenericFirm && hasInvest) {
      return ['eco', 'firm', 'house'];
    }
    if (!hasSpecificFirm && !hasGenericFirm && hasMacroCue && !hasHouseCue && !hasInvest) {
      return ['eco'];
    }
  }

  const buffer: Role[] = preferSeed.slice(0, 3);

  // Special intent routing: force paths for common Korean phrasings
  // 1) "코스피가 뭐야/무엇/뜻/설명" -> eco only
  if (/코스피/.test(s) && /(뭐야|무엇|뜻|설명)/.test(s)) {
    return ['eco'];
  }
  // 2) "오르는 데 가장 기여한 기업" 등 -> eco -> firm
  if (/(기여|기여한).*(기업)/.test(s) || /(기여).*(코스피|지수)/.test(s)) {
    return ['eco', 'firm'];
  }
  // 3) "어떤 기업에 투자하면 좋을까" 등 -> eco -> firm -> house
  if (/(어떤\s*기업|기업).*투자(하면|할까|좋을까)/.test(s) || /(투자).*(기업)/.test(s)) {
    return ['eco', 'firm', 'house'];
  }

  if (/(금리|환율|정책|경기|경제|물가|부동산|dxy|유가|gdp|국내총생산)/.test(s)) buffer.push('eco');
  if (/(per|roe|재무|실적|기업|회사|종목|반도체|리츠|삼성|네이버|하이닉스|현대|sk|지수|섹터|업종|밸류)/i.test(s)) buffer.push('firm');
  if (/(가계|포트폴리오|dsr|대출|분산|예산|리스크|현금흐름|레버리지|채권|저축|예금|적금|연금|보험)/.test(s)) buffer.push('house');

  let roles = sanitizeSequence(buffer);
  if (!roles.length) {
    roles = ['eco', 'firm', 'house'];
  }
  if (!roles.includes('eco')) {
    roles = ['eco', ...roles];
  }
  if (roles.length === 1) {
    const single = roles[0];
    if (single === 'eco') {
      const addFirm = /(기업|실적|주가|산업|시장|투자|제조|수출|ai|반도체|it)/i.test(s);
      const addHouse = /(가계|포트폴리오|대출|부채|소비|투자전략|리스크|생활비)/.test(s);
      roles = ['eco'];
      if (addFirm) roles.push('firm');
      if (addHouse) roles.push('house');
      if (roles.length === 1) {
        roles.push('firm', 'house');
      }
    } else if (single === 'firm') {
      roles = ['eco', 'firm'];
      if (/(가계|포트폴리오|소비|대출|리스크)/.test(s)) {
        roles.push('house');
      }
    } else if (single === 'house') {
      roles = ['eco', 'house', 'firm'];
    }
  }
  const ordered = ROLE_ORDER.filter((role) => roles.includes(role));
  return enforceAllowed(ordered.length ? ordered : ['eco', 'firm', 'house']);
}

// ✅ 자동/병렬/순차 모드 선택
function selectMode(q: string, mode: 'auto'|'parallel'|'sequential'='auto'){
  if (mode !== 'auto') return mode;
  const normalized = (q || '').toLowerCase();
  return /(반영|기준으로|토대로|업데이트|재해석|그\s*(?:다음|후)|먼저|순서대로|단계|이어[서지는]?)/.test(normalized)
    ? 'sequential'
    : 'parallel';
}

interface PreparedAsk {
  q: string;
  roles: Role[];
  mode: 'parallel'|'sequential';
  generationRoles: AskRole[];
  routerSource?: string;
  routerConfidence?: number;
}

async function prepareAsk(body: AskInput): Promise<PreparedAsk> {
  const q = String(body.q ?? '').slice(0, 2000);

  if (!q.trim()) {
    throw new AskHttpError(400, 'q is required');
  }

  const explicitRaw = sanitizeSequence(Array.isArray(body.roles) ? body.roles : undefined);
  const explicit = explicitRaw.length ? enforceAllowed(explicitRaw) : [];
  const preferList = Array.isArray(body.prefer) ? body.prefer : [];

  // ══════════════════════════════════════════════════════
  // Hybrid Router: AI (Eco 재사용) → Heuristic fallback
  // ══════════════════════════════════════════════════════

  let roles: AskRole[] = [];
  let confidence = 0;
  let source = 'heuristic';

  if (explicit.length) {
    // 명시적 지정 (최우선)
    roles = explicit;
    confidence = 1.0;
    source = 'explicit';
  } else {
    // 자동 선택: AI Router 시도 → 실패 시 휴리스틱
    try {
      const routerResult = await classifyQueryWithRouter(q, { timeout: 150 });

      // 신뢰도 70% 이상만 사용
      if (routerResult && routerResult.confidence >= 0.7) {
        roles = routerResult.roles;
        confidence = routerResult.confidence;
        source = 'ai_router';
        console.log(
          `[ASK][Router] AI: ${JSON.stringify(roles)} (conf=${confidence.toFixed(2)})`
        );
      } else {
        throw new Error('Low confidence or no result');
      }
    } catch (err) {
      // Heuristic fallback (항상 성공)
      roles = selectRoles(q, preferList);
      confidence = 0.85;
      source = 'heuristic_fallback';
      console.warn(
        `[ASK][Router] AI failed/timeout, using heuristic: ${JSON.stringify(roles)}`
      );
    }
  }

  // Mode 결정: 명시적 지정 > 역할 개수 기반 > 질문 패턴 분석
  const hasExplicitMode = body.mode && body.mode !== 'auto';
  let mode: 'parallel' | 'sequential';
  if (hasExplicitMode) {
    mode = body.mode as 'parallel' | 'sequential';
  } else {
    mode = roles.length > 1 ? 'sequential' : selectMode(q, (body.mode ?? 'auto') as any);
  }

  const generationRoles: AskRole[] = roles.length ? roles : ['eco'];
  const uniqueRoles = Array.from(new Set(generationRoles)) as Role[];

  return {
    q,
    roles: uniqueRoles,
    mode,
    generationRoles,
    routerSource: source,
    routerConfidence: confidence,
  };
}



const ROLE_QUERY_HINTS: Record<AskRole, string[]> = {
  eco: ['금리', '환율', '물가', '성장률', '정책'],
  firm: ['실적', '산업', '기업', '수익성', '밸류에이션'],
  house: ['가계', '포트폴리오', '대출', '소비', '위험 관리'],
};

function compactCardForContext(card: Card, maxLines = 3, maxChars = 400): Card {
  // Sequential 모드에서 이전 단계의 핵심 요약만 전달
  const lines = card.content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const cleaned: string[] = [];
  for (const line of lines) {
    const normalized = line.replace(/^[*\u2022-]\s*/, '').trim();
    if (!normalized) continue;
    // RAG 인용 제거 (불필요한 노이즈)
    const withoutCitation = normalized.replace(/\(RAG#\d+\s*\|[^)]+\)/g, '').trim();
    if (withoutCitation) {
      cleaned.push(withoutCitation);
    }
    if (cleaned.length >= maxLines) break;
  }

  // 제목 + 핵심 요약만 포함
  let body = cleaned.length ? cleaned.join(' ') : card.content.slice(0, maxChars).trim();
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars).trimEnd()}...`;
  }

  return {
    ...card,
    content: `${card.title}: ${body}`,
  };
}

function buildRoleQuery(role: AskRole, question: string, previous: Card[]): string {
  const parts: string[] = [];
  const trimmedQ = (question || '').trim();
  if (trimmedQ) {
    parts.push(trimmedQ);
  }
  if (previous.length) {
    // 이전 카드의 제목 + 첫 2줄만 사용하여 RAG 쿼리 정확도 향상
    const summary = previous
      .map((card) => {
        const firstLines = card.content.split('\n').slice(0, 2).join(' ').trim();
        return `[${card.type.toUpperCase()}] ${card.title}: ${firstLines}`;
      })
      .join('\n');
    parts.push(summary);
  }
  // 역할 키워드 제거 (RAG는 이미 role별 필터링, 불필요한 노이즈)
  const joined = parts.join('\n\n').trim();
  return joined.length > 1500 ? joined.slice(0, 1500) : joined;
}

async function gatherEvidence(role: AskRole, question: string, previous: Card[]): Promise<Evidence[]> {
  if (!question?.trim()) return [];
  const query = buildRoleQuery(role, question, previous);
  try {
    let hits = await searchRAG(query, [role], 6);
    if (!hits.length && previous.length) {
      // 이전 카드에서 키워드 추출하여 재시도
      const keywords = previous.flatMap(c => c.content.match(/[가-힣]{2,}/g) || []).slice(0, 5).join(' ');
      hits = await searchRAG(`${question} ${keywords}`, [role], 6);
    }
    if (!hits.length) {
      // 최종 fallback: 질문만으로 재시도
      hits = await searchRAG(question, [role], 6);
    }
    const seen = new Set<string>();
    const uniqueHits = hits.filter((hit) => {
      const key = hit.text.trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return uniqueHits.slice(0, 3).map((hit, idx) => {
      const meta = (hit.meta && typeof hit.meta === 'object') ? (hit.meta as Record<string, unknown>) : {};
      const source = typeof meta.title === 'string' && meta.title.trim().length
        ? meta.title.trim()
        : typeof meta.source === 'string' && meta.source.trim().length
        ? meta.source.trim()
        : undefined;
      const date = typeof meta.date === 'string' && meta.date.trim().length ? meta.date.trim() : undefined;
      return {
        text: hit.text,
        meta: hit.meta,
        sim: hit.sim,
        label: `근거${idx + 1}`,
        source,
        date,
      };
    });
  } catch (err) {
    console.error(`[ASK][RAG][ERROR][${role}]`, err);
    return [];
  }
}

interface AskRunOptions {
  onDraft?: (draft: Card) => Promise<void> | void;
}

async function runAsk(prepared: PreparedAsk, options?: AskRunOptions): Promise<AskOutput> {
  const { q, roles, mode, generationRoles, routerSource, routerConfidence } = prepared;

  console.log('[ASK]', {
    q: q.slice(0, 60),
    roles,
    mode,
    router: routerSource,
    confidence: routerConfidence?.toFixed(2),
  });

  const t0 = Date.now();

  const draftMap = new Map<AskRole, Card>();
  const usedNormalized = new Set<string>();
  const usedFingerprints = new Set<string>();
  const normalizeContent = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const fingerprintContent = (text: string) => {
    const normalized = normalizeContent(text);
    return normalized ? normalized.slice(0, 200) : '';
  };
  await attachAdapters(roles);

  try {
    const runRole = async (role: AskRole, index: number) => {
      const rawPrevious =
        mode === 'sequential'
          ? generationRoles
              .slice(0, index)
              .map((prev) => draftMap.get(prev))
              .filter(Boolean) as Card[]
          : [];

      const previousForContext = rawPrevious.slice(-3).map((card) => compactCardForContext(card));
      const evidences = await gatherEvidence(role, q, previousForContext);

      const existingNormalized = new Set(usedNormalized);
      const existingFingerprints = new Set(usedFingerprints);
      const attemptTemps = [0.3, 0.6];
      let selected: Card | null = null;
      let normalized = '';
      let fingerprint = '';

      const generateCandidate = async (temperature: number) => {
        const candidate = await genDraft(role, q, evidences, {
          previous: previousForContext,
          temperature,
        });
        const candidateNormalized = normalizeContent(candidate.content);
        const candidateFingerprint = fingerprintContent(candidate.content);
        const hasMinLength = candidateNormalized.length >= 80;
        return { candidate, candidateNormalized, candidateFingerprint, hasMinLength };
      };

      for (const temp of attemptTemps) {
        const { candidate, candidateNormalized, candidateFingerprint, hasMinLength } = await generateCandidate(temp);
        if (!hasMinLength) continue;
        if (existingNormalized.has(candidateNormalized)) continue;
        if (candidateFingerprint && existingFingerprints.has(candidateFingerprint)) continue;

        selected = candidate;
        normalized = candidateNormalized;
        fingerprint = candidateFingerprint;
        break;
      }

      if (!selected) {
        const { candidate, candidateNormalized, candidateFingerprint } = await generateCandidate(0.5);
        selected = candidate;
        normalized = candidateNormalized;
        fingerprint = candidateFingerprint;
      }

      let finalDraft: Card = selected as Card;
      normalized = normalized || normalizeContent(finalDraft.content);
      fingerprint = fingerprint || fingerprintContent(finalDraft.content);

      if (normalized) {
        usedNormalized.add(normalized);
      }
      if (fingerprint) {
        usedFingerprints.add(fingerprint);
      }
      draftMap.set(role, finalDraft);
      if (options?.onDraft) {
        await options.onDraft(finalDraft);
      }
    };

    if (mode === 'sequential') {
      for (let i = 0; i < generationRoles.length; i += 1) {
        await runRole(generationRoles[i], i);
      }
    } else {
      await Promise.all(generationRoles.map((role, index) => runRole(role, index)));
    }
  } finally {
    try {
      await detachAll();
    } catch (err) {
      console.error('[ASK][detachAll][ERROR]', err);
    }
  }

  const drafts: Card[] = generationRoles
    .filter((role) => draftMap.has(role))
    .map((role) => draftMap.get(role)!);

  // 단일 역할 → 플래너 건너뛰고 바로 답변
  let final: { cards: Card[]; metrics?: any };
  if (generationRoles.length === 1 && drafts.length === 1) {
    console.log('[ASK] Single role detected, skipping editor/planner');
    final = { cards: drafts, metrics: undefined };
  } else {
    // 여러 역할 → 플래너 실행
    final = await genEditor({ query: q, drafts, mode, roles: generationRoles });
  }

  const modelMetrics = (final.metrics ?? {}) as Record<string, unknown>;
  const fallbackTtft = Date.now() - t0;

  const ttftCandidate = Number((modelMetrics as any).ttft_ms);
  const tokensCandidate = Number((modelMetrics as any).tokens);
  const tpsCandidate = Number((modelMetrics as any).tps);

  const avgConf = drafts.reduce((s, d) => s + (d.conf ?? 0.7), 0) / Math.max(1, drafts.length);
  const metrics: AskOutput['metrics'] = {
    ttft_ms: Number.isFinite(ttftCandidate) ? ttftCandidate : fallbackTtft,
    conf: avgConf,
  };
  if (Number.isFinite(tokensCandidate)) {
    metrics.tokens = tokensCandidate;
  }
  if (Number.isFinite(tpsCandidate)) {
    metrics.tps = tpsCandidate;
  }

  console.log('[ASK][metrics]', {
    q: q.slice(0, 80),
    mode,
    roles: generationRoles,
    ttft_ms: metrics.ttft_ms ?? null,
    tps: metrics.tps ?? null,
    tokens: metrics.tokens ?? null,
    conf: metrics.conf ?? null,
  });

  const roleBases = getRoleBases();
  const out: AskOutput = {
    cards: final.cards.slice(0, 3),
    metrics,
    meta: {
      mode,
      roles,
      provider: 'local_moe',
      ai_base: roleBases,
      router_source: routerSource,
      router_confidence: routerConfidence,
    }
  };

  return out;
}

router.post('/', async (req, res) => {
  try {
    const body = (req.body ?? {}) as AskInput;
    const prepared = await prepareAsk(body);
    const out = await runAsk(prepared);
    return res.json(out);
  } catch (err: any) {
    console.error('[ASK][ERROR]', err?.message || err);
    const status = err instanceof AskHttpError ? err.status : 500;
    const code = status === 400 ? 'bad_request' : 'ask_failed';
    return res.status(status).json({ error: code, message: String(err?.message || err) });
  }
});

router.post('/stream', async (req, res) => {
  try {
    const body = (req.body ?? {}) as AskInput;
    const prepared = await prepareAsk(body);

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.flushHeaders?.();

    const started = Date.now();
    const send = (event: unknown) => {
      if (!res.writableEnded) {
        res.write(`${JSON.stringify(event)}\n`);
      }
    };

    send({ type: 'start', data: { ts: started } });

    const out = await runAsk(prepared);

    const completed = Date.now();
    if (!out.meta) out.meta = { mode: prepared.mode, roles: prepared.roles };

    out.meta = {
      ...out.meta,
      stamp: [new Date(started).toISOString(), new Date(completed).toISOString()],
    };

    if (out.metrics) {
      out.metrics.ttft_ms = out.metrics.ttft_ms ?? completed - started;
      send({ type: 'metrics', data: out.metrics });
    }

    send({ type: 'complete', data: out });
    res.end();
  } catch (err: any) {
    console.error('[ASK][STREAM][ERROR]', err?.message || err);
    if (err instanceof AskHttpError) {
      if (!res.headersSent) {
        return res.status(err.status).json({ error: 'bad_request', message: err.message });
      }
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'ask_failed', message: String(err?.message || err) });
      return;
    }
    res.write(`${JSON.stringify({ type: 'error', data: { message: String(err?.message || err) } })}\n`);
    res.end();
  }
});

export default router;
