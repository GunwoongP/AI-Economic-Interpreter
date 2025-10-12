'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { HistoryItem } from '@/lib/history';
import { clearHistory, loadHistory, removeHistory } from '@/lib/history';

type Props = {
  onRerun: (item: HistoryItem) => void;
};

export default function HistoryPanel({ onRerun }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, error, isFetching } = useQuery<HistoryItem[]>({
    queryKey: ['history'],
    queryFn: () => loadHistory(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const list = useMemo(() => data ?? [], [data]);

  const refresh = () => {
    queryClient.setQueryData(['history'], loadHistory());
  };

  return (
    <section className="rounded-3xl border border-border/60 bg-panel/90 text-sm shadow-soft backdrop-blur">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-base font-semibold text-text"
        onClick={() => setOpen((prev) => !prev)}
      >
        최근 질문 기록
        <span
          aria-hidden
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-chip/80 text-xs transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▼
        </span>
      </button>

      <div
        className={`${
          open ? 'max-h-[480px] opacity-100' : 'max-h-0 opacity-0'
        } grid gap-4 overflow-hidden px-5 pb-5 transition-all duration-300 ease-in-out`}
      >
        <div className="flex gap-2">
          <button
            className="badge bg-chip/80 text-text"
            onClick={() => {
              if (confirm('기록을 모두 삭제할까요?')) {
                clearHistory();
                refresh();
              }
            }}
          >
            전체 삭제
          </button>
        </div>

        {error && <div className="text-xs text-bad">기록을 불러오지 못했습니다.</div>}
        {isFetching && <div className="text-xs text-muted">기록 동기화 중…</div>}
        {list.length === 0 && !isFetching && !error && (
          <div className="text-xs text-muted">아직 기록이 없습니다. 질문을 입력해보세요.</div>
        )}

        <ul className="max-h-[300px] space-y-2 overflow-auto pr-1">
          {list.map((item) => {
            const last = item.conversation[item.conversation.length - 1];
            return (
              <li key={item.id} className="space-y-2 rounded-2xl border border-border/60 bg-chip/70 px-4 py-3 shadow-inner">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="text-xs text-muted">
                    {new Date(item.ts).toLocaleString()} · 총 {item.conversation.length}개의 질문
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button className="badge bg-panel/80 text-text" onClick={() => onRerun(item)}>
                      다시 보기
                    </button>
                    <button
                      className="badge bg-panel/80 text-text"
                      onClick={() => {
                        removeHistory(item.id);
                        refresh();
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-text">
                  <div className="font-medium">{item.title}</div>
                  {last && last.question !== item.title && (
                    <div className="text-xs text-muted">마지막 질문: {last.question}</div>
                  )}
                  {item.conversation.length === 0 && (
                    <div className="text-xs text-muted">저장된 대화가 없습니다.</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
