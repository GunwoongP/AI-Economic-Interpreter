'use client';
import { useEffect, useState } from 'react';
import { applyTheme, initTheme, Theme } from '@/lib/theme';


export default function Header(){
const [theme, setTheme] = useState<Theme>('system');
useEffect(()=>{ setTheme(initTheme()); },[]);
return (
<header className="max-w-[1080px] mx-auto px-5 py-6 flex items-center gap-3">
<div className="w-9 h-9 rounded-xl shadow-soft"
style={{background:'radial-gradient(60% 60% at 30% 30%, rgba(255,255,255,.25), transparent), conic-gradient(from 210deg, #7650ff, #4aa3ff, #22b573, #ff8a3d, #7650ff)'}}/>
<div className="flex-1">
<h1 className="text-lg font-semibold">AI 경제해석관 — Front v1</h1>
<p className="text-muted text-sm">오늘의 상식 · 지수 스파크라인 · 역할별 해석 카드</p>
</div>
<label className="text-sm mr-2">테마</label>
<select className="badge" value={theme} onChange={(e)=>{ const v=e.target.value as Theme; setTheme(v); applyTheme(v); }}>
<option value="system">시스템</option>
<option value="dark">다크</option>
<option value="light">라이트</option>
</select>
</header>
);
}