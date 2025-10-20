import type { Role } from '../types.js';

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * 경량화된 Router 프롬프트 (V2)
 * - 기존 1,200자 → 150자 (-87%)
 * - max_tokens: 250 → 30
 * - 추론 시간: 200-300ms → 80-120ms 예상
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

/**
 * Router 응답 파싱 (V2)
 */
export function parseRouterResponseV2(raw: string): { roles: Role[]; confidence: number } | null {
  try {
    // JSON 추출
    const text = raw.trim().replace(/^```json\s*|```$/g, '');
    const match = text.match(/\{[^}]+\}/);
    if (!match) return null;

    const data = JSON.parse(match[0]);

    if (!Array.isArray(data.roles)) return null;

    const roles = data.roles.filter((r: string) =>
      r === 'eco' || r === 'firm' || r === 'house'
    );

    if (!roles.length) return null;

    // 응답 길이로 신뢰도 추정
    const confidence = raw.length < 50 ? 0.9 : 0.7;

    return { roles, confidence };
  } catch {
    return null;
  }
}
