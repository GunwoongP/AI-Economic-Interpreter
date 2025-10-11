// src/lib/api.ts
const BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, ''); // ← 끝 슬래시 제거

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type':'application/json', ...(init?.headers||{}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`HTTP ${res.status} ${url} :: ${txt}`);
  }
  return res.json();
}

export async function postAsk(body: any){
  const url = BASE ? `${BASE}/ask` : '/api/ask';   // ← BASE 있으면 백엔드, 없으면 mock
  // 디버깅 로그
  if (typeof window !== 'undefined') console.log('[postAsk] url=', url, 'BASE=', BASE, 'body=', body);
  return jfetch(url, { method:'POST', body: JSON.stringify(body) });
}

export async function getSeries(symbol: 'KOSPI'|'IXIC'){
  const url = BASE ? `${BASE}/timeseries?symbol=${symbol}` : `/api/timeseries?symbol=${symbol}`;
  if (typeof window !== 'undefined') console.log('[getSeries] url=', url, 'BASE=', BASE);
  return jfetch(url);
}
