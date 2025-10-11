import type { Card as TCard } from '@/lib/types';
import InsightCard from './InsightCard';
import { CardSources } from './CardSources';
import { getConfidenceMeta } from './confidence';

const BCLR: Record<string, string> = {
  eco: 'bg-[#7650ff]',
  firm: 'bg-[#ff8a3d]',
  house: 'bg-[#4aa3ff]',
  combined: 'bg-[#22b573]',
};

export default function Card({ c }: { c: TCard }) {
  if (c.type === 'combined' || (c.type === 'eco' && /거시/.test(c.title))) {
    return <InsightCard card={c} />;
  }

  const confMeta = getConfidenceMeta(c.conf);

  return (
    <article className="space-y-4 rounded-3xl border border-border/60 bg-panel/90 p-5 shadow-soft backdrop-blur">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${BCLR[c.type] || 'bg-accent'}`} />
          <h3 className="text-base font-semibold text-text">{c.title}</h3>
        </div>
        {confMeta && (
          <span className={`badge cursor-help bg-chip/90 text-text ${confMeta.className}`} title={confMeta.title}>
            {confMeta.label}
          </span>
        )}
      </header>
      {c.content && <p className="text-sm leading-relaxed text-muted">{c.content}</p>}
      {Array.isArray(c.points) && c.points.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {c.points.map((p, i) => (
            <li key={`${c.title}-point-${i}`}>{p}</li>
          ))}
        </ul>
      )}
      <CardSources list={c.sources} />
    </article>
  );
}
