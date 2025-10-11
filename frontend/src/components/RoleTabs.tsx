'use client';
import { Role } from '@/lib/types';
const LABEL:Record<Role,string>={ eco:'🟣 경제해석', firm:'🟠 기업분석', house:'🔵 가계조언', combined:'🟢 통합' };
export default function RoleTabs({ active, onChange }:{ active: Role|'all'; onChange:(r:Role|'all')=>void }){
const items: (Role|'all')[] = ['all','eco','firm','house'];
return (
<nav className="flex gap-2 flex-wrap my-2">
{items.map(it=> (
<button key={it} onClick={()=>onChange(it)} className={`badge ${active===it? 'outline outline-2 outline-accent':''}`}>{it==='all'?'전체':LABEL[it as Role]}</button>
))}
</nav>
);
}