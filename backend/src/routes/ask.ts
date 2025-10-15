import { Router } from 'express';
import type { AskInput, AskOutput, Card, Role } from '../types.js';
import { searchRAG } from '../ai/rag.js';
import { attachAdapters, detachAll, genDraft, genEditor, planRoles, AskRole } from '../ai/bridge.js';
import { getRoleBases } from '../ai/provider_local.js';

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
  const buffer: Role[] = Array.isArray(prefer) ? prefer.slice(0, 3) : [];

  if (/(금리|환율|정책|경기|물가|부동산|dxy|유가)/.test(s)) buffer.push('eco');
  if (/(per|roe|재무|실적|기업|반도체|리츠|삼성|네이버|하이닉스|현대|sk|지수|섹터|업종|밸류)/i.test(s)) buffer.push('firm');
  if (/(가계|포트폴리오|dsr|대출|분산|예산|리스크|현금흐름|레버리지)/.test(s)) buffer.push('house');

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
  planReason?: string;
  planRoles?: AskRole[];
  planConfidence?: number;
}

async function prepareAsk(body: AskInput): Promise<PreparedAsk> {
  const q = String(body.q ?? '').slice(0, 2000);

  if (!q.trim()) {
    throw new AskHttpError(400, 'q is required');
  }

  const explicitRaw = sanitizeSequence(Array.isArray(body.roles) ? body.roles : undefined);
  const explicit = explicitRaw.length ? enforceAllowed(explicitRaw) : [];
  const preferList = Array.isArray(body.prefer) ? body.prefer : [];
  const fallback = selectRoles(q, preferList);
  const plannerEnabled = !explicit.length;
  let planner = null;
  if (plannerEnabled) {
    planner = await planRoles({ query: q, prefer: preferList, hintMode: (body.mode ?? 'auto') as any });
  }

  const plannerPath = planner?.path ?? [];
  const mergedPath = explicit.length
    ? explicit
    : plannerPath.length
    ? enforceAllowed(plannerPath)
    : fallback;

  const hasExplicitMode = body.mode && body.mode !== 'auto';
  let mode = planner?.mode ?? (mergedPath.length > 1 ? 'sequential' : 'parallel');
  if (hasExplicitMode) {
    mode = body.mode as 'parallel' | 'sequential';
  } else if (!planner?.mode && mergedPath.length <= 1) {
    mode = selectMode(q, (body.mode ?? 'auto') as any);
  }

  const generationRoles: AskRole[] = mergedPath.length ? mergedPath : ['eco'];
  const uniqueRoles = Array.from(new Set(generationRoles)) as Role[];

  return {
    q,
    roles: uniqueRoles,
    mode,
    generationRoles,
    planReason: planner?.reason,
    planRoles: plannerPath.length ? plannerPath : undefined,
    planConfidence: planner?.confidence,
  };
}

interface AskRunOptions {
  onDraft?: (draft: Card) => Promise<void> | void;
}

async function runAsk(prepared: PreparedAsk, options?: AskRunOptions): Promise<AskOutput> {
  const { q, roles, mode, generationRoles, planReason, planRoles, planConfidence } = prepared;

  console.log('[ASK]', {
    q: q.slice(0, 60),
    planner_roles: planRoles,
    roles,
    mode,
    planReason,
    planConfidence,
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
  const hasCitation = (text: string) => /\(근거\d+\s*\|/.test(text);
  const buildRoleQuery = (role: AskRole, base: string, previous: Card[]): string => {
    let query = base.trim();
    if (previous.length) {
      const prevSummary = previous
        .map((card) => `${card.title} ${card.content}`.replace(/\s+/g, ' ').slice(0, 300))
        .join(' ');
      if (prevSummary) {
        query = `${query} ${prevSummary}`.trim();
      }
    }
    if (role === 'firm') {
      query = `${query} 수혜 업종 기업 실적 전망 투자`;
    } else if (role === 'house') {
      query = `${query} 가계 투자전략 포트폴리오 위험 관리`;
    }
    return query.slice(0, 2000);
  };
  const fetchEvidence = async (role: AskRole, query: string, fallback: string) => {
    try {
      const hits = await searchRAG(query, [role] as any);
      if (hits.length) return hits;
    } catch (err) {
      console.error(`[ASK][RAG][${role}]`, err);
    }
    if (query !== fallback) {
      try {
        const hits = await searchRAG(fallback, [role] as any);
        if (hits.length) return hits;
      } catch (err) {
        console.error(`[ASK][RAG][${role}][fallback]`, err);
      }
    }
    return [];
  };

  await attachAdapters(roles);

  try {
    const runRole = async (role: AskRole, index: number) => {
      const previous =
        mode === 'sequential'
          ? generationRoles
              .slice(0, index)
              .map((prev) => draftMap.get(prev))
              .filter(Boolean) as Card[]
          : [];

      const roleQuery = buildRoleQuery(role, q, previous);
      let ev = await fetchEvidence(role, roleQuery, q);
      if (!ev.length && generationRoles.length === 1) {
        ev = await fetchEvidence(role, q, q);
      }

      const existingNormalized = new Set(usedNormalized);
      const existingFingerprints = new Set(usedFingerprints);
      const attemptTemps = [0.2, 0.45, 0.7, 0.9];
      let selected: Card | null = null;
      let normalized = '';
      let fingerprint = '';
      for (const temp of attemptTemps) {
        const candidate = await genDraft(role, q, ev, { previous, temperature: temp });
        const candidateNormalized = normalizeContent(candidate.content);
        const candidateFingerprint = fingerprintContent(candidate.content);
        const hasMinLength = candidateNormalized.length >= 80;
        const hasRef = hasCitation(candidate.content);
        selected = candidate;
        normalized = candidateNormalized;
        fingerprint = candidateFingerprint;
        if (!hasMinLength) {
          continue;
        }
        if (existingNormalized.has(candidateNormalized)) {
          continue;
        }
        if (candidateFingerprint && existingFingerprints.has(candidateFingerprint)) {
          continue;
        }
        if (!hasRef && ev.length) {
          continue;
        }
        break;
      }

      const finalDraft = selected ?? (await genDraft(role, q, ev, { previous, temperature: 0.7 }));
      normalized = normalizeContent(finalDraft.content) || normalized;
      fingerprint = fingerprintContent(finalDraft.content) || fingerprint;
      let duplicateDetected = normalized ? existingNormalized.has(normalized) : false;
      if (!duplicateDetected && fingerprint) {
        duplicateDetected = existingFingerprints.has(fingerprint);
      }

      if (!hasCitation(finalDraft.content) && ev.length) {
        const top = ev[0];
        const ref = `(근거1 | ${top.meta?.date ?? 'N/A'} | ${top.meta?.source ?? top.meta?.title ?? '출처 없음'})`;
        const lines = finalDraft.content.split('\n');
        let injected = false;
        const next = lines.map((line) => {
          const trimmed = line.trim();
          if (!injected && trimmed && /(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|^-)/.test(trimmed) && !hasCitation(line)) {
            injected = true;
            return `${line} ${ref}`.trim();
          }
          return line;
        });
        if (injected) {
          finalDraft.content = next.join('\n');
          normalized = normalizeContent(finalDraft.content);
          fingerprint = fingerprintContent(finalDraft.content) || fingerprint;
          duplicateDetected = normalized ? existingNormalized.has(normalized) : duplicateDetected;
          if (!duplicateDetected && fingerprint) {
            duplicateDetected = existingFingerprints.has(fingerprint);
          }
        }
      }

      if (duplicateDetected && ev.length) {
        const top = ev[0];
        const ref = `(근거F | ${top.meta?.date ?? 'N/A'} | ${top.meta?.source ?? top.meta?.title ?? '출처 없음'})`;
        const roleTag =
          role === 'firm'
            ? '기업 관점'
            : role === 'house'
            ? '가계 관점'
            : '거시 관점';
        finalDraft.content = `${finalDraft.content}\n- ${roleTag} 추가 인사이트: ${top.meta?.title ?? 'RAG 요약'} ${ref}`.trim();
        normalized = normalizeContent(finalDraft.content);
        fingerprint = fingerprintContent(finalDraft.content) || fingerprint;
      }

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

  const final = await genEditor({ query: q, drafts, mode, roles: generationRoles });
  const ttft   = Date.now() - t0;

  const roleBases = getRoleBases();
  const out: AskOutput = {
    cards: final.cards.slice(0, 3),
    metrics: {
      ttft_ms: ttft,
      conf: drafts.reduce((s, d) => s + (d.conf ?? 0.7), 0) / Math.max(1, drafts.length)
    },
    meta: {
      mode,
      roles,
      provider: 'local_moe',
      ai_base: roleBases,
      plan_reason: planReason,
      plan_roles: planRoles,
      plan_confidence: planConfidence,
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

    const out = await runAsk(prepared, {
      async onDraft(draft) {
        const chunks = draft.content
          .split(/\n+/)
          .map((part) => part.trim().replace(/^[*-]\s*/, ''))
          .filter(Boolean);

        if (!chunks.length) {
          send({
            type: 'line',
            data: {
              role: draft.type,
              title: draft.title,
              text: draft.content,
            },
          });
          return;
        }

        chunks.forEach((text) => {
          send({
            type: 'line',
            data: {
              role: draft.type,
              title: draft.title,
              text,
            },
          });
        });
      },
    });

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
