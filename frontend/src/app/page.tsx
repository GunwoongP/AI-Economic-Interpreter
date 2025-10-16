'use client';
import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DailyTerm from '@/components/DailyTerm';
import SparkChart from '@/components/SparkChart';
import Card from '@/components/Card';
import ModeSelector from '@/components/ModeSelector';
import HistoryPanel from '@/components/HistoryPanel';
import { useAskStream } from '@/hooks/useAskStream';
import { getDailyInsight, getSeries } from '@/lib/api';
import type { Mode, Role, SeriesResp, NewsItem } from '@/lib/types';
import {
  loadHistory,
  saveHistoryItem,
  uuid,
  type ConversationTurn,
  type HistoryItem,
} from '@/lib/history';

const ROLE_THEME: Record<
  Role,
  { label: string; description: string; icon: string; badgeClass: string }
> = {
  eco: {
    label: '경제해석',
    description: '금리·환율 등 거시 흐름을 해석한 요약입니다.',
    icon: '🟣',
    badgeClass: 'border-[#7C8FFF]/40 bg-[#7C8FFF]/15 text-text',
  },
  firm: {
    label: '기업분석',
    description: '업종·실적·재무 지표 관점에서 정리했어요.',
    icon: '🟠',
    badgeClass: 'border-[#FF8A3D]/40 bg-[#FF8A3D]/15 text-text',
  },
  house: {
    label: '가계조언',
    description: '개인 재무·포트폴리오 시각의 조언입니다.',
    icon: '🔵',
    badgeClass: 'border-[#4AA3FF]/40 bg-[#4AA3FF]/15 text-text',
  },
  combined: {
    label: '통합요약',
    description: '세 전문가의 의견을 묶은 최종 해석입니다.',
    icon: '🟢',
    badgeClass: 'border-border/50 bg-chip/70 text-text',
  },
};

const ROLE_ORDER: Role[] = ['eco', 'firm', 'house'];

function useSeries(symbol: SeriesResp['symbol']) {
  return useQuery({
    queryKey: ['series', symbol],
    queryFn: () => getSeries(symbol),
    retry: 1,
    staleTime: 1000 * 60 * 15,
  });
}

function useDailyInsightData() {
  return useQuery({
    queryKey: ['daily-insight'],
    queryFn: () => getDailyInsight({ limit: 6 }),
    retry: 1,
    staleTime: 1000 * 60 * 10,
  });
}

export default function Page() {
  const [mode, setMode] = useState<Mode>('auto');
  const [q, setQ] = useState('');
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const latestQ = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const queryClient = useQueryClient();

  const kospi = useSeries('KOSPI');
  const ixic = useSeries('IXIC');
  const dailyInsight = useDailyInsightData();

  const askStream = useAskStream((result) => {
    const question = latestQ.current;
    if (!question) return;
    const convId = conversationId ?? uuid();
    const turn: ConversationTurn = {
      id: uuid(),
      question,
      answer: result,
      askedAt: Date.now(),
    };
    setConversation((prev) => {
      const next = [...prev, turn];
      const historyEntry: HistoryItem = {
        id: convId,
        ts: turn.askedAt,
        title: next[0]?.question ?? '대화',
        conversation: next,
      };
      saveHistoryItem(historyEntry);
      queryClient.setQueryData(['history'], loadHistory());
      return next;
    });
    setConversationId(convId);
    setQ('');
  });

  const latestAnswer = conversation.length > 0 ? conversation[conversation.length - 1].answer : askStream.data;

  const cardsByRole = useMemo(() => {
    const cards = latestAnswer?.cards ?? [];
    const grouped: Record<Role, typeof cards> = {
      eco: [],
      firm: [],
      house: [],
      combined: [],
    };
    cards.forEach((card) => {
      if (grouped[card.type]) {
        grouped[card.type].push(card);
      }
    });
    return grouped;
  }, [latestAnswer]);
  const metrics = askStream.metrics || latestAnswer?.metrics || null;
  const meta = askStream.meta || latestAnswer?.meta || null;
  const rolesFromMeta = (meta?.roles ?? []).filter((role): role is Role => ROLE_ORDER.includes(role));
  const rolesWithCards = ROLE_ORDER.filter((role) => (cardsByRole[role] ?? []).length > 0);
  const visibleRoles = rolesFromMeta.length
    ? rolesFromMeta.filter((role) => (cardsByRole[role] ?? []).length > 0)
    : rolesWithCards;
  const dailyData = dailyInsight.data;
  const newsBuckets = dailyData?.news;
  const domesticNews = (newsBuckets?.domestic ?? []).slice(0, 5);
  const globalNews = (newsBuckets?.global ?? []).slice(0, 5);
  const fallbackNews = (newsBuckets?.combined ?? [...domesticNews, ...globalNews]).slice(0, 5);

  const NewsList = ({
    title,
    items,
    emptyMessage,
  }: {
    title: string;
    items: NewsItem[];
    emptyMessage: string;
  }) => (
    <div className="rounded-3xl border border-border/60 bg-chip/75 p-5 text-sm shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <span className="text-xs text-muted">{items.length > 0 ? `${items.length}건` : ''}</span>
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-muted">
          {items.map((item, index) => {
            const headline = (item.title || item.description || '').trim() || '제목 없음';
            const href = item.link || item.originallink;
            return (
              <li key={`${title}-${index}`}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition hover:text-text hover:underline"
                  >
                    {headline}
                  </a>
                ) : (
                  <span>{headline}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">{emptyMessage}</p>
      )}
    </div>
  );

  const kospiSeriesData = kospi.data ?? dailyData?.series?.kospi ?? null;
  const ixicSeriesData = ixic.data ?? dailyData?.series?.ixic ?? null;
  const insightLabel = dailyData?.insights?.label ?? '오늘의 해설';
  const buildInsight = (snippet?: { title: string; lines: string[] } | null) => {
    if (!snippet) return undefined;
    const lines = Array.isArray(snippet.lines) ? snippet.lines.filter(Boolean) : [];
    const description = lines.join(' · ').slice(0, 180);
    return {
      label: insightLabel,
      title: snippet.title,
      description,
    };
  };
  const kospiInsight = buildInsight(dailyData?.insights?.kospi ?? null);
  const ixicInsight = buildInsight(dailyData?.insights?.ixic ?? null);

  const tileClass = 'rounded-3xl border border-border/60 bg-panel/90 p-5 text-sm shadow-soft backdrop-blur';
  const sampleQuestions = [
    '금리가 오르면 내 대출 이자는 어떻게 변할까요?',
    '한국 증시가 하락하면 기업 입장에서는 어떤 전략을 쓰나요?',
    '요즘 뉴스에 나온 "소프트랜딩"이 무슨 뜻인지 알려줘요.',
  ];

  async function runAsk() {
    const trimmed = q.trim();
    if (!trimmed) return;
    latestQ.current = trimmed;
    try {
      await askStream.ask({ q: trimmed, mode });
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

  function resetConversation() {
    askStream.cancel();
    setConversation([]);
    setConversationId(null);
    latestQ.current = '';
    setQ('');
    askStream.reset();
  }

  return (
    <div className="space-y-8 md:space-y-12">
      <DailyTerm />

      <section className="mx-auto max-w-[1080px] space-y-4 px-5">
        <header className="space-y-1.5">
          <h2 className="text-xl font-semibold text-text md:text-2xl">오늘 시장 한눈에</h2>
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {kospiSeriesData ? (
            <SparkChart data={kospiSeriesData} title="KOSPI (3개월)" insight={kospiInsight} />
          ) : kospi.isError ? (
            <div className={`${tileClass} text-bad`}>KOSPI 데이터를 불러오지 못했습니다.</div>
          ) : (
            <div className={`${tileClass} text-muted`}>KOSPI 로드 중…</div>
          )}

          {ixicSeriesData ? (
            <SparkChart data={ixicSeriesData} title="NASDAQ (3개월)" insight={ixicInsight} />
          ) : ixic.isError ? (
            <div className={`${tileClass} text-bad`}>NASDAQ 데이터를 불러오지 못했습니다.</div>
          ) : (
            <div className={`${tileClass} text-muted`}>NASDAQ 로드 중…</div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <NewsList
            title="국내 헤드라인"
            items={domesticNews}
            emptyMessage="국내 주요 뉴스를 불러오지 못했습니다."
          />
          <NewsList
            title="해외 헤드라인"
            items={globalNews}
            emptyMessage="해외 주요 뉴스를 불러오지 못했습니다."
          />
          {fallbackNews.length > 0 && (domesticNews.length === 0 || globalNews.length === 0) && (
            <div className="md:col-span-2">
              <NewsList
                title="오늘의 주요 헤드라인"
                items={fallbackNews}
                emptyMessage="표시할 헤드라인이 없습니다."
              />
            </div>
          )}
        </div>
      </section>

      <section className="relative mx-auto max-w-[1080px] overflow-hidden rounded-3xl border border-border/60 bg-panel/95 px-5 py-6 shadow-soft backdrop-blur md:px-8 md:py-8">
        
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
                  경제해석, 기업분석, 가계 조언 세 전문가가 역할별로 답변을 나눠드려요.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ModeSelector value={mode} onChange={setMode} />
                <button
                  type="button"
                  onClick={resetConversation}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-chip/70 px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent/50 hover:text-text"
                >
                  새 채팅
                </button>
              </div>
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={runAsk}
                    className="inline-flex items-center gap-2 rounded-2xl border border-accent/50 bg-accent/30 px-5 py-2 text-sm font-semibold text-text transition hover:bg-accent/40"
                  >
                    질문 보내기
                  </button>
                </div>
              </div>
            </div>

            
          </div>

          <div className="space-y-5 rounded-3xl border border-border/60 bg-chip/75 p-5 text-sm shadow-soft">
            {latestQ.current && (
              <div className="space-y-2 rounded-2xl border border-border/50 bg-panel/80 p-4 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted">현재 질문</div>
                <p className="text-base font-semibold text-text">{latestQ.current}</p>
                {meta?.mode && (
                  <div className="text-xs text-muted">
                    모드 <b>{meta.mode}</b>
                    {meta.roles?.length
                      ? ` · ${meta.roles
                          .map((role) => ROLE_THEME[role as Role]?.label ?? role)
                          .join(', ')}`
                      : ''}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-text md:text-xl">AI 분석 결과</h3>
                <p className="text-xs text-muted">질문을 분야별로 정리해 보여드릴게요.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleRoles.length > 0 ? (
                  visibleRoles.map((role) => {
                    const theme = ROLE_THEME[role];
                    return (
                      <span
                        key={role}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium shadow-soft ${theme.badgeClass}`}
                      >
                        <span>{theme.icon}</span>
                        <span>{theme.label}</span>
                      </span>
                    );
                  })
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-chip/70 px-3 py-1 text-xs text-muted">
                    분석 대기 중
                  </span>
                )}
              </div>
            </div>

            {askStream.error && <div className="text-bad text-sm">{askStream.error}</div>}

            <div className="space-y-5">
              {conversation.length > 0 ? (
                [...conversation].reverse().map((turn, idx) => {
                  const displayNumber = conversation.length - idx;
                  const groups = ROLE_ORDER.map((role) => ({
                    role,
                    cards: (turn.answer.cards || []).filter((card) => card.type === role),
                  })).filter((group) => group.cards.length > 0);

                  return (
                    <section
                      key={turn.id}
                      className="space-y-4 rounded-3xl border border-border/50 bg-panel/85 p-5 shadow-soft"
                    >
                      <header className="space-y-2">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                          <span>질문 {displayNumber}</span>
                          <span>·</span>
                          <span>{new Date(turn.askedAt).toLocaleString()}</span>
                        </div>
                        <p className="text-base font-semibold text-text">{turn.question}</p>
                      </header>

                      {groups.length > 0 ? (
                        <div className="space-y-4">
                          {groups.map(({ role, cards }) => {
                            const theme = ROLE_THEME[role];
                            return (
                              <div
                                key={`${turn.id}-${role}`}
                                className="space-y-3 rounded-2xl border border-border/50 bg-panel/80 p-4 shadow-inner"
                              >
                                <div className="flex items-center gap-2 text-text">
                                  <span className="text-lg">{theme.icon}</span>
                                  <span className="text-base font-semibold">{theme.label}</span>
                                </div>
                                <div className="space-y-4">
                                  {cards.map((card, i) => (
                                    <Card key={`${turn.id}-${role}-${i}-${card.title}`} c={card} variant="flat" />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-border/40 bg-panel/80 p-4 text-sm text-muted">
                          아직 생성된 카드가 없습니다.
                        </div>
                      )}

                      {/* {turn.answer.metrics && (

                      )} */}
                    </section>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-border/50 bg-panel/80 p-6 text-center text-sm text-muted">
                  대화를 시작하면 카드와 분석이 이곳에 쌓입니다.
                </div>
              )}
            </div>

            {askStream.lines.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-border/50 bg-panel/80 p-4 text-sm">
                <div className="text-xs text-muted">생성 중…</div>
                <div className="space-y-3">
                  {Object.entries(askStream.grouped).map(([title, lines]) => (
                    <div key={title} className="rounded-2xl border border-border/40 bg-chip/70 p-4">
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
          </div>

          <HistoryPanel
            onRerun={(item) => {
              askStream.cancel();
              setConversationId(item.id);
              setConversation(item.conversation);
              const lastTurn = item.conversation[item.conversation.length - 1];
              if (lastTurn) {
                latestQ.current = lastTurn.question;
                askStream.hydrate(lastTurn.answer);
              } else {
                latestQ.current = '';
                askStream.reset();
              }
              setQ('');
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
