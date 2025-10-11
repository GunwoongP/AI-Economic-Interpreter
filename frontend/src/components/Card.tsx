import { Card as TCard } from '@/lib/types';
const BCLR:Record<string,string>={ eco:'bg-[#7650ff]', firm:'bg-[#ff8a3d]', house:'bg-[#4aa3ff]', combined:'bg-[#22b573]' };


function Sources({ list }:{ list: TCard['sources'] }){
if(!list?.length) return null;
return (
<div className="mt-2 text-xs text-muted">
근거: {list.map((s,i)=> s?.url? <a key={i} href={s.url} target="_blank" rel="noreferrer" className="underline mr-2">{s.title||s.url}</a> : <span key={i} className="mr-2">{s?.title||''}</span>)}
</div>
);
}

export default function Card({ c }:{ c:TCard }){
return (
<div className="bg-panel border border-border rounded-2xl p-4 shadow-soft">
<h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
<span className={`w-2 h-2 rounded-full ${BCLR[c.type]||'bg-accent'}`}/>
{c.title}
{typeof c.conf==='number' && <span className="badge ml-2">Conf {c.conf.toFixed(2)}</span>}
</h3>
{c.content && <p className="text-sm whitespace-pre-wrap leading-relaxed">{c.content}</p>}
{Array.isArray(c.points)&&c.points.length>0 && (
<ul className="list-disc pl-5 mt-2 text-sm">{c.points.map((p,i)=><li key={i}>{p}</li>)}</ul>
)}
<Sources list={c.sources}/>
</div>
);
}