'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { streamAsk, type AskStreamEvent } from '@/lib/api';
import type { AskInput, AskOutput, Role } from '@/lib/types';

export interface StreamLine {
  id: string;
  role: Role;
  title: string;
  text: string;
}

export interface UseAskStreamResult {
  ask: (input: AskInput) => Promise<AskOutput>;
  cancel: () => void;
  lines: StreamLine[];
  grouped: Record<string, StreamLine[]>;
  metrics: NonNullable<AskOutput['metrics']> | null;
  meta: AskOutput['meta'] | null;
  data: AskOutput | undefined;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

export function useAskStream(onComplete?: (data: AskOutput) => void): UseAskStreamResult {
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [metrics, setMetrics] = useState<NonNullable<AskOutput['metrics']> | null>(null);
  const [meta, setMeta] = useState<AskOutput['meta'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function handleEvent(evt: AskStreamEvent) {
    if (evt.type === 'line') {
      setLines((prev) => [
        ...prev,
        {
          id: `${evt.data.role}-${prev.length}`,
          role: evt.data.role,
          title: evt.data.title,
          text: evt.data.text,
        },
      ]);
    } else if (evt.type === 'metrics') {
      setMetrics(evt.data);
    } else if (evt.type === 'complete') {
      setMetrics(evt.data.metrics ?? null);
      setMeta(evt.data.meta ?? null);
    }
  }

  const mutation = useMutation({
    mutationFn: async (input: AskInput) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLines([]);
      setMetrics(null);
      setMeta(null);
      setError(null);

      const result = await streamAsk({
        ...input,
        signal: controller.signal,
        onEvent: handleEvent,
      });
      return result;
    },
    onSuccess: (data) => {
      onComplete?.(data);
    },
    onError: (err: unknown) => {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('요청 실패');
      }
    },
  });

  const grouped = useMemo(() => {
    return lines.reduce<Record<string, StreamLine[]>>((acc, line) => {
      if (!acc[line.title]) acc[line.title] = [];
      acc[line.title].push(line);
      return acc;
    }, {});
  }, [lines]);

  const ask = (input: AskInput) => mutation.mutateAsync(input);
  const cancel = () => {
    abortRef.current?.abort();
    mutation.reset();
  };
  const reset = () => {
    setLines([]);
    setMetrics(null);
    setMeta(null);
    setError(null);
    mutation.reset();
  };

  return {
    ask,
    cancel,
    lines,
    grouped,
    metrics,
    meta,
    data: mutation.data,
    isLoading: mutation.isPending,
    error,
    reset,
  };
}
