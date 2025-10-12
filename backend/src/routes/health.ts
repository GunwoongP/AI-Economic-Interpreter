import { Router } from 'express';
import { localGenerate } from '../ai/provider_local.js';

const router = Router();

router.get('/', async (_req, res) => {
  let aiCore = false;
  try {
    const r = await localGenerate([
      { role:'system', content:'You are a health check.' },
      { role:'user', content:'Reply with OK' }
    ]);
    aiCore = /ok/i.test(r.content.trim());
  } catch { aiCore = false; }

  res.json({
    status: aiCore ? 'ok' : 'degraded',
    services: { vectorDB: true, aiCore, sqlite: true },
    timestamp: new Date().toISOString()
  });
});

export default router;
