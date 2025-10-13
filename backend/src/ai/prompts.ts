import type { Role } from '../types.js';

export type ChatMsg = { role:'system'|'user'|'assistant'; content:string };

export function draftPrompt(role: 'eco'|'firm'|'house', q: string, evid: string[], previous?: string[]): ChatMsg[] {
  const roleName = role==='eco' ? '거시경제 해석관' : role==='firm'? '기업분석가' : '가계 재정 코치';
  const evidence = evid.slice(0,6).map((t,i)=>`- 근거${i+1}: ${t}`).join('\n');
  const prior = Array.isArray(previous) && previous.length
    ? `\n\n이전 전문가 의견 요약:\n${previous.map((p,i)=>`- 이전${i+1}: ${p}`).join('\n')}`
    : '';
  return [
    { role:'system', content:
`너는 ${roleName}이다.
- 과장 금지, 숫자/단위 명시, 투자권유 금지.
- 6문장 이내 핵심 서술 + 불릿 2~3개.
- 마크다운으로 제목·본문·리스트를 구성하고 리스트는 "-"로 시작한다.
- 출력은 100% 한국어로 작성하고, 영어 설명이나 내부 추론(<think>, Thought 등)은 노출하지 않는다.
- "제목:" 같은 라벨 없이 제목 한 줄과 본문을 제공한다.
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

export function editorPrompt(q: string, drafts: string[], mode: 'parallel'|'sequential'): ChatMsg[] {
  const joined = drafts.map((d,i)=>`[초안${i+1}]\n${d}`).join('\n\n');
  const modeDesc = mode === 'sequential' ? '순차(앞선 카드 내용을 다음 카드가 참조)' : '병렬(각 카드 독립 생성)';
  return [
    { role:'system', content:
`너는 최종 편집자다. 초안들을 통합해 "통합 해석" 카드(3~6문장)와
보조 카드 1~2개를 만들어라. 모순/중복 제거, 반증/리스크 1줄 포함.
투자권유 금지, 교육 목적 문구는 백엔드가 삽입한다.
현재 생성 모드는 ${modeDesc}이다.` },
    { role:'user', content:
`질문: ${q}

초안들:
${joined}

요구사항:
- 제목 + 본문 형태
- 카드 최대 3개 (통합 1 + 보조 1~2)
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
  const newsLines = params.news.slice(0, 6).map((item, idx) => `- [${idx + 1}] ${item.title} :: ${item.description}`).join('\n');
  const context = `KOSPI 흐름: ${params.kospi.trend}\n${params.kospi.summary}\n\nNASDAQ 흐름: ${params.ixic.trend}\n${params.ixic.summary}`;
  return [
    {
      role: 'system',
      content:
`너는 데일리 시장 해석가다.
- 입력된 코스피/나스닥 시계열 요약과 최신 뉴스 헤드라인을 분석해 한국어 보고서를 작성한다.
- 아래 섹션 제목을 정확히 사용하고 마크다운 h2(## 제목)로 작성: 시장 개요, 코스피 분석, 나스닥 분석, 주목 뉴스, 포트폴리오 시사점, 1문장 요약.
- 각 섹션 요구사항: 시장 개요(2문장), 코스피/나스닥 분석(각 3문장, 상승/하락 요인과 위험, 수치를 포함), 주목 뉴스(불릿 3~5개, [번호] 형식 유지), 포트폴리오 시사점(2문장), 1문장 요약(1문장).
- 숫자(증감률, 시점)는 가능하면 포함하고, 뉴스 제목 인용 시 번호와 함께 언급한다.
- 출력은 마크다운을 사용하고, 한국어로만 작성한다.`
    },
    {
      role: 'user',
      content:
`관심 주제: ${params.focus}
지수 요약:
${context}

뉴스 목록:
${newsLines || '- (뉴스 없음)'}

시장 해석을 작성해줘.`
    }
  ];
}
