import type { Card, Role } from '../types.js';

export type ChatMsg = { role:'system'|'user'|'assistant'; content:string };

export function draftPrompt(role: 'eco'|'firm'|'house', q: string, evid: string[], previousCards?: Card[]): ChatMsg[] {
  const roleName = role==='eco' ? '거시경제 해석관' : role==='firm'? '기업분석가' : '가계 재정 코치';
  const evidence = evid.slice(0,6).map((t,i)=>`- 근거${i+1}: ${t}`).join('\n');
  const prior = Array.isArray(previousCards) && previousCards.length
    ? `\n\n이전 단계 결과:\n${previousCards.map((card,i)=>`[${card.type.toUpperCase()} ${i+1}] ${card.title}\n${card.content}`.slice(0, 1000)).join('\n\n')}`
    : '';
  const roleSpecific =
    role === 'firm'
      ? '\n- eco 카드에서 언급된 거시 변수와 RAG 근거를 연결해 수혜 업종/기업 2~3곳을 이름과 수치로 제시한다.'
      : role === 'house'
      ? '\n- 앞선 카드의 시장·기업 분석을 바탕으로 가계 포트폴리오 조정 아이디어 2가지 이상을 제시한다.'
      : '\n- 최신 거시 지표와 정책 신호를 결론과 연결한다.';
  return [
    { role:'system', content:
`너는 ${roleName}이다.
- 과장 금지, 숫자/단위 명시(최소 2개 이상), 투자권유 금지.
- 6문장 이내 핵심 서술 + 불릿 2~3개.
- 각 번호는 서로 다른 사실을 담아야 하며 중복/순환 논리를 금지한다.
- 모든 번호/불릿 문장 끝에는 해당 근거를 괄호로 표시한다. 형식: (근거1 | 2024-05-02 | 한국은행). 날짜가 없으면 N/A를 사용한다.
- 근거 라벨은 "근거1~"과 매칭되도록 사용하고, 최소 1개는 최근 5년 이내 자료를 인용한다. 최신 근거가 없으면 (근거N | N/A | 최신 근거 부족)으로 명시한다.
- 마크다운으로 제목·본문·리스트를 구성하고 리스트는 "-"로 시작한다.
- 출력은 100% 한국어로 작성하고, 영어 설명이나 내부 추론(<think>, Thought 등)은 노출하지 않는다.
- "제목:" 같은 라벨 없이 제목 한 줄과 본문을 제공한다.
- 안내 문구(예: 모순/중복 제거, 반증 등)는 결과에 포함하지 않는다.
${roleSpecific}
- 구조를 반드시 따르라: ${
      role === 'eco'
        ? '① 개념 요약 → ② 경제 원리(금리/환율/정책 연결) → ③ 단기·장기 영향 → ④ 역사 사례(연도·사건명) → ⑤ 1문장 요약'
        : role === 'firm'
        ? '① 기업/산업 현황 → ② 원인(시장/수요/경쟁 변수) → ③ 영향(실적·해외/국내 산업) → ④ 역사적 유사 사례 → ⑤ 투자 관점 요약 1문장'
        : '① 개인/가계 상황 → ② 핵심 경제 변수 → ③ 영향(현금흐름·리스크) → ④ 역사적/유명 투자 사례 → ⑤ 실행 요약 1문장'
    }.` },
    { role:'user', content:
`질문: ${q}

근거:
${evidence}${prior}

요약 카드 초안을 작성해줘.` }
  ];
}

export function editorPrompt(q: string, drafts: string[], mode: 'parallel'|'sequential', roles: Role[]): ChatMsg[] {
  const joined = drafts.map((d,i)=>`[초안${i+1}]\n${d}`).join('\n\n');
  const modeDesc = mode === 'sequential' ? '순차(앞선 카드 내용을 다음 카드가 참조)' : '병렬(각 카드 독립 생성)';
  const roleLabels: Record<Role, string> = { eco: 'ECO', firm: 'FIRM', house: 'HOUSE', combined: 'COMBINED' };
  const roleLine = roles.length ? roles.map((r) => roleLabels[r] ?? r.toUpperCase()).join(', ') : 'ECO';
  return [
    { role:'system', content:
`너는 최종 편집자다. 초안들을 통합해 "통합 해석" 카드(3~6문장)와
보조 카드 1~2개를 만들어라. 모순/중복 제거, 반증/리스크 1줄은 "⚠️ 리스크:" 형식으로 마지막에 포함한다.
역할별 고유 인사이트가 유지되도록 동일 문장을 반복하면 안 된다.
모든 주장에는 최소 1개의 근거 괄호 표기를 포함해야 한다.
투자권유 금지, 교육 목적 문구는 백엔드가 삽입한다.
현재 생성 모드는 ${modeDesc}이다.
- 순차 모드에서는 앞선 전문가 카드의 핵심을 이어받아 마지막 결론 카드에 종합 관점을 제시한다.
- 출력 마지막 줄에는 "<참여 전문가> ${roleLine}" 문구를 추가한다.
- 필요하면 최대 8문장까지 확장해도 좋다.` },
    { role:'user', content:
`질문: ${q}

초안들:
${joined}

요구사항:
- 제목 + 본문 형태
- 카드 최대 3개 (통합 1 + 보조 1~2, 내용이 없으면 해당 보조 카드를 생략)
- 한국어로 간결하게.
- 마크다운 문법으로 작성하고 각 카드 본문은 문단과 불릿을 조화롭게 사용.
- 영어 해설이나 내부 추론(<think> 등)은 출력하지 않는다.` }
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

export function dailyInsightPrompt(params: {
  focus: string;
  kospi: { trend: string; summary: string };
  ixic: { trend: string; summary: string };
  news: { title: string; description: string; link?: string; pubDate?: string }[];
}): ChatMsg[] {
  const newsLines = params.news
    .slice(0, 6)
    .map((item, idx) => `- [${idx + 1}] ${item.title} :: ${item.description}`)
    .join('\n');
  const context = `KOSPI 흐름: ${params.kospi.trend}\n${params.kospi.summary}\n\nNASDAQ 흐름: ${params.ixic.trend}\n${params.ixic.summary}`;
  return [
    {
      role: 'system',
      content:
`너는 데일리 시장 해설가다.
- 입력 데이터를 바탕으로 한국어로 간결한 시장 코멘트를 생성한다.
- 반드시 JSON 객체 한 줄만 출력한다. 마크다운, 자연어 문장, 설명 문구를 추가하지 마라.
- JSON 스키마:
{
  "label": "오늘의 해설",
  "kospi": { "title": "...", "lines": ["...", "..."] },
  "ixic": { "title": "...", "lines": ["...", "..."] }
}
- title은 40자 이내, lines 배열은 2~3개의 짧은 문장(또는 줄)로 작성한다.
- 각 문장은 지수의 등락 이유, 수급/정책/섹터 이슈, 관련 뉴스 번호(예: [1]) 등을 포함한다.
- 라인당 60자를 넘기지 말고, 연속된 공백/개행을 넣지 마라.
- <think> 같은 내부 추론을 출력하지 마라.`
    },
    {
      role: 'user',
      content:
`관심 주제: ${params.focus}
지수 요약:
${context}

뉴스 목록:
${newsLines || '- (뉴스 없음)'}

JSON을 반환해라.`
    }
  ];
}


export function marketSummaryPrompt(params: {
  focus: string;
  kospi: { trend: string; summary: string; changeText: string };
  ixic: { trend: string; summary: string; changeText: string };
  headlines: string[];
}): ChatMsg[] {
  const newsBlock = params.headlines.slice(0, 5).map((line, idx) => `- [${idx + 1}] ${line}`).join('\n');
  return [
    {
      role: 'system',
      content: `너는 증시 해석 전문가다.
- 코스피와 나스닥의 등락 원인을 시계열 데이터와 뉴스 요약을 바탕으로 4~6문장 사이의 한국어 단락으로 설명한다.
- 두 지수의 변동 폭(포인트·%)과 수급/정책 요인을 명확히 언급하고, 문장마다 근거 번호([1], [2]) 또는 지표를 붙인다.
- 첫 문장은 전체 테마를 요약하고, 이후 문장에서는 '이렇고 그래서 ...' 구조로 원인과 결과를 연결한다.
- 마지막 문장은 향후 관찰 포인트를 제시한다.
- 불필요한 마크다운이나 목록 없이 자연어 문장만 출력한다.`
    },
    {
      role: 'user',
      content: `질문 주제: ${params.focus}
코스피 흐름: ${params.kospi.trend} (${params.kospi.changeText})
코스피 요약: ${params.kospi.summary}
나스닥 흐름: ${params.ixic.trend} (${params.ixic.changeText})
나스닥 요약: ${params.ixic.summary}
관련 뉴스:
${newsBlock || '- (뉴스 없음)'}`
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
- 정답은 반드시 JSON 객체 한 줄로 출력하고, 다른 텍스트를 추가하지 마라.`
    },
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
