import { Router } from 'express';
import type { AskInput, AskOutput, Card, Role } from '../types.js';
import { attachAdapters, detachAll, genDraft, genEditor, genSummary, genCombinedAnswer, classifyQueryWithRouter, AskRole, Evidence } from '../ai/bridge.js';
import { getRoleBases } from '../ai/provider_local.js';
// import { searchRAG } from '../ai/rag.js';  // Legacy token-based search
import { searchRAG, isFaissAvailable } from '../ai/rag_faiss.js';  // FAISS vector search
import { ROLE_ORDER, enforceAllowed, sanitizeSequence, selectRoles } from '../helpers/heuristicRules.js';
import { DeduplicationManager, normalizeContent } from '../helpers/deduplication.helper.js';

const router = Router();

class AskHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

function compactCardForContext(card: Card, maxLines = 6, maxChars = 800): Card {
  const lines = card.content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const cleaned: string[] = [];
  for (const line of lines) {
    const normalized = line.replace(/^[*\u2022-]\s*/, '').trim();
    if (!normalized) continue;
    cleaned.push(normalized);
    if (cleaned.length >= maxLines) break;
  }

  let body = cleaned.length ? cleaned.map((line) => `- ${line}`).join('\n') : card.content.trim();
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars).trimEnd()}...`;
  }

  return {
    ...card,
    content: body,
  };
}

function buildRoleQuery(role: AskRole, question: string, previous: Card[]): string {
  const parts: string[] = [];
  const trimmedQ = (question || '').trim();
  if (trimmedQ) {
    parts.push(trimmedQ);
  }
  if (previous.length) {
    // ✅ Fix: Extract key points from previous cards (bullets, numbered lists, keywords)
    const summary = previous
      .map((card) => {
        // Extract bullet points or numbered items for better context
        const lines = card.content.split('\n');
        const keyPoints = lines
          .filter(line => {
            const trimmed = line.trim();
            return trimmed && (
              /^[①②③④⑤⑥⑦⑧⑨⑩•\-]/.test(trimmed) || // Bullets/numbers (escaped hyphen)
              /^(주요|핵심|중요|결론|요약)/.test(trimmed) // Key headers
            );
          })
          .slice(0, 3) // Take top 3 key points
          .map(line => line.trim())
          .join(' ');

        const context = keyPoints || card.content.split('\n').slice(0, 2).join(' ').trim();
        return `[${card.type.toUpperCase()}] ${card.title}: ${context}`;
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
    // ✅ ECO role: Request 5 results (3 regular + space for historical events)
    // ✅ Other roles: Request 3 results
    const requestCount = role === 'eco' ? 5 : 3;
    let hits = await searchRAG(query, [role], requestCount);
    if (!hits.length && previous.length) {
      // 이전 카드에서 키워드 추출하여 재시도
      const keywords = previous.flatMap(c => c.content.match(/[가-힣]{2,}/g) || []).slice(0, 5).join(' ');
      hits = await searchRAG(`${question} ${keywords}`, [role], requestCount);
    }
    if (!hits.length) {
      // 최종 fallback: 질문만으로 재시도
      hits = await searchRAG(question, [role], requestCount);
    }
    const seen = new Set<string>();
    const uniqueHits = hits.filter((hit) => {
      const key = hit.text.trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ✅ For ECO role: Prioritize historical events (those with year in metadata)
    const evidences = uniqueHits.slice(0, requestCount).map((hit, idx) => {
      const meta = (hit.meta && typeof hit.meta === 'object') ? (hit.meta as Record<string, unknown>) : {};
      const source = typeof meta.title === 'string' && meta.title.trim().length
        ? meta.title.trim()
        : typeof meta.source === 'string' && meta.source.trim().length
        ? meta.source.trim()
        : undefined;
      const date = typeof meta.date === 'string' && meta.date.trim().length ? meta.date.trim() : undefined;
      const isHistoricalEvent = typeof meta.year === 'number' || (meta.id && String(meta.id).includes('_'));
      return {
        text: hit.text,
        meta: hit.meta,
        sim: hit.sim,
        label: `RAG#${idx + 1}`,
        source,
        date,
        isHistoricalEvent,
      };
    });

    // ✅ For ECO: Ensure at least 1 historical event is included if available
    if (role === 'eco') {
      const historicalEvents = evidences.filter(e => e.isHistoricalEvent);
      const regularDocs = evidences.filter(e => !e.isHistoricalEvent);

      // Mix: 2 regular docs + up to 1 historical event (total 3)
      const mixed = [
        ...regularDocs.slice(0, 2),
        ...historicalEvents.slice(0, 1),
      ].slice(0, 3);

      return mixed;
    }

    return evidences.slice(0, 3);
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
  const summaryMap = new Map<AskRole, string>();  // ✅ NEW: Store expert summaries
  const dedupe = new DeduplicationManager();

  await attachAdapters(roles);

  try {
    const runRole = async (role: AskRole, index: number) => {
      // ✅ NEW: In sequential mode, pass summaries instead of full cards
      const rawPrevious =
        mode === 'sequential'
          ? generationRoles
              .slice(0, index)
              .map((prev) => {
                const summary = summaryMap.get(prev);
                if (summary) {
                  // Create a compact "card" from the summary
                  return {
                    type: prev,
                    title: prev === 'eco' ? '거시 핵심' : prev === 'firm' ? '기업 스냅샷' : '가계 프레임',
                    content: summary,
                    conf: 0.8,
                  } as Card;
                }
                return draftMap.get(prev);
              })
              .filter(Boolean) as Card[]
          : [];

      const previousForContext = rawPrevious.slice(-3).map((card) => compactCardForContext(card));
      const evidences = await gatherEvidence(role, q, previousForContext);

      const attemptTemps = [0.3, 0.6];
      let selected: Card | null = null;
      let normalized = '';

      const generateCandidate = async (temperature: number) => {
        const candidate = await genDraft(role, q, evidences, {
          previous: previousForContext,
          temperature,
        });
        const candidateNormalized = normalizeContent(candidate.content);
        const hasMinLength = candidateNormalized.length >= 80;
        return { candidate, candidateNormalized, hasMinLength };
      };

      for (const temp of attemptTemps) {
        const { candidate, candidateNormalized, hasMinLength } = await generateCandidate(temp);
        if (!hasMinLength) continue;
        if (dedupe.isDuplicate(candidate.content)) continue;

        selected = candidate;
        normalized = candidateNormalized;
        break;
      }

      if (!selected) {
        const { candidate, candidateNormalized } = await generateCandidate(0.5);
        selected = candidate;
        normalized = candidateNormalized;
      }

      let finalDraft: Card = selected as Card;
      normalized = normalized || normalizeContent(finalDraft.content);

      // ✅ Add Markdown-style citations at the bottom of the card
      if (evidences.length) {
        const citations = evidences.map((ev, idx) => {
          const date = ev.date ?? (typeof ev.meta?.date === 'string' ? ev.meta.date : 'N/A');
          const source = ev.source ?? ev.meta?.source ?? ev.meta?.title ?? 'RAG 근거';
          return `[^${idx + 1}]: ${source} (${date})`;
        }).join('\n');

        // Append citations section at the bottom
        finalDraft.content = `${finalDraft.content.trim()}\n\n---\n**📚 출처**\n${citations}`;
        normalized = normalizeContent(finalDraft.content);
      }

      // 중복 감지 시 추가 인사이트 주입 로직 제거 (Sequential 모드에서는 자연스럽게 다른 관점 생성)
      dedupe.markAsUsed(finalDraft.content);
      // ✅ Extract embedded summary from answer (for sequential mode)
      let summaryForNextExpert = '';
      if (mode === 'sequential') {
        const content = finalDraft.content;
        const summaryMatch = content.match(/---\s*다음 전문가를 위한 요약\s*---\n([\s\S]*?)(?:\n---|\n\n|$)/);
        if (summaryMatch && summaryMatch[1]) {
          summaryForNextExpert = summaryMatch[1].trim();
          console.log(`[ASK][SUMMARY][${role}]`, summaryForNextExpert.slice(0, 100));
        } else {
          // Fallback: extract last 2 non-empty lines
          const lines = content.split('\n').filter(l => l.trim());
          summaryForNextExpert = lines.slice(-2).join('\n');
          console.log(`[ASK][SUMMARY][${role}][FALLBACK]`, summaryForNextExpert.slice(0, 100));
        }
        summaryMap.set(role, summaryForNextExpert);
      }

      draftMap.set(role, finalDraft);

      // Send full answer to frontend
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

  // ✅ NEW: Generate combined answer from summaries (for multi-expert sequential mode)
  let combinedCard: Card | null = null;
  if (mode === 'sequential' && generationRoles.length > 1 && summaryMap.size > 0) {
    try {
      const summaries = generationRoles
        .filter((role) => summaryMap.has(role))
        .map((role) => ({ role, summary: summaryMap.get(role)! }));

      if (summaries.length > 0) {
        combinedCard = await genCombinedAnswer({ query: q, summaries });
        console.log('[ASK][COMBINED]', combinedCard.content.slice(0, 150));

        // Send combined card to frontend if callback exists
        if (options?.onDraft) {
          await options.onDraft(combinedCard);
        }
      }
    } catch (err) {
      console.error('[ASK][COMBINED][ERROR]', err);
    }
  }

  const final = await genEditor({ query: q, drafts, mode, roles: generationRoles });
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

  // ✅ Sequential mode: Use genCombinedAnswer instead of genEditor's combined card
  // ✅ Parallel mode: Use genEditor's combined card as usual
  let finalCards: Card[];
  if (combinedCard) {
    // Sequential mode with combined answer: exclude genEditor's combined card
    finalCards = [...final.cards.filter(card => card.type !== 'combined'), combinedCard];
  } else {
    // Parallel mode or single-expert: use genEditor's cards as-is
    finalCards = [...final.cards];
  }

  const out: AskOutput = {
    cards: finalCards.slice(0, 4),
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
