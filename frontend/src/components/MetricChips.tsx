import { AskOutput } from '@/lib/types';
export default function MetricChips({ data }:{ data: AskOutput['metrics'] }){
if(!data) return null;
const items = [
data.ttft_ms!=null && ['TTFT', data.ttft_ms+'ms'],
data.tps!=null && ['TPS', String(data.tps)],
data.tokens!=null && ['Tokens', String(data.tokens)],
data.conf!=null && ['Conf', String(data.conf)],
].filter(Boolean) as [string,string][];
return (
<div className="flex gap-2 flex-wrap my-2">
{items.map(([k,v])=> <div key={k} className="badge"><b className="mr-1">{k}</b> {v}</div>)}
</div>
);
}