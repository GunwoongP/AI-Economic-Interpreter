import clsx from 'clsx';
import type { AskOutput } from '@/lib/types';

type Props = {
data: AskOutput['metrics'];
className?: string;
};

const LABEL: Record<string, string> = {
ttft_ms: 'TTFT',
tps: 'TPS',
tokens: 'Tokens',
conf: 'Conf',
};

export default function MetricChips({ data, className }: Props){
if(!data) return null;
const items = (Object.entries(data) as [keyof typeof LABEL, number][])
.filter(([key, value])=> LABEL[key] && value!=null)
.map(([key, value])=> ({
key,
label: LABEL[key],
value: key==='ttft_ms'
? `${Math.round(Number(value))}ms`
: key==='conf'
? Number(value).toFixed(2)
: Number.isFinite(Number(value))
? Number(value).toFixed(key==='tps'?1:0)
: String(value),
}));

if(items.length===0) return null;

return (
<div className={clsx('flex items-center gap-2 rounded-full border border-border/60 bg-chip/85 px-3 py-1.5 text-xs text-muted shadow-soft', className)}>
{items.map(item=>(
<span key={item.key} className="flex items-center gap-1">
<span className="font-semibold text-text">{item.label}</span>
<span className="text-text">{item.value}</span>
</span>
))}
</div>
);
}
