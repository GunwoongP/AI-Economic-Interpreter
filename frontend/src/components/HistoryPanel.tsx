'use client';
import { useEffect, useState } from 'react';
import type { HistoryItem } from '@/lib/history';
import { loadHistory, removeHistory, togglePin, clearHistory, exportHistory } from '@/lib/history';

export default function HistoryPanel({ onRerun }:{ onRerun:(q:string)=>void }){
  const [list, setList] = useState<HistoryItem[]>([]);

  function refresh(){ setList(loadHistory()); }
  useEffect(()=>{ refresh(); },[]);

  return (
    <section className="bg-panel border border-border rounded-2xl p-4 shadow-soft space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">기록</h3>
        <div className="flex gap-2">
          <button className="badge" onClick={()=>{ const url=exportHistory(); const a=document.createElement('a'); a.href=url; a.download='econ-history.json'; a.click(); }}>
            내보내기
          </button>
          <button className="badge" onClick={()=>{ if(confirm('기록을 모두 삭제할까요?')){ clearHistory(); refresh(); } }}>
            전체 삭제
          </button>
        </div>
      </div>

      {list.length===0 && <div className="text-xs text-muted">아직 기록이 없습니다. 질문을 입력해보세요.</div>}

      <ul className="space-y-2 max-h-[300px] overflow-auto pr-1">
        {list.map(it => (
          <li key={it.id} className="border border-border rounded-xl px-3 py-2">
            <div className="flex justify-between items-center">
              <div className="text-xs text-muted">
                {new Date(it.ts).toLocaleString()} · 모드 <b>{it.mode}</b> {it.roles?.length? `· ${it.roles.join(',')}`:''}
              </div>
              <div className="flex gap-1">
                <button className="badge" onClick={()=>{ togglePin(it.id); refresh(); }}>{it.pinned?'핀 해제':'핀 고정'}</button>
                <button className="badge" onClick={()=>{ onRerun(it.q); }}>{'재실행'}</button>
                <button className="badge" onClick={()=>{ removeHistory(it.id); refresh(); }}>{'삭제'}</button>
              </div>
            </div>
            <div className="text-sm mt-1 line-clamp-2">{it.q}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
