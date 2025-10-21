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
      path: string;
    }
  | null = null;

type FileStat = Awaited<ReturnType<typeof fs.stat>>;

let resolvedDataPath: string | null = null;

async function resolveDataPath(): Promise<{ filePath: string; stat: FileStat }> {
  const candidates: string[] = [];

  if (resolvedDataPath) {
    candidates.push(resolvedDataPath);
  }

  const envPath = process.env.BOK_TERMS_PATH;
  if (envPath) {
    candidates.push(path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath));
  }

  const defaultCandidates = [
    path.join(process.cwd(), 'data', 'bok_terms_full.jsonl'),
    path.join(process.cwd(), '..', 'RAG_zzin', 'data', 'bok_terms_full.jsonl'),
    path.join(process.cwd(), '..', 'RAG', 'data', 'bok_terms_full.jsonl'),
  ];

  for (const candidate of defaultCandidates) {
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        resolvedDataPath = candidate;
        return { filePath: candidate, stat };
      }
    } catch (err: any) {
      if (err?.code && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        console.warn(`[daily api] failed to access ${candidate}: ${String(err?.code ?? err)}`);
      }
    }
  }

  resolvedDataPath = null;
  throw new Error('bok_terms_full.jsonl not found in expected locations');
}

async function loadTerms(): Promise<DailyEntry[]> {
  const { filePath, stat } = await resolveDataPath();
  if (!cache || cache.mtimeMs !== stat.mtimeMs || cache.path !== filePath) {
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
    cache = { items, mtimeMs: stat.mtimeMs, path: filePath };
  }
  return cache.items;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawShift = Number(url.searchParams.get('shift') ?? 0);
  const shiftParam = Number.isFinite(rawShift) ? rawShift : 0;
  let terms: DailyEntry[];
  try {
    terms = await loadTerms();
  } catch (err) {
    console.error('[daily api] failed to load daily terms data', err);
    return NextResponse.json(
      { error: 'Daily terms dataset is unavailable. Please verify bok_terms_full.jsonl exists.' },
      { status: 500 },
    );
  }
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
