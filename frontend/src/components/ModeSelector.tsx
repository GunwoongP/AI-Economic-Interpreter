'use client';
import { Mode } from '@/lib/types';
export default function ModeSelector({ value, onChange }:{ value: Mode; onChange:(m:Mode)=>void }){
return (
<div className="flex items-center gap-2">
<span className="text-sm text-muted">모드</span>
<select className="badge" value={value} onChange={e=>onChange(e.target.value as Mode)}>
<option value="auto">Auto</option>
<option value="parallel">Parallel</option>
<option value="sequential">Sequential</option>
</select>
</div>
);
}