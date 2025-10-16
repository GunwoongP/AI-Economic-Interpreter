export type Role = 'eco'|'firm'|'house'|'combined';
export type Mode = 'auto'|'parallel'|'sequential';


export interface Source { title?: string; url?: string; date?: string; score?: number }
export interface Card {
  type: Role; title: string; content: string;
  points?: string[]; sources?: Source[]; badges?: string[];
  conf?: number;
}
export interface AskInput { q: string; mode?: Mode; prefer?: Role[]; roles?: Role[] }
export interface AskOutput {
  cards: Card[];
  metrics?: { ttft_ms?: number; tps?: number; tokens?: number; conf?: number };
  meta?: {
    mode: Mode;
    roles: Role[];
    stamp?: string[];
    provider?: string;
    ai_base?: string | Record<string, string>;
    plan_reason?: string;
    plan_roles?: Role[];
    plan_confidence?: number;
  };
}

export interface NewsItem {
  title: string;
  description: string;
  originallink?: string;
  link?: string;
  pubDate?: string;
}

export interface DailyInsight {
  query: string;
  news: { domestic: NewsItem[]; global: NewsItem[]; combined: NewsItem[] };
  series: { kospi: SeriesResp; ixic: SeriesResp };
  summary?: string | null;
  insights?: {
    label?: string | null;
    kospi?: { title: string; lines: string[] } | null;
    ixic?: { title: string; lines: string[] } | null;
  } | null;
}
export interface SeriesPoint { t: number; close: number; volume?: number | null }
export interface SeriesResp { symbol: 'KOSPI'|'IXIC'; stamp: string; values: SeriesPoint[] }
