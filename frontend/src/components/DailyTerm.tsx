'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

type DailyPayload = {
  term: string;
  definition: string;
  index: number;
  total: number;
  timestamp: number;
};

async function fetchDailyTerm(shift: number): Promise<DailyPayload> {
  const res = await fetch(`/api/daily?shift=${shift}&ts=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('오늘의 경제 상식을 불러오지 못했습니다.');
  }
  return res.json();
}

const STORAGE_KEY_INDEX = 'daily-term-index';
const STORAGE_KEY_TOTAL = 'daily-term-total';

function getInitialIndex(): number {
  if (typeof window === 'undefined') return 0;
  const rawIndex = window.localStorage.getItem(STORAGE_KEY_INDEX);
  const rawTotal = window.localStorage.getItem(STORAGE_KEY_TOTAL);
  const parsedIndex = rawIndex ? Number.parseInt(rawIndex, 10) : NaN;
  const parsedTotal = rawTotal ? Number.parseInt(rawTotal, 10) : NaN;

  const idx = Number.isFinite(parsedIndex) ? Number(parsedIndex) : null;
  const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? Number(parsedTotal) : null;

  if (idx != null && total != null) {
    return (idx + 1) % total;
  }
  if (idx != null) {
    return idx + 1;
  }
  return 0;
}

export default function DailyTerm() {
  const [index, setIndex] = useState<number>(() => getInitialIndex());
  const [terms, setTerms] = useState<Record<number, DailyPayload>>({});
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const {
    data,
    error,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['daily-term', index],
    queryFn: ({ queryKey }) => {
      const [, shift] = queryKey as [string, number];
      return fetchDailyTerm(shift);
    },
    enabled: terms[index] == null,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!data) return;
    setTerms((prev) => (prev[index] ? prev : { ...prev, [index]: data }));
    setTotalCount((prev) => prev ?? data.total);
  }, [data, index]);

  const current = terms[index] ?? data ?? null;
  const effectiveTotal = totalCount ?? current?.total ?? null;
  const hasLoop = effectiveTotal != null && effectiveTotal > 1;

  useEffect(() => {
    if (effectiveTotal != null && effectiveTotal > 0) {
      setIndex((prev) => {
        const normalized = ((prev % effectiveTotal) + effectiveTotal) % effectiveTotal;
        return normalized;
      });
    }
  }, [effectiveTotal]);

  const paragraphs = useMemo(
    () => (current?.definition ? current.definition.split(/\n+/).filter(Boolean) : []),
    [current?.definition],
  );

  useEffect(() => {
    if (effectiveTotal === 1) return;
    const target = effectiveTotal != null ? (index + 1) % effectiveTotal : index + 1;
    if (terms[target]) return;

    let active = true;
    fetchDailyTerm(target)
      .then((payload) => {
        if (!active) return;
        setTerms((prev) => (prev[target] ? prev : { ...prev, [target]: payload }));
        setTotalCount((prev) => prev ?? payload.total);
      })
      .catch(() => {
        // 프리페치 실패는 무시
      });
    return () => {
      active = false;
    };
  }, [index, effectiveTotal, terms]);

  useEffect(() => {
    if (effectiveTotal == null || effectiveTotal <= 1) return;
    const target = (index - 1 + effectiveTotal) % effectiveTotal;
    if (terms[target]) return;

    let active = true;
    fetchDailyTerm(target)
      .then((payload) => {
        if (!active) return;
        setTerms((prev) => (prev[target] ? prev : { ...prev, [target]: payload }));
        setTotalCount((prev) => prev ?? payload.total);
      })
      .catch(() => {
        // 이전 프리페치 실패는 무시
      });
    return () => {
      active = false;
    };
  }, [index, effectiveTotal, terms]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isCurrentLoading = isLoading && !current;
  const disablePrev = mounted ? (effectiveTotal != null ? effectiveTotal <= 1 : index <= 0) : true;
  const disableNext = mounted ? (effectiveTotal != null ? effectiveTotal <= 1 : false) : true;

  const handlePrev = () => {
    setIndex((prev) => {
      if (hasLoop) {
        return (prev - 1 + (effectiveTotal as number)) % (effectiveTotal as number);
      }
      return Math.max(0, prev - 1);
    });
  };

  const handleNext = () => {
    setIndex((prev) => {
      if (hasLoop) {
        return (prev + 1) % (effectiveTotal as number);
      }
      return prev + 1;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (effectiveTotal == null || effectiveTotal <= 0) return;
    const normalized = ((index % effectiveTotal) + effectiveTotal) % effectiveTotal;
    window.localStorage.setItem(STORAGE_KEY_TOTAL, String(effectiveTotal));
    window.localStorage.setItem(STORAGE_KEY_INDEX, String(normalized));
  }, [index, effectiveTotal]);

  return (
    <section className="mx-auto max-w-[1080px] px-5">
      <div className="relative flex items-center justify-center py-6">
        <div className="relative w-full max-w-[900px] px-12 md:px-16">
          <button
            type="button"
            className="absolute left-0 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-chip/70 text-lg text-text transition hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handlePrev}
            disabled={disablePrev}
            aria-label="이전 상식 보기"
          >
            ◀
          </button>

          <div className="mx-auto w-full rounded-3xl border border-border/60 bg-panel/95 p-6 shadow-soft backdrop-blur md:p-10">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-chip/70 px-3 py-1 text-[11px] uppercase tracking-wide text-muted">
                오늘의 경제 상식
                {current && (
                  <span className="rounded-full bg-accent/20 px-2 py-[2px] text-[10px] text-accent">
                    #{current.index + 1}/{current.total}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-text md:text-[26px]">
                {current?.term || (isCurrentLoading ? '용어를 가져오는 중입니다' : '표시할 상식이 없습니다')}
              </h2>
              <p className="max-w-2xl text-sm text-muted md:text-base">
                경제 초심자도 이해할 수 있도록 실생활 비유와 함께 설명해 드려요.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-border/50 bg-chip/60 p-5 text-sm leading-relaxed text-text shadow-inner">
              {isCurrentLoading && <div className="text-xs text-muted">불러오는 중…</div>}
              {error && !current && <div className="text-xs text-bad">데이터를 불러오지 못했습니다.</div>}
              {!isCurrentLoading && !error && paragraphs.length > 0 && (
                <div className="space-y-3">
                  {paragraphs.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
                </div>
              )}
              {!isCurrentLoading && !error && paragraphs.length === 0 && current && (
                <div className="text-xs text-muted">표시할 내용이 없습니다.</div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="absolute right-0 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-chip/70 text-lg text-text transition hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleNext}
            disabled={disableNext}
            aria-label="다음 상식 보기"
          >
            ▶
          </button>
        </div>
      </div>
    </section>
  );
}
