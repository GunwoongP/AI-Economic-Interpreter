import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_BACKEND =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

function resolveBackend(path: string) {
  const base = DEFAULT_BACKEND.replace(/\/+$/, '');
  return `${base}${path}`;
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
    const upstream = resolveBackend('/ask/stream');

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
          error: 'ask_stream_failed',
          detail: detail || `upstream responded with HTTP ${upstreamRes.status}`,
        },
        { status: upstreamRes.status },
      );
    }

    if (!upstreamRes.body) {
      return NextResponse.json(
        {
          error: 'ask_stream_failed',
          detail: 'upstream response did not include a body',
        },
        { status: 502 },
      );
    }

    const headers = new Headers();
    headers.set(
      'Content-Type',
      upstreamRes.headers.get('content-type') || 'application/x-ndjson; charset=utf-8',
    );
    headers.set('Cache-Control', 'no-store');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    });
  } catch (error) {
    if (req.signal.aborted || `${error}`.includes('BodyStreamBuffer was aborted')) {
      return clientClosedResponse();
    }
    console.error('[ask stream proxy] error', error);
    return NextResponse.json(
      {
        error: 'ask_stream_failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
