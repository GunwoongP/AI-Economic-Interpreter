import type { AskOutput } from './types';

export type ConversationTurn = {
  id: string;
  question: string;
  answer: AskOutput;
  askedAt: number;
};

export type HistoryItem = {
  id: string;
  ts: number;
  title: string;
  conversation: ConversationTurn[];
};

const KEY = 'econ.history.v2';
const LIMIT = 50;

function readRaw(): unknown {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function loadHistory(): HistoryItem[] {
  const raw = readRaw();
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is HistoryItem => Array.isArray(item?.conversation));
}

export function saveHistoryItem(item: HistoryItem) {
  const list = loadHistory();
  const merged = [item, ...list.filter((x) => x.id !== item.id)];
  const trimmed = merged.sort((a, b) => b.ts - a.ts).slice(0, LIMIT);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function removeHistory(id: string) {
  const list = loadHistory().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function clearHistory() {
  localStorage.setItem(KEY, JSON.stringify([]));
}

export function uuid() {
  return `h-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
