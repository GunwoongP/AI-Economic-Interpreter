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
    ? '거시 지표와 정책의 인과관계를 설명하라.'
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

  const evidenceSection = evidenceBlock || '(RAG 근거 없음)';

  return [
    {
      role: 'system',
      content: `너는 ${roleName}이다.
- ${roleGuidance}
- 핵심 2-3가지를 불릿으로 정리하라.
- 각 불릿 끝에는 RAG 근거가 있을 때만 괄호를 추가: (RAG#1 날짜 출처)
  예: (RAG#1 2023-01-15 한국은행)
  주의: RAG 근거에 출처가 없으면 괄호를 생략하라. 절대 URL이나 링크를 임의로 생성하지 마라.
- 숫자와 단위를 명시하고, 투자권유는 금지한다.
- 제목 한 줄 + 본문으로 구성하고, 마크다운 문법을 사용하라.
- 답변 맨 마지막에 반드시 다음 형식으로 2줄 요약을 추가하라:

--- 다음 전문가를 위한 요약 ---
[핵심 포인트 1줄]
[추가 컨텍스트 1줄]

- 내부 추론이나 메타 설명은 출력하지 마라.`
    },
    {
      role: 'user',
      content: `질문: ${q}

RAG 근거:
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
- 근거 괄호를 포함하고, 투자권유는 금지한다.
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
- 생성 전에 코스피/나스닥 요약 문장에서 전일 대비 증감폭(+/-포인트·%)을 계산해 방향을 판단하고 첫 문장에 반영한다.
- lines[0]에는 등락 방향·폭과 이를 판단한 근거(전일 대비 수치, 수급 등)를 한 문장으로 정리한다.
- lines[1]에는 뉴스·정책·섹터 중 핵심 원인을 선택해 원인→결과 구조로 설명하고 관련 뉴스 번호([1] 형식)를 붙인다. 뉴스가 없으면 데이터 근거([데이터])를 사용한다.
- lines[2]가 존재한다면 누적 흐름 또는 향후 관찰 포인트를 제시하고 앞선 분석과 인과 연결어(예: 따라서, 이 때문에)를 포함한다.
- 모든 문장은 60자 이내로 유지하고 불필요한 공백/개행을 넣지 마라.
- 내부 추론(<think></think>안의 내용 등)은 출력하지 마라.`
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
- 아래 순서를 지켜 4~6문장 한국어 단락을 작성한다. 마크다운/목록 금지, 자연어 문장만 사용한다.
  1) 코스피·나스닥 각각에 대해 제공된 요약/변동폭(changeText)을 읽고 전일 대비 상승·하락 여부와 수치를 확인한다.
  2) 첫 문장에서는 두 지수의 공통 테마를 요약하면서 각각의 전일 대비 변동폭을 함께 언급한다.
  3) 다음 문장들에서는 (지수 → 수급/정책/섹터 이슈 → 영향)의 인과 순서로 설명하고, 각 문장 끝마다 근거 번호([1]) 또는 데이터 라벨([데이터])을 붙인다.
  4) 최소 한 문장은 뉴스 헤드라인과 연결된 구체적 원인을 설명해야 하며, 문장 안에 '...해서 ...했다'처럼 원인과 결과가 모두 포함되어야 한다.
  5) 마지막 문장은 향후 관찰 포인트나 리스크를 제시하고, 앞선 흐름과 인과 연결어(따라서, 이 때문에 등)로 이어라.
- 두 지수의 숫자만 나열하지 말고, 뉴스와 정책을 근거로 해석을 제공한다.
- 내부 추론(<think> 등)은 출력하지 않는다.
- 출력은 100% 한국어로 작성한다.
- 출력에 JSON, 마크다운, 뉴스 목록, 설명 문구를 포함하지 마라.
- <think></think> 같은 내부 추론은 출력하지 마라.`
    },
    {
      role: 'user',
      content: `질문 주제: ${params.focus}
코스피 흐름 요약: ${params.kospi.trend}
코스피 전일 대비: ${params.kospi.changeText}
나스닥 흐름 요약: ${params.ixic.trend}
나스닥 전일 대비: ${params.ixic.changeText}
추가 설명: ${params.kospi.summary}
나스닥 설명: ${params.ixic.summary}
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
