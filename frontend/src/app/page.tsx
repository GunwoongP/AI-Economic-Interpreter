'use client';
import TipBanner from '@/components/TipBanner';
import SparkChart from '@/components/SparkChart';
import Card from '@/components/Card';
import ModeSelector from '@/components/ModeSelector';
import RoleTabs from '@/components/RoleTabs';
import MetricChips from '@/components/MetricChips';
import HistoryPanel from '@/components/HistoryPanel';
import { uuid, saveHistoryItem } from '@/lib/history';
import { useEffect, useState, useMemo } from 'react';
import { getSeries, postAsk } from '@/lib/api';
import type { SeriesResp, AskOutput, Mode, Role } from '@/lib/types';

export default function Page(){
  const [kospi, setKospi] = useState<SeriesResp|null>(null);
  const [ixic, setIxic]   = useState<SeriesResp|null>(null);
  const [oneLine, setOneLine] = useState('지수 해석: 최신 뉴스·정책·자금흐름 기반 한 줄 요약');

  const [mode, setMode] = useState<Mode>('auto');
  const [active, setActive] = useState<Role|'all'>('all');
  const [q, setQ] = useState('');
  const [data, setData] = useState<AskOutput|null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(()=>{ (async()=>{
    try{ const k = await getSeries('KOSPI'); setKospi(k); }catch{}
    try{ const x = await getSeries('IXIC'); setIxic(x); }catch{}
    try{
      const r = await postAsk({ q: '지수 변동 이유 한 줄 요약' });
      const s = r.cards?.[0]?.content?.split(/\r?\n/)[0];
      if(s) setOneLine('지수 해석: '+s);
    }catch{}
  })(); },[]);

  async function runAsk(){
    if(!q.trim()) return;
    setLoading(true); setData(null);
    setStatus('질의 중...');
    const t0 = performance.now();
    try{
      const r = await postAsk({ q, mode });
      if(!r.metrics) r.metrics = {};
      if(r.metrics.ttft_ms == null) r.metrics.ttft_ms = Math.round(performance.now()-t0);
      if(r.metrics.tokens == null) r.metrics.tokens = (JSON.stringify(r.cards||[]).length/4)|0;
      if(r.metrics.tps == null){
        const sec = Math.max(r.metrics.ttft_ms/1000,0.001);
        r.metrics.tps = (r.metrics.tokens/sec);
      }
      setData(r);
      setStatus('완료');
      saveHistoryItem({
      id: uuid(),
      ts: Date.now(),
      q,
      mode,
      roles: r.meta?.roles,
      result: r
    });
      setQ('');
    }catch(err){
      setStatus('오류');
      console.error(err);
    }finally{
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>){
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      runAsk();
    }
  }

  const filtered = useMemo(()=>{
    const cs = data?.cards||[];
    return active==='all'? cs : cs.filter(c=>c.type===active);
  },[data, active]);

  return (
    <div className="space-y-5">
      <TipBanner />

      {/* 상단 지수 스파크라인 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {kospi && <SparkChart data={kospi} title="KOSPI (3M)"/>}
        {ixic && <SparkChart data={ixic} title="NASDAQ (3M)"/>}
      </section>

      <div className="text-sm text-muted">{oneLine}</div>

      {/* === 질문 + 모드/역할/결과 === */}
      <section className="bg-panel border border-border rounded-2xl p-4 shadow-soft space-y-3">

        {/* 모드 선택 */}
        <div className="flex flex-wrap gap-2 items-center">
          <ModeSelector value={mode} onChange={setMode} />
          <input
            className="flex-1 bg-chip border border-border rounded-xl px-4 py-3"
            value={q}
            onChange={e=>setQ(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문을 입력하세요 (Enter 실행, Shift+Enter 줄바꿈)"
          />
          <button onClick={runAsk} className="badge bg-accent/30 border-accent">질문</button>
        </div>

        {/* 역할 탭 */}
        <RoleTabs active={active} onChange={setActive} />

        {/* 상태 표시 */}
        <div className="text-xs text-muted">
          {status}
          {data?.meta && (
            <span className="ml-2">
              모드: <b>{data.meta.mode}</b> · 활성: {data.meta.roles?.join(', ')}
            </span>
          )}
        </div>

        {/* 메트릭 */}
        <MetricChips data={data?.metrics} />
        
        <HistoryPanel onRerun={(prevQ)=>{ setQ(prevQ); /* 필요시 mode 세팅도 */ }} />
        {/* 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(filtered||[]).slice(0,3).map((c,i)=> <Card key={i} c={c} />)}
        </div>

        <div className="text-xs text-muted">
          ⚠️ 교육 목적의 해석입니다. 투자 권유가 아니며, 의사결정의 책임은 이용자에게 있습니다.
        </div>
      </section>
    </div>
  );
}