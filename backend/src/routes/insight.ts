import { Router } from 'express';
import { searchNaverNews, NewsSearchError } from '../services/news.js';
import { fetchSeries } from './timeseries.js';
import { genDailyInsight, type InsightBundle } from '../ai/bridge.js';

const router = Router();

router.get('/daily', async (req, res) => {
  const query = String(req.query.q ?? '코스피 코스닥 증시');
  const newsCount = Number(req.query.limit ?? 5);
  try {
    const [news, kospi, ixic] = await Promise.all([
      searchNaverNews(query, newsCount, 'date'),
      fetchSeries('KOSPI'),
      fetchSeries('IXIC'),
    ]);

    let summary: string | null = null;
    let insights: InsightBundle | null = null;
    try {
      const ai = await genDailyInsight({ focus: query, kospi, ixic, news });
      summary = ai.summary ?? ai.raw ?? null;
      insights = ai.insights ?? null;
    } catch (err) {
      console.error('[INSIGHT][daily][gen][ERROR]', err);
    }

    return res.json({
      query,
      news,
      series: { kospi, ixic },
      summary,
      insights,
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
