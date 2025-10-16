import { Router } from 'express';
import { searchNaverNews, NewsSearchError } from '../services/news.js';
import type { NewsItem } from '../services/news.js';
import { fetchSeries } from './timeseries.js';
import type { SeriesResp } from '../types.js';

const router = Router();

const SERIES_WINDOW = 90;
const NEWS_CAP = 5;

function takeLatestWindow(series: SeriesResp, windowSize = SERIES_WINDOW): SeriesResp {
  if (!series || !Array.isArray(series.values)) {
    return series;
  }
  const start = Math.max(series.values.length - windowSize, 0);
  return {
    ...series,
    values: series.values.slice(start),
  };
}

function normalizeNewsCount(value: number): number {
  if (!Number.isFinite(value)) return NEWS_CAP;
  return Math.max(1, Math.min(NEWS_CAP, Math.floor(value)));
}

function safeSearchNews(query: string, limit: number, sort: 'date' | 'sim'): Promise<NewsItem[]> {
  return searchNaverNews(query, limit, sort).catch((err) => {
    console.warn('[INSIGHT][daily][NEWS][WARN]', query, err instanceof Error ? err.message : err);
    return [];
  });
}

router.get('/daily', async (req, res) => {
  const query = String(req.query.q ?? '코스피 코스닥 증시');
  const globalQuery = String(req.query.gq ?? 'global stock market');
  const rawLimit = Number(req.query.limit ?? NEWS_CAP);
  const newsLimit = normalizeNewsCount(rawLimit);
  try {
    const [domesticNews, globalNews, kospiSeries, ixicSeries] = await Promise.all([
      safeSearchNews(query, newsLimit, 'date'),
      safeSearchNews(globalQuery, newsLimit, 'date'),
      fetchSeries('KOSPI'),
      fetchSeries('IXIC'),
    ]);

    const trimmedDomestic = domesticNews.slice(0, NEWS_CAP);
    const trimmedGlobal = globalNews.slice(0, NEWS_CAP);
    const combined = [...trimmedDomestic, ...trimmedGlobal].slice(0, NEWS_CAP * 2);
    const kospi = takeLatestWindow(kospiSeries);
    const ixic = takeLatestWindow(ixicSeries);

    return res.json({
      query,
      news: { domestic: trimmedDomestic, global: trimmedGlobal, combined },
      series: { kospi, ixic },
    });
  } catch (err: any) {
    if (err instanceof NewsSearchError) {
      return res.status(502).json({ error: 'news_fetch_failed', message: err.message });
    }
    console.error('[INSIGHT][daily][ERROR]', err);
    return res.status(500).json({ error: 'insight_failed', message: String(err?.message || err) });
  }
});

export default router;
