import type { Card, Role } from '../types.js';

export type ChatMsg = { role:'system'|'user'|'assistant'; content:string };

export interface PromptEvidence {
  label: string;
  text: string;
  source?: string;
  date?: string;
}

export function draftPrompt(role: 'eco'|'firm'|'house', q: string, evidences: PromptEvidence[], previousCards?: Card[]): ChatMsg[] {
  const roleName = role === 'eco' ? '거시경제 해석관' : role === 'firm' ? '기업분석가' : '가계 재정 코치';
  const roleGuidance = role === 'eco'
    ? '거시 지표와 정책의 인과관계를 설명하라. 참고할 역사 사례가 있으면 포함하라.'
    : role === 'firm'
    ? '기업 실적과 밸류에이션을 중심으로 분석하라.'
    : '가계 현금흐름과 포트폴리오 관점에서 설명하라.';

  const topEvidences = evidences.slice(0, 3);
  const evidenceBlock = topEvidences
    .map((item) => {
      const base = item.text.replace(/\s+/g, ' ').trim();
      const snippet = base.length > 500 ? `${base.slice(0, 497)}…` : base;
      const metaParts: string[] = [];
      if (item.source && item.source.trim()) metaParts.push(item.source.trim());
      if (item.date && item.date.trim()) metaParts.push(item.date.trim());
      const metaLine = metaParts.length ? `출처: ${metaParts.join(' | ')}` : undefined;
      return [`${item.label}: ${snippet}`, metaLine].filter(Boolean).join('\n');
    })
    .join('\n\n');

  const prior = Array.isArray(previousCards) && previousCards.length
    ? `\n\n이전 분석:\n${previousCards
        .map((card, i) => `${i + 1}. ${card.title}: ${card.content.slice(0, 300)}`)
        .join('\n')}`
    : '';

  const evidenceSection = evidenceBlock || '(근거 없음)';

  return [
    {
      role: 'system',
      content: `너는 ${roleName}이다.
- ${roleGuidance}
- 핵심 2-3가지를 불릿으로 정리하라.
- '이전 분석'이 제공되면 내용을 요약해 맥락을 연결하고, 같은 문장을 반복하지 말고 새로운 해석을 추가하라.
- 각 불릿 끝에는 [1], [2]와 같은 숫자 표기만 붙여라.
- 답변 마지막에는 반드시 '근거' 섹션을 추가하고 각 번호별로 "1. 날짜 | 출처 | 핵심요약" 형식을 사용하라.
- 모든 문장은 한국어로 작성하고 'RAG' 같은 영문 태그나 <think> 등 내부 추론 표시는 절대 출력하지 마라.
- 숫자와 단위를 명시하고, 투자권유는 금지한다.
- 제목 한 줄 + 본문으로 구성하고, 마크다운 문법을 사용하라.`
    },
    {
      role: 'user',
      content: `질문: ${q}

참고 근거:
${evidenceSection}${prior}

위 내용을 바탕으로 요약해줘.`
    }
  ];
}
/**
 * 경량화된 Router 프롬프트 (V2)
 * - Eco 서버 재사용
 * - 150자 짧은 프롬프트 (기존 1,200자 대비 -87%)
 * - max_tokens: 30 (기존 250 대비 -88%)
 * - 추론 시간: 80-120ms 예상 (기존 200-300ms 대비 -60%)
 */
export function routerPromptV2(q: string): ChatMsg[] {
  return [
    {
      role: 'system',
      content: `질문을 읽고 필요한 전문가를 선택하라.

전문가:
- eco: 금리·환율·경기·물가·정책
- firm: 기업·주가·실적·재무
- house: 가계·대출·포트폴리오·저축

출력: {"roles":["eco"]} (JSON만)`
    },
    {
      role: 'user',
      content: `${q}\n\nJSON:`
    }
  ];
}

export function editorPrompt(q: string, drafts: string[], mode: 'parallel'|'sequential', roles: Role[]): ChatMsg[] {
  const joined = drafts.map((d,i)=>`[초안${i+1}]\n${d}`).join('\n\n');
  const roleLabels: Record<Role, string> = { eco: 'ECO', firm: 'FIRM', house: 'HOUSE', combined: 'COMBINED' };
  const roleLine = roles.length ? roles.map((r) => roleLabels[r] ?? r.toUpperCase()).join(', ') : 'ECO';
  return [
    { role:'system', content:
`너는 최종 편집자다.
- 초안들을 통합해 통합 카드 1개와 보조 카드 1-2개를 생성하라.
- 각 카드는 제목 + 본문 형태이며, 불릿과 문단을 조화롭게 사용하라.
- 모순/중복을 제거하고, 역할별 고유 인사이트를 유지하라.
- 본문에서는 [1] 형식의 숫자 표기만 사용하고, 답변 하단에 '근거' 섹션을 추가하여 "1. 날짜 | 출처 | 핵심요약" 형식으로 정리하라.
- 영어 태그나 'RAG' 문자열, <think> 등의 내부 추론 표시는 절대 출력하지 마라.
- 투자권유는 금지한다.
- 마지막 줄에 "<참여 전문가> ${roleLine}" 추가.
- 내부 추론은 출력하지 마라.` },
    { role:'user', content:
`질문: ${q}

초안들:
${joined}

위 초안들을 통합해 카드 최대 3개를 생성해줘.` }
  ];
}

export function plannerPrompt(q: string, prefer: Role[] = [], hintMode: 'auto'|'parallel'|'sequential' = 'auto'): ChatMsg[] {
  const preferText = prefer.length ? `선호 역할: ${prefer.join(', ')}` : '선호 역할 없음';
  const modeHint = hintMode === 'auto' ? '모드 힌트 없음' : `모드 힌트: ${hintMode}`;
  return [
    {
      role: 'system',
      content:
`너는 역할 할당 플래너다.
- 입력 질문을 보고 어떤 전문가(eco: 거시, firm: 기업, house: 가계)가 답변에 필수인지 결정한다.
- 아래 키워드가 질문에 포함되면 해당 역할을 반드시 포함한다.
  • eco: 금리, 환율, 경기, 물가, 정책, 부동산, 유가, 글로벌, 채권, 인플레
  • firm: 기업명(삼성, 하이닉스, 네이버 등), 실적, 재무, PER, ROE, 산업, 업종, 주식, 반도체, CAPEX
  • house: 가계, 포트폴리오, 투자전략, DSR, 대출, 부채, 연금, 은퇴, 가정, 생활비, 자산배분
- 필요한 역할만 골라 JSON 배열로 출력하며, 최소 1개는 포함한다.
- mode는 'parallel' 또는 'sequential' 중 하나를 선택한다. sequential은 전문가가 순차적으로 참고할 때 사용한다.
- reason은 한국어 한 문장으로 작성한다.
- confidence는 0~1 사이 숫자(주관적 확신도)를 포함한다.
- 응답은 반드시 JSON 객체 한 줄로, 다른 텍스트를 넣지 마라.`
    },
    {
      role: 'user',
      content:
`질문: ${q}
${preferText}
${modeHint}

응답 형식 예시:
{"roles":["eco","firm"],"mode":"sequential","reason":"기업 실적과 거시 정책이 모두 중요"}`
    }
  ];
}


const ROUTE_OPTIONS_TEXT = [
  '["eco"] (거시 단독)',
  '["firm"] (기업 단독)',
  '["house"] (가계 단독)',
  '["eco","firm"] (순서: eco → firm)',
  '["firm","house"] (순서: firm → house)',
  '["eco","house"] (순서: eco → house)',
  '["eco","firm","house"] (순서: eco → firm → house)',
].join('\n- ');

export function routerPrompt(q: string, prefer: Role[] = []): ChatMsg[] {
  const preferText = prefer.length ? `선호 역할: ${prefer.join(', ')}` : '선호 역할 없음';
  return [
    {
      role: 'system',
      content:
`너는 라우터 역할을 수행한다.
- 입력 질문과 선호 역할 정보를 보고 아래 옵션 중 하나만 선택한다.
- 옵션은 정확히 아래 JSON 배열 형태 중 하나여야 한다:
- ${ROUTE_OPTIONS_TEXT}
- 배열 길이가 1이면 단일 역할 카드만 작성하면 되고, 2개 이상이면 반드시 순차적으로 이전 카드 내용을 참고해야 한다.
- path 필드는 문자열 배열 그대로 포함한다.
- mode는 path 길이가 1이면 "parallel", 2 이상이면 "sequential"로 설정한다.
- reason은 한국어 한 문장으로 작성한다.
- confidence는 0~1 범위 숫자로 작성한다.
- 정답은 반드시 JSON 객체 한 줄로 출력하고, 다른 텍스트를 추가하지 마라.
- <think></think>이 안의 부분은 출력하지마라.`    },
    {
      role: 'user',
      content:
`질문: ${q}
${preferText}

응답 형식 예시:
{"path":["eco","firm"],"mode":"sequential","reason":"기업 실적과 거시 정책이 모두 중요하다","confidence":0.78}`
    }
  ];
}
