import type { AskOutput, Role } from '@/lib/types';

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function shortenTopic(q: string) {
  const normalized = q.replace(/\s+/g, ' ').trim();
  if (!normalized) return '시장';
  return normalized.length > 48 ? `${normalized.slice(0, 45)}…` : normalized;
}

export function mockAsk(q: string): AskOutput {
  const roles: Role[] = [];
  if (/(금리|환율|정책|경기|부동산|물가)/.test(q)) roles.push('eco');
  if (/(삼성|네이버|기업|재무|per|roe|반도체)/i.test(q)) roles.push('firm');
  if (/(가계|포트폴리오|dsr|대출|분산|예산)/.test(q)) roles.push('house');
  if (!roles.length) roles.push('eco');

  const topic = shortenTopic(q);
  const now = new Date();
  const timeLabel = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const tone = pick(['조심스럽게 개선되는', '방향성을 모색하는', '혼조세가 이어지는', '위험선호가 되살아난']);
  const driver = pick(['미국 금리 기대 변화', '환율 흐름', '반도체 업황 회복', '중국 경기 신호', '원자재 가격']);
  const spillover = pick(['투자 심리', '섹터 수급', '시장 변동성']);
  const caution = pick(['정책 이벤트', '환율 변동성', '에너지 가격', '글로벌 수요']);

  const cards = [
    roles.includes('eco') && (() => {
      const ecoFocus = pick(['국채 수익률', '달러 인덱스', '원자재 스프레드', '외국인 선물 포지션']);
      const ecoWatch = pick(['물가 궤적', '정책 회의 발언', '글로벌 유동성']);
      const ecoPoints = Array.from(
        new Set([
          '정책일정(FOMC/금통위) 체크',
          'DXY·유가·구리 동시 관찰',
          '장단기금리차 추세 점검',
          `(${timeLabel}) "${topic}" 관련 헤드라인 모니터링`,
          `${ecoFocus} 변동성 추적`,
        ]),
      ).slice(0, 4);
      return {
        type: 'eco' as const,
        title: `거시 핵심 — ${pick(['관전 포인트', '데일리 노트', '지표 체크'])}`,
        content: `${ecoFocus} 흐름이 ${pick(['위험자산 선호를 지지하고', '불확실성을 키우고', '외국인 수급을 자극하고'])} 있습니다. ${ecoWatch}가 "${topic}"에 어떤 영향을 주는지 비교해 보세요.`,
        points: ecoPoints,
        sources: [{ title: '한은 의사록요약', url: 'https://example.org/han', date: '2025-09-25' }],
      };
    })(),
    roles.includes('firm') && (() => {
      const per = (13.5 + Math.random() * 3).toFixed(1);
      const roe = (8 + Math.random() * 2.5).toFixed(1);
      const leverage = (18 + Math.random() * 6).toFixed(0);
      const firmCatalyst = pick(['HBM 공급 확대', 'AI 서버 투자', '재고 조정 마무리', '환율 우호 구간']);
      const firmPoints = Array.from(
        new Set([
          '실적 컨센서스 및 가이던스 변화',
          '고객사 발주·ASP 흐름',
          `경쟁사 대비 밸류에이션 갭 점검 (${timeLabel})`,
          `"${topic}" 수요와 연결된 산업 뉴스 체크`,
        ]),
      );
      return {
        type: 'firm' as const,
        title: `기업 스냅샷 — ${pick(['전망', '체크포인트', '업데이트'])}`,
        content: `PER ${per}, ROE ${roe}%, 부채비율 ${leverage}%. ${firmCatalyst}가 핵심 촉매로 언급됩니다. "${topic}"과 연관된 매출 비중과 공급망 이슈를 병행 검토하세요.`,
        points: firmPoints,
        sources: [{ title: 'IR 요약', url: 'https://example.org/ir', date: '2025-01-30' }],
      };
    })(),
    roles.includes('house') && (() => {
      const allocation = pick(['적립식 ETF', '달러·원화 분산', '채권형 상품', '현금성 자산 비중']);
      const houseTips = Array.from(
        new Set([
          '필수지출·대출 상환 캘린더 업데이트',
          '금리 변동 시나리오별 원리금 시뮬레이션',
          `"${topic}" 관련 생활비 영향 체크 (${timeLabel})`,
          '자산군 리밸런싱 주기 확인',
        ]),
      );
      return {
        type: 'house' as const,
        title: `가계 원칙 — ${pick(['포트폴리오 조언', '생활 재무 메모', '위험관리'])}`,
        content: `비상금 6–12개월 유지, 변동금리 노출 축소, ${allocation}을(를) 활용한 완충 장치 확보가 좋습니다. "${topic}" 이슈는 가계 현금흐름에서 어떤 항목에 영향을 주는지 기록해 보세요.`,
        points: houseTips,
      };
    })(),
  ].filter(Boolean) as AskOutput['cards'];

  return {
    cards,
    metrics: {
      ttft_ms: 100 + Math.round(Math.random() * 80),
      tokens: (JSON.stringify(cards).length / 4) | 0,
      tps: 35 + Math.round(Math.random() * 10),
    },
    meta: { mode: 'parallel', roles },
  };
}

