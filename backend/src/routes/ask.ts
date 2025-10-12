import { Router } from 'express';
import type { AskInput, AskOutput, Role } from '../types.js';
import { searchRAG } from '../ai/rag.js';
import { attachAdapters, detachAll, genDraft, genEditor } from '../ai/bridge.js';

const router = Router();

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
  return /(반영|기준으로|토대로|업데이트|재해석)/.test(q) ? 'sequential' : 'parallel';
}

router.post('/', async (req, res) => {
  try {
    const body = (req.body ?? {}) as AskInput;
    const q = String(body.q ?? '').slice(0, 2000);

    if (!q.trim()) {
      return res.status(400).json({ error: 'bad_request', message: 'q is required' });
    }

    // ✅ 여기서 roles와 mode를 확정
    const roles = selectRoles(q, Array.isArray(body.prefer) ? body.prefer : []);
    const mode  = selectMode(q, (body.mode ?? 'auto') as any);

    // ✅ RAG 호출에 쓸 역할 (빈 배열 방지)
    const ragRoles = (roles.length ? roles : ['eco'])
      .filter(r => r === 'eco' || r === 'firm' || r === 'house');

    console.log('[ASK]', { q: q.slice(0, 60), roles, mode });

    const t0 = Date.now();

    const evid = await searchRAG(q, ragRoles as any);
    const ecoEv   = evid.filter(h => h.ns === 'macro');
    const firmEv  = evid.filter(h => h.ns === 'firm');
    const houseEv = evid.filter(h => h.ns === 'household');

    await attachAdapters(roles);

    const [ecoDraft, firmDraft, houseDraft] = await Promise.all([
      roles.includes('eco')   ? genDraft('eco', q, ecoEv)    : null,
      roles.includes('firm')  ? genDraft('firm', q, firmEv)  : null,
      roles.includes('house') ? genDraft('house', q, houseEv): null,
    ]);

    await detachAll();

    const drafts = [ecoDraft, firmDraft, houseDraft].filter(Boolean) as any[];
    const final  = await genEditor({ query: q, drafts });
    const ttft   = Date.now() - t0;

    const out: AskOutput = {
      cards: final.cards.slice(0, 3),
      metrics: {
        ttft_ms: ttft,
        conf: drafts.reduce((s, d) => s + (d.conf ?? 0.7), 0) / Math.max(1, drafts.length)
      },
      meta: {
        mode,
        roles,
        provider: 'local',
        ai_base: process.env.LOCAL_AI_BASE || 'http://localhost:8008'
      }
    };

    return res.json(out);
  } catch (err: any) {
    console.error('[ASK][ERROR]', err?.message || err);
    return res.status(500).json({ error: 'ask_failed', message: String(err?.message || err) });
  }
});

export default router;
