/**
 * Heuristic Routing Rules
 *
 * Defines rule-based routing logic for selecting appropriate expert roles
 * based on question content. Rules are evaluated in priority order.
 */

import type { Role } from '../types.js';

export interface RoutingRule {
  /** Unique identifier for the rule */
  id: string;

  /** Expert roles to assign if rule matches */
  roles: Role[];

  /** Priority (1 = highest, lower numbers evaluated first) */
  priority: number;

  /** Keywords that must ALL match (AND logic) */
  keywords: RegExp[];

  /** Keywords that must NOT match (exclusion) */
  excludes?: RegExp[];

  /** Human-readable description */
  description: string;
}

/**
 * Routing rules in priority order
 * Higher priority (lower number) rules are evaluated first
 */
export const routingRules: RoutingRule[] = [
  // Priority 1: Company + Market + Impact
  {
    id: 'company-market-impact',
    roles: ['eco', 'firm'],
    priority: 1,
    keywords: [
      /삼성|하이닉스|기업|회사|종목|실적/,
      /코스피|코스닥|지수|시장/,
      /영향|미치|변동|흐름/
    ],
    description: '기업 실적이 시장에 미치는 영향'
  },

  // Priority 2: Market index + contribution + company
  {
    id: 'market-contribution',
    roles: ['eco', 'firm'],
    priority: 2,
    keywords: [
      /코스피|코스닥|지수/,
      /돌파|기여|영향|올리|끌어올리|주도/,
      /기업|회사|종목/
    ],
    description: '지수에 기여한 기업 분석'
  },

  // Priority 3: Industry + outlook + investment
  {
    id: 'industry-investment',
    roles: ['eco', 'firm', 'house'],
    priority: 3,
    keywords: [
      /산업|업종|섹터|분야/,
      /전망|분석|트렌드|성장/,
      /투자|방법|전략/
    ],
    description: '산업 전망 및 투자 전략'
  },

  // Priority 4: Macro economy + market impact (ECO only)
  {
    id: 'macro-market-impact',
    roles: ['eco'],
    priority: 4,
    keywords: [
      /금리|환율|정책|경기|물가/,
      /주식|시장|증시|코스피/,
      /영향|미치/
    ],
    excludes: [/기업/],
    description: '거시경제가 시장에 미치는 영향 (기업 제외)'
  },

  // Priority 5: Portfolio + strategy
  {
    id: 'portfolio-strategy',
    roles: ['eco', 'house'],
    priority: 5,
    keywords: [
      /포트폴리오|자산배분|분산투자/,
      /구성|방법|전략/
    ],
    description: '포트폴리오 구성 전략'
  },

  // Priority 6: General investment question
  {
    id: 'general-investment',
    roles: ['eco', 'firm', 'house'],
    priority: 6,
    keywords: [
      /어떤|어디|어느/,
      /기업|회사|종목/,
      /투자|좋을|추천/
    ],
    description: '일반 투자 질문'
  },

  // Priority 7: GDP definition
  {
    id: 'gdp-definition',
    roles: ['eco'],
    priority: 7,
    keywords: [/gdp|국내.*총생산/],
    description: 'GDP 개념 설명'
  },

  // Priority 8: Specific company + analysis (FIRM only)
  {
    id: 'company-analysis',
    roles: ['firm'],
    priority: 8,
    keywords: [
      /삼성|하이닉스|sk|lg|현대|네이버|카카오|포스코|엔비디아|테슬라|애플|apple|마이크로소프트/,
      /실적|전망|분석|재무|매출|영업이익/
    ],
    excludes: [/투자|방법|전략|추천|좋을/],
    description: '특정 기업 분석 (투자 결정 제외)'
  },

  // Priority 9: Specific company + investment decision
  {
    id: 'company-investment',
    roles: ['firm', 'house'],
    priority: 9,
    keywords: [
      /삼성|하이닉스|sk|lg|현대|네이버|카카오|포스코|엔비디아|테슬라|애플|apple|마이크로소프트/,
      /투자|포트폴리오|리밸런싱|매수|매도|분산투자|자산배분|전략/
    ],
    description: '특정 기업 투자 결정'
  },

  // Priority 10: Household finance keywords
  {
    id: 'household-finance',
    roles: ['house'],
    priority: 10,
    keywords: [/대출|적금|예금|보험|연금|세금|저축|카드|신용/],
    description: '가계 재무 관련 질문'
  },

  // Priority 11: Macro economy keywords
  {
    id: 'macro-economy',
    roles: ['eco'],
    priority: 11,
    keywords: [/경기|성장률|물가|금리|환율|실업|인플레이션|디플레이션/],
    description: '거시경제 지표'
  },
];

/**
 * Selects appropriate expert roles based on question content
 * using rule-based matching
 *
 * @param question - User's question
 * @returns Array of expert roles, or default all roles if no match
 */
export function selectRolesByRules(question: string): Role[] {
  const s = question.toLowerCase();

  // Sort rules by priority (lower number = higher priority)
  const sortedRules = [...routingRules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    // Check if all keywords match
    const keywordMatch = rule.keywords.every(kw => kw.test(s));

    // Check if any excludes match
    const excludeMatch = rule.excludes?.some(ex => ex.test(s)) ?? false;

    if (keywordMatch && !excludeMatch) {
      console.log(`[HeuristicRouter] Matched rule: ${rule.id} - ${rule.description}`);
      return rule.roles;
    }
  }

  // Default: all experts
  console.log('[HeuristicRouter] No rule matched, using default: all experts');
  return ['eco', 'firm', 'house'];
}

/**
 * Gets rule by ID (for testing/debugging)
 */
export function getRuleById(id: string): RoutingRule | undefined {
  return routingRules.find(r => r.id === id);
}

/**
 * Gets all rules matching specific roles (for testing/debugging)
 */
export function getRulesByRoles(roles: Role[]): RoutingRule[] {
  return routingRules.filter(rule =>
    roles.length === rule.roles.length &&
    roles.every(r => rule.roles.includes(r))
  );
}
