import { Router } from 'express';
import type { SeriesResp } from '../types.js';

const router = Router();

const MARKET_API_BASE = process.env.MARKET_API_BASE || 'http://127.0.0.1:8000';

async function fetchSeries(symbol: 'KOSPI' | 'IXIC'): Promise<SeriesResp> {
  const base = MARKET_API_BASE.replace(/\/+$/, '');
  const url = `${base}/series/${symbol}`;
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`market api ${res.status}: ${txt}`);
  }
  const data = (await res.json()) as SeriesResp;
  return data;
}

router.get('/', async (req, res) => {
  const symbol = (String(req.query.symbol || 'KOSPI').toUpperCase() === 'IXIC' ? 'IXIC' : 'KOSPI') as 'KOSPI' | 'IXIC';
  try {
    const data = await fetchSeries(symbol);
    return res.json(data);
  } catch (err: any) {
    console.error('[timeseries][ERROR]', err?.message || err);
    return res.status(502).json({ error: 'timeseries_failed', message: String(err?.message || err) });
  }
});

export default router;
export { fetchSeries };
