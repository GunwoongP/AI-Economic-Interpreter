import { NextRequest, NextResponse } from 'next/server';
import { mockAsk } from './mock';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const q = String(body?.q ?? '');
  const out = mockAsk(q);
  return NextResponse.json(out);
}
