'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { postAsk } from '@/lib/api';


export default function TipBanner(){
const { data, error, isLoading } = useQuery({
queryKey:['tip','daily'],
queryFn:()=>postAsk({ q: '오늘의 경제 상식 한 줄' }),
staleTime: 1000 * 60 * 30, // 30분 동안 재요청 방지
retry:1,
});

const tip = useMemo(()=>{
if(error) return '명목금리와 실질금리는 다릅니다. 실질금리 ≈ 명목금리 − 기대인플레이션.';
const c0 = data?.cards?.[0];
const one = c0?.points?.[0] || c0?.content?.split(/\r?\n/)[0] || '';
return one || '분산투자는 수익 극대화가 아니라 손실 확률을 낮추는 리스크 관리 원칙입니다.';
},[data, error]);

if(isLoading) return null;
if(!tip) return null;
return (
<div className="max-w-[1080px] mx-auto px-5">
<div className="border border-dashed border-accent/70 bg-accent/10 rounded-xl p-3 flex gap-3 items-start" role="status" aria-live="polite">
<div className="w-2 h-2 rounded-full bg-accent mt-2"/>
<div>
<div className="text-xs text-muted"><b>오늘의 경제 상식</b> · {new Date().toLocaleDateString()}</div>
<div className="text-sm">{tip}</div>
</div>
</div>
</div>
);
}
