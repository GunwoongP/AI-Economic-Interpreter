'use client';
import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import MetricChips from '@/components/MetricChips';
import { useAskStream } from '@/hooks/useAskStream';
import type { Mode, Role } from '@/lib/types';
import Card from './Card';

export default function QuickAsk(){
const [q, setQ] = useState('');
const askStream = useAskStream();
const metrics = askStream.metrics || askStream.data?.metrics || null;
const top3 = useMemo(()=> (askStream.data?.cards || []).slice(0,3), [askStream.data]);

async function run(modeArg: Mode = 'auto', prefer: Role[] = []){
const trimmed = q.trim();
if(!trimmed) return;
try{
await askStream.ask({ q: trimmed, mode: modeArg, prefer });
setQ('');
}catch{
// handled inside hook
}
}

function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>){
if(e.key==='Enter' && !e.shiftKey){
e.preventDefault();
run();
}
}

return (
<section className="space-y-3 rounded-2xl border border-border bg-panel p-4 shadow-soft">
<div className="flex items-center justify-between gap-3">
<h3 className="text-sm font-semibold">빠른 질문</h3>
<div className="flex gap-2">
<MetricChips data={metrics ?? undefined} />
<button onClick={()=>run('auto')} className="badge border-accent bg-accent/30">질문 (Auto)</button>
</div>
</div>
<textarea
className="min-h-[72px] w-full rounded-xl border border-border bg-chip px-3 py-2 text-sm"
value={q}
onChange={e=>setQ(e.target.value)}
onKeyDown={handleKeyDown}
placeholder="질문을 입력하고 Enter를 눌러보세요 (Shift+Enter로 줄바꿈)"
/>
{askStream.isLoading && <div className="text-xs text-muted">생성 중…</div>}
{askStream.error && <div className="text-xs text-bad">{askStream.error}</div>}
{askStream.lines.length>0 && (
<div className="space-y-2 rounded-xl border border-border bg-chip/70 p-3 text-sm">
<div className="text-xs text-muted">실시간 응답</div>
{Object.entries(askStream.grouped).map(([title, lines])=>(
<div key={title}>
<div className="font-semibold">{title}</div>
<ul className="ml-4 list-disc space-y-1">
{lines.map(line=> <li key={line.id}>{line.text}</li>)}
</ul>
</div>
))}
</div>
)}
{top3.length>0 && (
<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
{top3.map((c,i)=> <Card key={`${c.title}-${i}`} c={c} />)}
</div>
)}
{!askStream.isLoading && !askStream.error && top3.length===0 && (
<div className="text-xs text-muted">
힌트: “환율이 오를 때 수출주는?”, “삼성 24Q4 실적 의미는?”
</div>
)}
</section>
);
}
