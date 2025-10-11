'use client';
import { useState, useMemo } from 'react';
import { postAsk } from '@/lib/api';
import type { AskOutput, Mode, Role } from '@/lib/types';
import Card from './Card';

export default function QuickAsk(){
  const [q, setQ] = useState('');
  const [data, setData] = useState<AskOutput|null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  async function run(mode: Mode = 'auto', prefer: Role[] = []){
    if(!q.trim()) return;
    setLoading(true); setErr(''); setData(null);
    try{
      const r = await postAsk({ q, mode, prefer });
      setData(r);
      setQ(''); // ✅ 질문 후 입력창 비우기
    }catch(e:any){
      setErr(e?.message || '요청 실패');
    }finally{
      setLoading(false);
    }
  }

  // ✅ Enter키 처리
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>){
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      run();
    }
  }

  const top3 = useMemo(()=> (data?.cards || []).slice(0,3), [data]);

  return (
    <section className="bg-panel border border-border rounded-2xl p-4 shadow-soft space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">빠른 질문</h3>
        <div className="flex gap-2">
          <button onClick={()=>run('auto')} className="badge bg-accent/30 border-accent">
            질문 (Auto)
          </button>
          <a href="/ask" className="badge">자세히 보기</a>
        </div>
      </div>

      <textarea
        className="w-full min-h-[72px] bg-chip border border-border rounded-xl px-3 py-2 text-sm"
        value={q}
        onChange={e=>setQ(e.target.value)}
        onKeyDown={handleKeyDown} // ✅ 엔터키 처리
        placeholder="질문을 입력하고 Enter를 눌러보세요 (Shift+Enter로 줄바꿈)"
      />

      {loading && <div className="text-xs text-muted">생성 중…</div>}
      {err && <div className="text-xs text-bad">{err}</div>}

      {top3.length>0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {top3.map((c,i)=> <Card key={i} c={c} />)}
        </div>
      )}

      {!loading && !err && top3.length===0 && (
        <div className="text-xs text-muted">
          힌트: “환율이 오를 때 수출주는?”, “삼성 24Q4 실적 의미는?”
        </div>
      )}
    </section>
  );
}