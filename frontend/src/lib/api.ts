// src/lib/api.ts
import type { AskInput, AskOutput, DailyInsight, Mode, Role, SeriesResp } from './types';

const BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, ''); // ← 끝 슬래시 제거

const JSON_HEADERS = { 'Content-Type': 'application/json' as const };

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...JSON_HEADERS, ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url} :: ${txt}`);
  }
  return res.json() as Promise<T>;
}

function apiUrl(path: string) {
  return BASE ? `${BASE}${path}` : `/api${path}`;
}

export function postAsk(body: AskInput): Promise<AskOutput> {
  const url = apiUrl('/ask');
  return jfetch<AskOutput>(url, { method: 'POST', body: JSON.stringify(body) });
}

export function getSeries(symbol: SeriesResp['symbol']) {
  const url = apiUrl(`/timeseries?symbol=${symbol}`);
  return jfetch<SeriesResp>(url);
}

export function getDailyInsight(params?: { q?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString();
  const url = apiUrl(`/insight/daily${suffix ? `?${suffix}` : ''}`);
  return jfetch<DailyInsight>(url, { method: 'GET', headers: {} });
}

export type AskStreamEvent =
  | { type: 'start'; data: { ts: number } }
  | { type: 'line'; data: { role: Role; title: string; text: string } }
  | { type: 'metrics'; data: NonNullable<AskOutput['metrics']> }
  | { type: 'complete'; data: AskOutput };

export interface StreamAskParams extends AskInput {
  signal?: AbortSignal;
  onEvent?: (evt: AskStreamEvent) => void;
}

export async function streamAsk({ signal, onEvent, ...body }: StreamAskParams): Promise<AskOutput> {
  const url = apiUrl('/ask/stream');
  const res = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url} :: ${txt}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload: AskOutput | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nlIndex = buffer.indexOf('\n');
    while (nlIndex >= 0) {
      const raw = buffer.slice(0, nlIndex).trim();
      buffer = buffer.slice(nlIndex + 1);
      if (raw) {
        try {
          const evt = JSON.parse(raw) as AskStreamEvent;
          onEvent?.(evt);
          if (evt.type === 'complete') {
            finalPayload = evt.data;
          }
        } catch (err) {
          console.error('Failed to parse stream chunk', err, raw);
        }
      }
      nlIndex = buffer.indexOf('\n');
    }
  }

  if (!finalPayload) {
    throw new Error('Stream ended without completion payload');
  }
  return finalPayload;
}
