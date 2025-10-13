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

// ✅ 질문에서 역할 자동 분류 (prefer 병합)
function selectRoles(q: string, prefer: Role[] = []): Role[] {
  const s = (q || '').toLowerCase();
  const R = new Set<Role>(Array.isArray(prefer) ? prefer : []);

  // 거시
  if (/(금리|환율|정책|경기|물가|부동산|dxy|유가)/.test(s)) R.add('eco');
  // 기업
  if (/(per|roe|재무|실적|기업|반도체|리츠|삼성|네이버|하이닉스|현대|sk|지수|섹터|업종|밸류)/i.test(s)) R.add('firm');
  // 가계
  if (/(가계|포트폴리오|dsr|대출|분산|예산|리스크|현금흐름|레버리지)/.test(s)) R.add('house');

  if (!R.size) R.add('eco'); // 기본값
  return Array.from(R).slice(0, 3);
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

const ROLE_ORDER: AskRole[] = ['eco', 'firm', 'house'];

function normalizeRoles(input?: Role[]): AskRole[] {
  const set = new Set<AskRole>();
  (input ?? []).forEach((role) => {
    if (role === 'eco' || role === 'firm' || role === 'house') {
      set.add(role);
    }
  });
  const ordered = ROLE_ORDER.filter((r) => set.has(r));
  if (!ordered.length) ordered.push('eco');
  return ordered;
}

async function prepareAsk(body: AskInput): Promise<PreparedAsk> {
  const q = String(body.q ?? '').slice(0, 2000);

  if (!q.trim()) {
    throw new AskHttpError(400, 'q is required');
  }

  const explicit = normalizeRoles(Array.isArray(body.roles) ? body.roles : undefined);
  const preferList = Array.isArray(body.prefer) ? body.prefer : [];
  const fallback = selectRoles(q, preferList);
  const plannerEnabled = !explicit.length;
  let planner = null;
  if (plannerEnabled) {
    planner = await planRoles({ query: q, prefer: preferList, hintMode: (body.mode ?? 'auto') as any });
  }

  const plannerRoles = planner?.roles ?? [];
  const mergedRoles = explicit.length
    ? explicit
    : normalizeRoles(Array.from(new Set([...plannerRoles, ...fallback])));

  const mode = planner?.mode ?? selectMode(q, (body.mode ?? 'auto') as any);
  const generationRoles = [...mergedRoles];

  return {
    q,
    roles: mergedRoles as Role[],
    mode,
    generationRoles: generationRoles.length ? Array.from(new Set(generationRoles)) : ['eco'],
    planReason: planner?.reason,
    planRoles: plannerRoles.length ? plannerRoles : undefined,
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

  const evid = await searchRAG(q, generationRoles as any);
  const ecoEv   = evid.filter(h => h.ns === 'macro');
  const firmEv  = evid.filter(h => h.ns === 'firm');
  const houseEv = evid.filter(h => h.ns === 'household');

  const draftMap = new Map<AskRole, Card>();
  await attachAdapters(roles);

  try {
    const runRole = async (role: AskRole, index: number) => {
      const ev =
        role === 'eco' ? ecoEv :
        role === 'firm' ? firmEv :
        houseEv;

      const previous =
        mode === 'sequential'
          ? generationRoles
              .slice(0, index)
              .map((prev) => draftMap.get(prev))
              .filter(Boolean) as Card[]
          : [];

      const draft = await genDraft(role, q, ev, { previous });
      draftMap.set(role, draft);
      if (options?.onDraft) {
        await options.onDraft(draft);
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

  const final = await genEditor({ query: q, drafts, mode });
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
