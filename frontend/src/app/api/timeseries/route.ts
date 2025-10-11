import { NextRequest, NextResponse } from 'next/server';


function gen(symbol: 'KOSPI'|'IXIC'){
const N=90, base = symbol==='KOSPI'?2500:15000, vol = symbol==='KOSPI'?12:60;
const values=[] as {t:number, close:number}[]; let v=base;
for(let i=0;i<N;i++){ v += (Math.random()-0.5)*vol; values.push({t: Date.now()-(N-i)*86400000, close: Math.max(1, v)}); }
return { symbol, stamp: new Date().toISOString().slice(0,16).replace('T',' '), values };
}


export async function GET(req: NextRequest){
const { searchParams } = new URL(req.url);
const symbol = (searchParams.get('symbol')||'KOSPI') as 'KOSPI'|'IXIC';
return NextResponse.json(gen(symbol));
}