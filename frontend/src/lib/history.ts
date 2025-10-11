import type { AskOutput, Mode, Role } from './types';

export type HistoryItem = {
  id: string;                 // uuid-like
  ts: number;                 // timestamp
  q: string;
  mode: Mode;
  roles?: Role[];
  result?: AskOutput;         // 전체 카드/메트릭
  pinned?: boolean;
};

const KEY = 'econ.history.v1';
const LIMIT = 50;

export function loadHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveHistoryItem(item: HistoryItem) {
  const list = loadHistory();
  const merged = [item, ...list.filter(x => x.id !== item.id)];
  const trimmed = merged
    .sort((a,b)=> b.ts - a.ts)
    .slice(0, LIMIT);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function removeHistory(id: string) {
  const list = loadHistory().filter(x => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function togglePin(id: string) {
  const list = loadHistory().map(x => x.id===id ? {...x, pinned: !x.pinned} : x);
  // 핀 고정은 상단 정렬
  const sorted = list.sort((a,b)=> (Number(b.pinned)-Number(a.pinned)) || (b.ts-a.ts));
  localStorage.setItem(KEY, JSON.stringify(sorted));
}

export function clearHistory() { localStorage.setItem(KEY, JSON.stringify([])); }

export function exportHistory(): string {
  const blob = new Blob([JSON.stringify(loadHistory(), null, 2)], { type: 'application/json' });
  return URL.createObjectURL(blob);
}

export function uuid() {
  return 'h-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}