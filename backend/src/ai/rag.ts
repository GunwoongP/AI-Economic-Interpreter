export type NS = 'macro'|'firm'|'household';
export type Hit = { ns: NS; text: string; meta?: any; sim?: number };

export async function queryNS(ns: NS, _q: string, k=3): Promise<Hit[]> {
  const samples: Record<NS,string[]> = {
    macro: [
      '기준금리 동결과 유가 안정이 위험자산 선호에 우호적으로 작용.',
      '달러 인덱스 반등 시 수출주 변동성 확대 가능.',
      '정책 일정(FOMC/금통위) 앞두고 관망세.'
    ],
    firm: [
      'PER 14, ROE 9%, 부채비율 21% 수준.',
      'HBM/메모리 증설이 실적 모멘텀.',
      '리스크: 환율 급등, 경쟁 심화.'
    ],
    household: [
      '비상금 6–12개월, 레버리지 관리, 기간 분산.',
      '변동금리 노출 축소, DSR 체크.',
      '단기 타이밍보다 현금흐름 안전이 우선.'
    ]
  };
  return samples[ns].slice(0,k).map((t,i)=>({ ns, text: t, meta:{ date:'2025-09-25' }, sim: 0.8 - i*0.05 }));
}

function recency(d?:string){ if(!d) return .7; const age=(Date.now()-new Date(d).getTime())/864e5;
  return age<=30?1:age<=90?.9:age<=365?.8:.7; }
function trust(p?:string){ const t:Record<string,number>={ 한국은행:1, 통계청:1, IMF:1, OECD:1, IR:.9, 언론:.85, internal:.8 }; return t[p??'']??.8; }

export async function searchRAG(q: string, roles: ('eco'|'firm'|'house')[], k=3){
  const nsMap = { eco:'macro', firm:'firm', house:'household' } as const;
  const namespaces = [...new Set(roles.map(r => nsMap[r]))] as NS[];
  const raw = (await Promise.all(namespaces.map(ns => queryNS(ns, q, k)))).flat();

  const reranked = raw.map(h=>{
    const r=recency(h.meta?.date), t=trust(h.meta?.publisher), s=h.sim??0.8;
    return {...h, score: 0.5*s + 0.3*r + 0.2*t};
  }).sort((a,b)=> b.score - a.score);

  return reranked.slice(0, k*namespaces.length);
}
