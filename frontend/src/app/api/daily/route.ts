import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

type DailyEntry = {
  term: string;
  definition: string;
};

let cache:
  | {
      items: DailyEntry[];
      mtimeMs: number;
    }
  | null = null;

function resolveDataPath() {
  return path.join(process.cwd(), 'data', 'bok_terms_full.jsonl');
}

async function loadTerms(): Promise<DailyEntry[]> {
  const filePath = resolveDataPath();
  const stat = await fs.stat(filePath);
  if (!cache || cache.mtimeMs !== stat.mtimeMs) {
    const raw = await fs.readFile(filePath, 'utf-8');
    const items: DailyEntry[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed.term === 'string' && typeof parsed.definition === 'string') {
          items.push({
            term: parsed.term.trim(),
            definition: parsed.definition.trim(),
          });
        }
      } catch {
        // skip invalid lines
      }
    }
    cache = { items, mtimeMs: stat.mtimeMs };
  }
  return cache.items;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawShift = Number(url.searchParams.get('shift') ?? 0);
  const shiftParam = Number.isFinite(rawShift) ? rawShift : 0;
  const terms = await loadTerms();
  if (!terms.length) {
    return NextResponse.json(
      { error: 'No terms available' },
      { status: 500 },
    );
  }
  const now = Date.now();
  const base = Math.floor(now / 10_000);
  const index = ((base + shiftParam) % terms.length + terms.length) % terms.length;
  const entry = terms[index];
  return NextResponse.json({
    ...entry,
    index,
    total: terms.length,
    timestamp: now,
  });
}
