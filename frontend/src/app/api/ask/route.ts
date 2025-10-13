import { NextRequest, NextResponse } from 'next/server';
import type { AskOutput } from '@/lib/types';

const BACKEND_BASE =
  process.env.BACKEND_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  'http://127.0.0.1:3001';

function resolveBackend(path: string) {
  return `${BACKEND_BASE.replace(/\/+$/, '')}${path}`;
}

function clientClosedResponse() {
  return new NextResponse(null, { status: 499, statusText: 'Client Closed Request' });
}

export async function POST(req: NextRequest) {
  if (req.signal.aborted) {
    return clientClosedResponse();
  }

  try {
    const payload = await req.text();
    const upstream = resolveBackend('/ask');
    const upstreamRes = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      cache: 'no-store',
      signal: req.signal,
    });

    if (!upstreamRes.ok) {
      const detail = await upstreamRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'ask_failed',
          detail: detail || `upstream responded with HTTP ${upstreamRes.status}`,
        },
        { status: upstreamRes.status },
      );
    }

    const data = (await upstreamRes.json()) as AskOutput;
    return NextResponse.json(data);
  } catch (error) {
    if (req.signal.aborted || `${error}`.includes('BodyStreamBuffer was aborted')) {
      return clientClosedResponse();
    }
    console.error('[ask proxy] error', error);
    return NextResponse.json(
      {
        error: 'ask_failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
