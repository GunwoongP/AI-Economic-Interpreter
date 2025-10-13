import type { Card as TCard } from '@/lib/types';
import InsightCard from './InsightCard';
import { CardSources } from './CardSources';
import { Markdown } from './Markdown';

type Variant = 'default' | 'flat';

const ROLE_TAG: Record<
  TCard['type'],
  { label: string; icon: string; className: string }
> = {
  eco: { label: '경제해석', icon: '🟣', className: 'border-[#7C8FFF]/40 bg-[#7C8FFF]/12 text-text' },
  firm: { label: '기업분석', icon: '🟠', className: 'border-[#FF8A3D]/40 bg-[#FF8A3D]/12 text-text' },
  house: { label: '가계조언', icon: '🔵', className: 'border-[#4AA3FF]/40 bg-[#4AA3FF]/12 text-text' },
};

export default function Card({ c, variant = 'default' }: { c: TCard; variant?: Variant }) {
  if (c.type === 'combined') {
    return <InsightCard card={c} />;
  }

  const roleTag = ROLE_TAG[c.type] ?? ROLE_TAG.combined;

  if (variant === 'flat') {
    return (
      <article className="space-y-4 text-sm text-muted">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-text">{c.title}</h3>
          {c.content && <Markdown>{c.content}</Markdown>}
        </div>

        {Array.isArray(c.badges) && c.badges.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {c.badges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-chip/60 px-2.5 py-0.5 text-muted"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {Array.isArray(c.points) && c.points.length > 0 && (
          <ul className="space-y-2 pl-1 text-sm text-muted">
            {c.points.map((p, i) => (
              <li key={`${c.title}-point-${i}`} className="flex items-start gap-2 leading-relaxed">
                <span className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-border/70" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        <CardSources list={c.sources} />
      </article>
    );
  }

  return (
    <article className="space-y-4 rounded-2xl border border-border/40 bg-panel/80 p-4 shadow-soft backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleTag.className}`}
        >
          <span>{roleTag.icon}</span>
          <span>{roleTag.label}</span>
        </span>
        {Array.isArray(c.badges) &&
          c.badges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-chip/70 px-2.5 py-0.5 text-xs text-muted"
            >
              {badge}
            </span>
          ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-semibold text-text">{c.title}</h3>
        {c.content && <Markdown className="text-muted">{c.content}</Markdown>}
      </div>

      {Array.isArray(c.points) && c.points.length > 0 && (
        <ul className="space-y-3 rounded-2xl border border-border/40 bg-chip/60 p-4 text-sm text-muted">
          {c.points.map((p, i) => (
            <li key={`${c.title}-point-${i}`} className="flex items-start gap-2 leading-relaxed">
              <span className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-border/80" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      <CardSources list={c.sources} />
    </article>
  );
}
