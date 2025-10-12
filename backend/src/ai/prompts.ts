export type ChatMsg = { role:'system'|'user'|'assistant'; content:string };

export function draftPrompt(role: 'eco'|'firm'|'house', q: string, evid: string[]): ChatMsg[] {
  const roleName = role==='eco' ? '거시경제 해석관' : role==='firm'? '기업분석가' : '가계 재정 코치';
  const evidence = evid.slice(0,6).map((t,i)=>`- 근거${i+1}: ${t}`).join('\n');
  return [
    { role:'system', content:
`너는 ${roleName}이다.
- 과장 금지, 숫자/단위 명시, 투자권유 금지.
- 6문장 이내 핵심 서술 + 불릿 2~3개.` },
    { role:'user', content:
`질문: ${q}

근거:
${evidence}

요약 카드 초안을 작성해줘.` }
  ];
}

export function editorPrompt(q: string, drafts: string[]): ChatMsg[] {
  const joined = drafts.map((d,i)=>`[초안${i+1}]\n${d}`).join('\n\n');
  return [
    { role:'system', content:
`너는 최종 편집자다. 초안들을 통합해 "통합 해석" 카드(3~6문장)와
보조 카드 1~2개를 만들어라. 모순/중복 제거, 반증/리스크 1줄 포함.
투자권유 금지, 교육 목적 문구는 백엔드가 삽입한다.` },
    { role:'user', content:
`질문: ${q}

초안들:
${joined}

요구사항:
- 제목 + 본문 형태
- 카드 최대 3개 (통합 1 + 보조 1~2)
- 한국어로 간결하게.` }
  ];
}
