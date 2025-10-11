import type { AskOutput, Role } from '@/lib/types';

export function mockAsk(q: string): AskOutput {
  const roles: Role[] = [];
  if (/(금리|환율|정책|경기|부동산|물가)/.test(q)) roles.push('eco');
  if (/(삼성|네이버|기업|재무|per|roe|반도체)/i.test(q)) roles.push('firm');
  if (/(가계|포트폴리오|dsr|대출|분산|예산)/.test(q)) roles.push('house');
  if (!roles.length) roles.push('eco');

  const cards = [
    {
      type: 'combined',
      title: '통합 해석',
      content:
        '달러·금리·정책 흐름과 산업 모멘텀을 함께 고려하면, 최근 변동은 밸류에이션 조정과 실적 기대의 혼합이다. 가계는 유동성·레버리지·기간분산을 우선 검토.',
      conf: 0.72,
      sources: [{ title: 'Macro Brief', url: 'https://example.org/macro', date: '2025-08-21' }],
    },
    roles.includes('eco') && {
      type: 'eco',
      title: '거시 핵심',
      content: '금리 인하 기대와 유가 안정이 위험자산 선호를 지지. 다만 DXY 반등시 한국 수출주 변동성↑.',
      points: ['정책일정(FOMC/금통위)', 'DXY·유가·구리 동시 관찰', '장단기금리차'],
      sources: [{ title: '한은 의사록요약', url: 'https://example.org/han', date: '2025-09-25' }],
      conf: 0.68,
    },
    roles.includes('firm') && {
      type: 'firm',
      title: '기업 스냅샷(삼성 가정)',
      content: 'PER 14, ROE 9%, 부채비율 21%. 메모리 가격 회복과 HBM 증설이 촉매.',
      sources: [{ title: 'IR 요약', url: 'https://example.org/ir', date: '2025-01-30' }],
      conf: 0.64,
    },
    roles.includes('house') && {
      type: 'house',
      title: '가계 원칙',
      content: '비상금 6–12개월, 변동금리 노출 축소, 분할 매수/기간 분산으로 타이밍 리스크 낮추기.',
      conf: 0.58,
    },
  ].filter(Boolean) as AskOutput['cards'];

  return {
    cards,
    metrics: {
      ttft_ms: 120,
      tokens: (JSON.stringify(cards).length / 4) | 0,
      conf: 0.7,
      tps: 42,
    },
    meta: { mode: 'parallel', roles },
  };
}
