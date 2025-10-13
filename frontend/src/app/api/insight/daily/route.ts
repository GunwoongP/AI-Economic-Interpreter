import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE =
  process.env.BACKEND_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  'http://127.0.0.1:3001';

function resolve(path: string) {
  return `${BACKEND_BASE.replace(/\/+$/, '')}${path}`;
}

export async function GET(req: NextRequest) {
  const backendUrl = new URL(resolve('/insight/daily'));
  const { searchParams } = new URL(req.url);
  searchParams.forEach((value, key) => {
    backendUrl.searchParams.set(key, value);
  });

  const upstream = await fetch(backendUrl, { cache: 'no-store' });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: 'insight_failed', detail: detail || `upstream responded with ${upstream.status}` },
      { status: upstream.status },
    );
  }

  const payload = await upstream.json();
  return NextResponse.json(payload);
}
