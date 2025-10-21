import type { Role } from '../types.js';
import type { AskRole } from '../ai/bridge.js';

export const ROLE_ORDER: AskRole[] = ['eco', 'firm', 'house'];

export const ALLOWED_PATHS: AskRole[][] = [
  ['eco'],
  ['firm'],
  ['house'],
  ['eco', 'firm'],
  ['firm', 'house'],
  ['eco', 'house'],
  ['eco', 'firm', 'house'],
];

export function isAllowedPath(path: AskRole[]): boolean {
  return ALLOWED_PATHS.some(
    (allowed) => allowed.length === path.length && allowed.every((role, idx) => role === path[idx]),
  );
}

export function sanitizeSequence(input?: Role[]): AskRole[] {
  if (!Array.isArray(input)) return [];
  const result: AskRole[] = [];
  for (const role of input) {
    if ((role === 'eco' || role === 'firm' || role === 'house') && !result.includes(role)) {
      result.push(role);
    }
  }
  return result;
}

export function enforceAllowed(path: AskRole[]): AskRole[] {
  if (isAllowedPath(path)) {
    return path;
  }
  const normalized = ROLE_ORDER.filter((role) => path.includes(role));
  if (normalized.length && isAllowedPath(normalized)) {
    return normalized;
  }
  if (path.length === 1 && (path[0] === 'eco' || path[0] === 'firm' || path[0] === 'house')) {
    return path;
  }
  return ['eco'];
}

export function selectRoles(q: string, prefer: Role[] = []): AskRole[] {
  const s = (q || '').toLowerCase();
  const preferSeed = Array.isArray(prefer) ? sanitizeSequence(prefer.slice(0, 3)) : [];
  const preferActive = preferSeed.length > 0;
  const hasInvest = /(투자|포트폴리오|리밸런싱|매수|매도|분산투자|자산배분|전략)/.test(s);
  const hasMacroCue = /(gdp|국내총생산|금리|환율|정책|경기|경제|물가|부동산|dxy|유가)/.test(s);
  const hasSpecificFirm =
    /(삼성|하이닉스|네이버|카카오|현대|sk|lg|테슬라|엔비디아|애플|apple|msft|마이크로소프트|구글|알파벳|meta|아마존|tsmc|엔씨|ncsoft|카카오페이|kb|국민은행|신한|이마트|롯데|posco)/i.test(
      s,
    );
  const hasGenericFirm = /(기업|회사|업종|섹터|산업|종목|분야|시장)/.test(s);
  const hasHouseCue =
    /(가계|가족|은퇴|연금|저축|예금|적금|채권|포트폴리오|dsr|대출|분산|예산|리스크|현금흐름|레버리지|재무설계|자산배분|보험)/.test(
      s,
    );

  if (!preferActive) {
    if (/(삼성|하이닉스|기업|회사|종목|실적)/.test(s) && /(코스피|코스닥|지수|시장)/.test(s) && /(영향|미치|변동|흐름)/.test(s)) {
      return ['eco', 'firm'];
    }

    if (/(코스피|코스닥|지수)/.test(s) && /(돌파|기여|영향|올리|끌어올리|주도)/.test(s) && /(기업|회사|종목)/.test(s)) {
      return ['eco', 'firm'];
    }

    if (/(산업|업종|섹터|분야)/.test(s) && /(전망|분석|트렌드|성장)/.test(s) && /(투자|방법|전략)/.test(s)) {
      return ['eco', 'firm', 'house'];
    }

    if (/(금리|환율|정책|경기|물가)/.test(s) && /(주식|시장|증시|코스피)/.test(s) && /(영향|미치)/.test(s)) {
      return ['eco'];
    }

    if (/(포트폴리오|자산배분|분산투자)/.test(s) && /(구성|방법|전략)/.test(s)) {
      return ['eco', 'house'];
    }

    if (/(어떤|어디|어느)/.test(s) && /(기업|회사|종목)/.test(s) && /(투자|좋을|추천)/.test(s)) {
      return ['eco', 'firm', 'house'];
    }

    if (/(gdp|국내총생산)/.test(s)) {
      return ['eco'];
    }

    if (hasSpecificFirm && /(실적|전망|분석|재무|매출|영업이익)/.test(s) && !/(투자|방법|전략|추천|좋을)/.test(s)) {
      return ['firm'];
    }

    if (hasSpecificFirm && hasInvest) {
      return ['firm', 'house'];
    }

    if (hasSpecificFirm && !hasInvest && !hasMacroCue) {
      return ['firm'];
    }

    if (hasHouseCue && !hasSpecificFirm && !hasGenericFirm) {
      return hasMacroCue ? ['eco', 'house'] : ['house'];
    }

    if (hasMacroCue && hasInvest && !hasSpecificFirm && !hasGenericFirm) {
      return ['eco', 'house'];
    }

    if (!hasSpecificFirm && hasGenericFirm && hasInvest) {
      return ['eco', 'firm', 'house'];
    }

    if (!hasSpecificFirm && !hasGenericFirm && hasMacroCue && !hasHouseCue && !hasInvest) {
      return ['eco'];
    }
  }

  const buffer: Role[] = preferSeed.slice(0, 3);

  if (/코스피/.test(s) && /(뭐야|무엇|뜻|설명)/.test(s)) {
    return ['eco'];
  }
  if (/(기여|기여한).*(기업)/.test(s) || /(기여).*(코스피|지수)/.test(s)) {
    return ['eco', 'firm'];
  }
  if (/(삼성|하이닉스|기업|회사|종목|실적)/.test(s) && /(코스피|코스닥|지수|시장)/.test(s) && /(영향|미치|변동|흐름)/.test(s)) {
    return ['eco', 'firm'];
  }
  if (/(어떤\s*기업|기업).*투자(하면|할까|좋을까)/.test(s) || /(투자).*(기업)/.test(s)) {
    return ['eco', 'firm', 'house'];
  }

  if (/(금리|환율|정책|경기|경제|물가|부동산|dxy|유가|gdp|국내총생산)/.test(s)) buffer.push('eco');
  if (/(per|roe|재무|실적|기업|회사|종목|반도체|리츠|삼성|네이버|하이닉스|현대|sk|지수|섹터|업종|밸류)/i.test(s)) buffer.push('firm');
  if (/(가계|포트폴리오|dsr|대출|분산|예산|리스크|현금흐름|레버리지|채권|저축|예금|적금|연금|보험)/.test(s)) buffer.push('house');

  let roles = sanitizeSequence(buffer);
  if (!roles.length) {
    roles = ['eco', 'firm', 'house'];
  }
  if (!roles.includes('eco')) {
    roles = ['eco', ...roles];
  }
  if (roles.length === 1) {
    const single = roles[0];
    if (single === 'eco') {
      const addFirm = /(기업|실적|주가|산업|시장|투자|제조|수출|ai|반도체|it)/i.test(s);
      const addHouse = /(가계|포트폴리오|대출|부채|소비|투자전략|리스크|생활비)/.test(s);
      roles = ['eco'];
      if (addFirm) roles.push('firm');
      if (addHouse) roles.push('house');
      if (roles.length === 1) {
        roles.push('firm', 'house');
      }
    } else if (single === 'firm') {
      roles = ['eco', 'firm'];
      if (/(가계|포트폴리오|소비|대출|리스크)/.test(s)) {
        roles.push('house');
      }
    } else if (single === 'house') {
      roles = ['eco', 'house', 'firm'];
    }
  }

  const ordered = ROLE_ORDER.filter((role) => roles.includes(role));
  return enforceAllowed(ordered.length ? ordered : ['eco', 'firm', 'house']);
}
