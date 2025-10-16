import type { Card as TCard } from '@/lib/types';
import { CardSources } from './CardSources';
import { Markdown } from './Markdown';

type Props = { card: TCard };

const VARIANT: Record<TCard['type'], string> = {
  eco: 'from-sky-500/20 via-cyan-500/15 to-slate-500/5',
  firm: 'from-orange-500/20 via-amber-500/10 to-rose-500/5',
  house: 'from-blue-500/15 via-emerald-500/10 to-lime-500/5',
  combined: 'from-accent/25 via-accent/10 to-slate-500/5',
};

export default function InsightCard({ card }: Props) {
  const variant = VARIANT[card.type] || 'from-accent/20 to-accent/5';
  const heading = card.type === 'eco' ? '거시 핵심' : '핵심 인사이트';

  return (
    <article className="space-y-3 rounded-2xl border border-border bg-panel p-4 shadow-soft">
      <div className={`rounded-xl bg-gradient-to-r ${variant} p-3`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{heading}</div>
            <h3 className="text-base font-semibold">{card.title}</h3>
          </div>
        </div>
        {card.content && (
          <div className="mt-2">
            <Markdown className="text-text">{card.content}</Markdown>
          </div>
        )}
      </div>

      {Array.isArray(card.points) && card.points.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {card.points.map((p, idx) => (
            <li key={`${card.title}-point-${idx}`}>{p}</li>
          ))}
        </ul>
      )}

      <CardSources list={card.sources} />
    </article>
  );
}
