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
import type { Mode, Role, SeriesResp } from '@/lib/types';
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
};

const ROLE_ORDER: Role[] = ['eco', 'firm', 'house'];

const DEFAULT_INSIGHT_LABEL = '오늘의 해설';
const DEFAULT_KOSPI_INSIGHT = {
  title: '외국인 차익실현이 코스피를 눌렀어요',
  lines: [
    '원·달러 환율이 다시 1,380원대에 진입하며 외국인과 기관이 동반 순매도로 전환했습니다.',
    '반도체 단가 조정 뉴스가 전해지며 반도체 업종 전반에 약세가 번졌습니다.',
  ],
} as const;
const DEFAULT_IXIC_INSIGHT = {
  title: 'AI 성장주가 나스닥 상승을 이끌었어요',
  lines: [
    '미 국채 금리가 진정되자 기술주로 자금이 빠르게 회귀했습니다.',
    '엔비디아와 메가테크 실적 기대감이 살아나면서 투자 심리가 개선되었습니다.',
  ],
} as const;

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
  const insightLabel = dailyData?.insights?.label?.trim() || DEFAULT_INSIGHT_LABEL;

  const kospiInsight = useMemo(() => {
    const ai = dailyData?.insights?.kospi;
    const lines = (ai?.lines ?? [])
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3);
    const safeLines = lines.length ? lines : [...DEFAULT_KOSPI_INSIGHT.lines];
    const title = (ai?.title?.trim() || DEFAULT_KOSPI_INSIGHT.title).slice(0, 80);
    return {
      label: insightLabel,
      title,
      description: safeLines.join('\n'),
    };
  }, [dailyData, insightLabel]);

  const ixicInsight = useMemo(() => {
    const ai = dailyData?.insights?.ixic;
    const lines = (ai?.lines ?? [])
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3);
    const safeLines = lines.length ? lines : [...DEFAULT_IXIC_INSIGHT.lines];
    const title = (ai?.title?.trim() || DEFAULT_IXIC_INSIGHT.title).slice(0, 80);
    return {
      label: insightLabel,
      title,
      description: safeLines.join('\n'),
    };
  }, [dailyData, insightLabel]);

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
          {kospi.isError && <div className={`${tileClass} text-bad`}>KOSPI 데이터를 불러오지 못했습니다.</div>}
          {kospi.isLoading && !kospi.data && <div className={`${tileClass} text-muted`}>KOSPI 로드 중…</div>}
          {kospi.data && <SparkChart data={kospi.data} title="KOSPI (3개월)" insight={kospiInsight} />}

          {ixic.isError && <div className={`${tileClass} text-bad`}>NASDAQ 데이터를 불러오지 못했습니다.</div>}
          {ixic.isLoading && !ixic.data && <div className={`${tileClass} text-muted`}>NASDAQ 로드 중…</div>}
          {ixic.data && <SparkChart data={ixic.data} title="NASDAQ (3개월)" insight={ixicInsight} />}
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
