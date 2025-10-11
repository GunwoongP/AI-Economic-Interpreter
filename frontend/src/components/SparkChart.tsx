'use client';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SeriesResp } from '@/lib/types';

type Props = {
  data: SeriesResp;
  title?: string;
  insight?: {
    label?: string;
    title: string;
    description: string;
  };
};

function formatLabel(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatFull(ts: number) {
  return new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric' });
}

const toneMap = {
  up: { icon: '▲', badge: 'border border-good/40 bg-good/15 text-good' },
  down: { icon: '▼', badge: 'border border-bad/40 bg-bad/15 text-bad' },
  flat: { icon: '●', badge: 'border border-muted/40 bg-muted/10 text-muted' },
} as const;

export default function SparkChart({ data, title, insight }: Props) {
  const prepared = useMemo(() => {
    if (!data.values.length) return null;
    const chartData = data.values.map((point) => ({
      ...point,
      label: formatLabel(point.t),
    }));
    const closes = chartData.map((p) => p.close);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const avg = closes.reduce((acc, v) => acc + v, 0) / closes.length;
    const pct = ((last - first) / first) * 100;
    const color = pct >= 0 ? '#16a34a' : '#dc2626';

    const previousClose = chartData.length > 1 ? chartData[chartData.length - 2].close : chartData[chartData.length - 1].close;
    const latestClose = chartData[chartData.length - 1].close;
    const dailyDelta = latestClose - previousClose;
    const dailyPct = previousClose === 0 ? 0 : (dailyDelta / previousClose) * 100;

    return {
      chartData,
      stats: { pct, first, last, min, max, avg, dailyDelta, dailyPct },
      color,
    };
  }, [data]);

  if (!prepared) return null;

  const { chartData, stats, color } = prepared;
  const toneKey = stats.dailyDelta > 0 ? 'up' : stats.dailyDelta < 0 ? 'down' : 'flat';
  const trendIcon = toneKey === 'up' ? '▲' : toneKey === 'down' ? '▼' : '●';
  const pctText = `${trendIcon} ${Math.abs(stats.dailyPct).toFixed(2)}%`;
  const tone = toneMap[toneKey];
  const pctColorClass = toneKey === 'up' ? 'text-emerald-500' : toneKey === 'down' ? 'text-red-500' : 'text-muted';
  const insightLabel = insight?.label ?? '오늘의 해설';

  return (
    <div className="space-y-4 rounded-3xl border border-border/60 bg-panel/90 p-5 shadow-soft backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text">{title || data.symbol}</h3>
          <div className="text-xs text-muted">마지막 업데이트 · {data.stamp}</div>
        </div>
        <div className={`text-lg font-bold ${pctColorClass}`}>{pctText}</div>
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'var(--foreground-muted,#94a3b8)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'var(--foreground-muted,#94a3b8)' }}
              tickFormatter={(value: number) => value.toFixed(0)}
              domain={[stats.min * 0.98, stats.max * 1.02]}
            />
            <Tooltip
              formatter={(value: unknown) => [`${Number(value).toFixed(2)}`, '종가']}
              labelFormatter={(label: unknown, payload) =>
                payload && payload[0] ? formatFull(payload[0].payload.t) : String(label)
              }
            />
            <ReferenceLine
              y={stats.min}
              stroke="#3b82f6"
              strokeDasharray="5 5"
              label={{ value: `최저 ${stats.min.toFixed(2)}`, position: 'insideTopRight', fill: '#3b82f6', fontSize: 11 }}
            />
            <ReferenceLine
              y={stats.max}
              stroke="#f97316"
              strokeDasharray="5 5"
              label={{ value: `최고 ${stats.max.toFixed(2)}`, position: 'insideBottomRight', fill: '#f97316', fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke={color}
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
        <Stat label="시작가" value={stats.first} />
        <Stat label="현재가" value={stats.last} />
        <Stat label="평균" value={stats.avg} />
        <Stat label="최저" value={stats.min} highlight="text-[#3b82f6]" />
        <Stat label="최고" value={stats.max} highlight="text-[#fb923c]" />
      </div>

      {insight && (
        <div className="rounded-2xl border border-border/60 bg-chip/70 p-4 text-sm leading-relaxed text-muted shadow-inner">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted/70">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-xl ${tone.badge} text-sm`}>
              {tone.icon}
            </span>
            <span>{insightLabel}</span>
          </div>
          <div className="space-y-1.5 text-text">
            <p className="text-sm font-semibold">{insight.title}</p>
            <p className="text-sm leading-relaxed text-muted/90">{insight.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: string }) {
  const colorClass = highlight || 'text-text';
  return (
    <div className="rounded-2xl border border-border/60 bg-chip/70 px-3 py-2 shadow-inner">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-sm font-semibold ${colorClass}`}>{value.toFixed(2)}</div>
    </div>
  );
}
