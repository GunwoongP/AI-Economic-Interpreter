'use client';
import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DailyTerm from '@/components/DailyTerm';
import SparkChart from '@/components/SparkChart';
import Card from '@/components/Card';
import ModeSelector from '@/components/ModeSelector';
import RoleTabs from '@/components/RoleTabs';
import MetricChips from '@/components/MetricChips';
import HistoryPanel from '@/components/HistoryPanel';
import { useAskStream } from '@/hooks/useAskStream';
import { getSeries } from '@/lib/api';
import type { Mode, Role, SeriesResp } from '@/lib/types';
import { loadHistory, saveHistoryItem, uuid } from '@/lib/history';

function useSeries(symbol: SeriesResp['symbol']) {
  return useQuery({
    queryKey: ['series', symbol],
    queryFn: () => getSeries(symbol),
    retry: 1,
    staleTime: 1000 * 60 * 15,
  });
}

export default function Page() {
  const [mode, setMode] = useState<Mode>('auto');
  const [active, setActive] = useState<Role | 'all'>('all');
  const [q, setQ] = useState('');
  const latestQ = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const queryClient = useQueryClient();

  const kospi = useSeries('KOSPI');
  const ixic = useSeries('IXIC');

  const askStream = useAskStream((result) => {
    saveHistoryItem({
      id: uuid(),
      ts: Date.now(),
      q: latestQ.current,
      mode,
      roles: result.meta?.roles,
      result,
    });
    queryClient.setQueryData(['history'], loadHistory());
  });

  const filtered = useMemo(() => {
    const cards = askStream.data?.cards ?? [];
    return active === 'all' ? cards : cards.filter((c) => c.type === active);
  }, [askStream.data?.cards, active]);

  const metrics = askStream.metrics || askStream.data?.metrics || null;
  const meta = askStream.meta || askStream.data?.meta || null;
  const statusText = askStream.isLoading ? '질의 중…' : askStream.error ? '오류' : askStream.data ? '완료' : '';
  const tileClass = 'rounded-3xl border border-border/60 bg-panel/90 p-5 text-sm shadow-soft backdrop-blur';
  const kospiInsight = {
    title: '외국인 차익실현이 코스피를 눌렀어요',
    description:
      '원·달러 환율이 다시 1,380원대에 진입하며 외국인과 기관이 동반 순매도로 전환했습니다. 반도체 단가 조정 뉴스가 전해지며 업종 전반에 약세가 번진 하루였습니다.',
  };
  const ixicInsight = {
    title: 'AI 성장주가 나스닥 상승을 이끌었어요',
    description:
      '미 국채 금리가 진정되자 기술주로 자금이 빠르게 회귀했습니다. 엔비디아와 메가테크 실적 기대감이 살아나면서 투자 심리가 개선된 것이 지수 상승을 뒷받침했습니다.',
  };
  const sampleQuestions = [
    '금리가 오르면 내 대출 이자는 어떻게 변할까요?',
    '한국 증시가 하락하면 기업 입장에서는 어떤 전략을 쓰나요?',
    '요즘 뉴스에 나온 "소프트랜딩"이 무슨 뜻인지 알려줘요.',
  ];

  async function runAsk() {
    const trimmed = q.trim();
    if (!trimmed) return;
    latestQ.current = trimmed;
    setActive('all');
    try {
      await askStream.ask({ q: trimmed, mode });
      setQ('');
    } catch {
      // error already handled via askStream.error state
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runAsk();
    }
  }

  return (
    <div className="space-y-8 md:space-y-12">
      <DailyTerm />

      <section className="mx-auto max-w-[1080px] space-y-4 px-5">
        <header className="space-y-1.5">
          <h2 className="text-xl font-semibold text-text md:text-2xl">오늘 시장 한눈에</h2>
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {kospi.isError && <div className={`${tileClass} text-bad`}>KOSPI 데이터를 불러오지 못했습니다.</div>}
          {kospi.isLoading && !kospi.data && <div className={`${tileClass} text-muted`}>KOSPI 로드 중…</div>}
          {kospi.data && <SparkChart data={kospi.data} title="KOSPI (3개월)" insight={kospiInsight} />}

          {ixic.isError && <div className={`${tileClass} text-bad`}>NASDAQ 데이터를 불러오지 못했습니다.</div>}
          {ixic.isLoading && !ixic.data && <div className={`${tileClass} text-muted`}>NASDAQ 로드 중…</div>}
          {ixic.data && <SparkChart data={ixic.data} title="NASDAQ (3개월)" insight={ixicInsight} />}
        </div>
      </section>

      <section className="relative mx-auto max-w-[1080px] overflow-hidden rounded-3xl border border-border/60 bg-panel/95 px-5 py-6 shadow-soft backdrop-blur md:px-8 md:py-8">
        <MetricChips data={metrics} className="absolute right-6 top-6 hidden md:flex" />
        <div className="flex flex-col gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-chip/80 px-3 py-1 text-[11px] uppercase tracking-wide text-muted">
              챗봇에게 물어보세요
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-text md:text-[28px]">
                  무엇이 궁금하신가요?
                </h2>
                <p className="text-sm text-muted md:text-base">
                  경제 상황이 처음이어도 이해하기 쉽게 요약해 드립니다. 차트·뉴스·정책 변화까지 역할별로 설명해요.
                </p>
              </div>
              <ModeSelector value={mode} onChange={setMode} />
            </div>
            <ul className="grid gap-2 text-xs text-muted md:grid-cols-3 md:text-sm">
              {sampleQuestions.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-border/60 bg-chip/70 p-4 text-left transition hover:border-accent/50 hover:text-text"
                    onClick={() => {
                      setQ(question);
                      textareaRef.current?.focus();
                    }}
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="space-y-3">
              <textarea
                ref={textareaRef}
                className="h-32 w-full resize-none rounded-2xl border border-border/60 bg-chip/70 px-4 py-3 text-sm text-text shadow-inner focus:border-accent focus:outline-none focus:ring-0 md:text-base"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="궁금한 점을 적어주세요."
              />
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-chip/70 px-3 py-1">
                  <span className="kbd">Enter</span>
                  <span>전송</span>
                  <span className="kbd">Shift</span>
                  <span>+</span>
                  <span className="kbd">Enter</span>
                  <span>줄바꿈</span>
                </div>
                <button
                  onClick={runAsk}
                  className="inline-flex items-center gap-2 rounded-2xl border border-accent/50 bg-accent/30 px-5 py-2 text-sm font-semibold text-text transition hover:bg-accent/40"
                >
                  질문 보내기
                </button>
              </div>
            </div>

            <MetricChips data={metrics} className="flex md:hidden" />
          </div>

          <div className="space-y-4 rounded-3xl border border-border/60 bg-chip/75 p-5 text-sm shadow-soft">
            <h3 className="text-lg font-semibold tracking-tight text-text md:text-xl">답변</h3>
            <RoleTabs active={active} onChange={setActive} />

            <div className="space-y-2 text-xs text-muted">
              <div>
                {statusText}
                {meta && (
                  <span className="ml-2">
                    모드 <b>{meta.mode}</b>
                    {meta.roles?.length ? ` · ${meta.roles.join(', ')}` : ''}
                  </span>
                )}
              </div>
              {askStream.error && <div className="text-bad">{askStream.error}</div>}
            </div>

            {askStream.lines.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-border/60 bg-panel/80 p-4 text-sm">
                <div className="text-xs text-muted">실시간 응답</div>
                <div className="space-y-3">
                  {Object.entries(askStream.grouped).map(([title, lines]) => (
                    <div key={title} className="rounded-2xl border border-border/50 bg-chip/70 p-4">
                      <div className="text-sm font-semibold text-text">{title}</div>
                      <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted">
                        {lines.map((line) => (
                          <li key={line.id}>• {line.text}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filtered.slice(0, 3).map((c, i) => (
                <Card key={`${c.title}-${i}`} c={c} />
              ))}
            </div>
          </div>

          <HistoryPanel
            onRerun={(prevQ) => {
              setQ(prevQ);
            }}
          />

          <p className="px-1 text-xs text-muted">
            ⚠️ 교육 목적의 해석입니다. 투자 권유가 아니며, 의사결정의 책임은 이용자에게 있습니다.
          </p>
        </div>
      </section>
    </div>
  );
}
