import { Router } from 'express';
import type { SeriesResp } from '../types.js';

const router = Router();

function gen(symbol: 'KOSPI'|'IXIC'): SeriesResp {
  const N=90, base = symbol==='KOSPI'?2500:15000, vol = symbol==='KOSPI'?12:60;
  const values=[] as {t:number, close:number}[]; let v=base;
  for(let i=0;i<N;i++){ v += (Math.random()-0.5)*vol; values.push({t: Date.now()-(N-i)*86400000, close: Math.max(1, v)}); }
  return { symbol, stamp: new Date().toISOString().slice(0,16).replace('T',' '), values };
}

router.get('/', async (req, res) => {
  const symbol = (String(req.query.symbol||'KOSPI') as 'KOSPI'|'IXIC');
  const data = gen(symbol);
  res.json(data);
});

export default router;
