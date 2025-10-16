import { NextRequest, NextResponse } from 'next/server';
import type { SeriesResp } from '@/lib/types';

type SymbolKey = SeriesResp['symbol'];

const ALLOWED_SYMBOLS: SymbolKey[] = ['KOSPI', 'IXIC'];
const DEFAULT_BACKEND =
  process.env.MARKET_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  'http://127.0.0.1:3001';

function validateSymbol(input: string | null): SymbolKey {
  const symbol = (input || 'KOSPI') as SymbolKey;
  if (!ALLOWED_SYMBOLS.includes(symbol)) {
    throw new Error('지원하지 않는 지수입니다.');
  }
  return symbol;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = validateSymbol(searchParams.get('symbol'));

    const upstreamBase = DEFAULT_BACKEND.replace(/\/+$/, '');
    const upstream = `${upstreamBase}/timeseries?symbol=${symbol}`;
    const res = await fetch(upstream, { cache: 'no-store' });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: `시세 데이터를 불러오는 중 오류가 발생했습니다.`,
          detail: detail || `upstream responded with HTTP ${res.status}`,
        },
        { status: res.status },
      );
    }

    const payload = (await res.json()) as SeriesResp;
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[timeseries proxy] error', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '시세 데이터를 불러오는 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
