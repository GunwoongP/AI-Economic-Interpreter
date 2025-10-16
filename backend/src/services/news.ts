export interface NewsItem {
  title: string;
  description: string;
  originallink?: string;
  link?: string;
  pubDate?: string;
}

export class NewsSearchError extends Error {}

const NAVER_NEWS_URL = 'https://openapi.naver.com/v1/search/news.json';

function htmlToText(value: string): string {
  if (!value) return '';
  return value
    .replace(/<\/?b>/gi, '')
    .replace(/<\/?i>/gi, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new NewsSearchError(`${name} 환경 변수가 설정되어 있지 않습니다.`);
  }
  return value;
}

export async function searchNaverNews(query: string, display = 10, sort: 'date' | 'sim' = 'date'): Promise<NewsItem[]> {
  if (!query?.trim()) return [];
  const cappedDisplay = Math.max(1, Math.min(display, 100));
  const clientId = getEnv('NAVER_CLIENT_ID');
  const clientSecret = getEnv('NAVER_CLIENT_SECRET');

  const url = new URL(NAVER_NEWS_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('display', String(cappedDisplay));
  url.searchParams.set('sort', sort);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });
  } catch (err) {
    throw new NewsSearchError(`네이버 뉴스 검색 요청 실패: ${String(err)}`);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new NewsSearchError(`네이버 뉴스 API 오류 (HTTP ${resp.status}): ${text}`);
  }

  let payload: any;
  try {
    payload = await resp.json();
  } catch (err) {
    throw new NewsSearchError('네이버 뉴스 응답이 JSON 형식이 아닙니다.');
  }

  const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((item) => ({
    title: htmlToText(String(item?.title ?? '')),
    description: htmlToText(String(item?.description ?? '')),
    originallink: item?.originallink || item?.link,
    link: item?.link,
    pubDate: item?.pubDate,
  }));
}

export default searchNaverNews;
