export type Role = 'eco'|'firm'|'house'|'combined';
export type Mode = 'auto'|'parallel'|'sequential';


export interface Source { title?: string; url?: string; date?: string; score?: number }
export interface Card {
type: Role; title: string; content: string;
points?: string[]; sources?: Source[]; badges?: string[]; conf?: number;
}
export interface AskInput { q: string; mode?: Mode; prefer?: Role[] }
export interface AskOutput {
cards: Card[];
metrics?: { ttft_ms?: number; tps?: number; tokens?: number; conf?: number };
meta?: { mode: Mode; roles: Role[]; stamp?: string[] };
}
export interface SeriesPoint { t: number; close: number; volume?: number | null }
export interface SeriesResp { symbol: 'KOSPI'|'IXIC'; stamp: string; values: SeriesPoint[] }
