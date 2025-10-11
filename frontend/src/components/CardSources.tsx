import type { Card as TCard } from '@/lib/types';

export function CardSources({ list }: { list: TCard['sources'] }) {
  if (!list?.length) return null;
  return (
    <div className="mt-3 text-xs text-muted">
      근거:{' '}
      {list.map((s, i) =>
        s?.url ? (
          <a key={`${s.url}-${i}`} href={s.url} target="_blank" rel="noreferrer" className="mr-2 underline">
            {s.title || s.url}
          </a>
        ) : (
          <span key={`${s?.title}-${i}`} className="mr-2">
            {s?.title || ''}
          </span>
        ),
      )}
    </div>
  );
}
