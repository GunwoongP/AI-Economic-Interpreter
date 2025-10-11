'use client';
import { Role } from '@/lib/types';
const LABEL:Record<Role,string>={ eco:'🟣 경제해석', firm:'🟠 기업분석', house:'🔵 가계조언', combined:'🟢 통합' };
export default function RoleTabs({ active, onChange }:{ active: Role|'all'; onChange:(r:Role|'all')=>void }){
const items: (Role|'all')[] = ['all','eco','firm','house'];
return (
<nav className="my-2 flex flex-wrap gap-2">
{items.map(it=> {
const isActive = active===it;
return (
<button
  key={it}
  onClick={()=>onChange(it)}
  className={`badge transition ${isActive ? 'border-accent/60 bg-accent/25 text-text shadow-soft' : 'bg-chip/80 text-muted hover:text-text'}`}
>
  {it==='all'?'전체 보기':LABEL[it as Role]}
</button>
);
})}
</nav>
);
}
