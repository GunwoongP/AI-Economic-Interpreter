'use client';
import { Mode } from '@/lib/types';
export default function ModeSelector({ value, onChange }:{ value: Mode; onChange:(m:Mode)=>void }){
return (
<div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-chip/70 px-3 py-2 text-sm text-muted shadow-soft backdrop-blur">
  <span className="font-medium text-text">응답 방식</span>
  <select
    className="rounded-xl border border-border/40 bg-panel/70 px-3 py-1 text-sm text-text focus:border-accent focus:outline-none"
    value={value}
    onChange={e=>onChange(e.target.value as Mode)}
  >
    <option value="auto">자동 요약</option>
    <option value="parallel">병렬 해석</option>
    <option value="sequential">순차 진행</option>
  </select>
</div>
);
}
