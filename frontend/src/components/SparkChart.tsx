'use client';
import { useEffect, useRef } from 'react';
import type { SeriesResp } from '@/lib/types';

export default function SparkChart({ data, title }: { data: SeriesResp; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!ref.current || !data.values.length) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const W = canvas.width;
    const H = canvas.height;
    const pad = 4;
    const ys = data.values.map(v => v.close);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const sx = (i: number) => pad + (i / (ys.length - 1)) * (W - 2 * pad);
    const sy = (y: number) => H - pad - ((y - min) / (max - min)) * (H - 2 * pad);
    
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(pad, sy(min));
    ctx.lineTo(W - pad, sy(min));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad, sy(max));
    ctx.lineTo(W - pad, sy(max));
    ctx.stroke();
    ctx.globalAlpha = 1;
    
    ctx.strokeStyle = document.documentElement.classList.contains('light') ? '#111827' : '#e6e9ef';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(ys[0]));
    for (let i = 1; i < ys.length; i++) {
      ctx.lineTo(sx(i), sy(ys[i]));
    }
    ctx.stroke();
  }, [data]);
  
  const stats = (() => {
    const v = data.values;
    if (v.length < 2) return { pct: 0, first: 0, last: 0, min: 0, max: 0, avg: 0 };
    
    const closes = v.map(x => x.close);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
    const pct = ((last - first) / first) * 100;
    
    return { pct, first, last, min, max, avg };
  })();
  
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-base">{title || data.symbol}</h3>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {data.stamp}
        </div>
      </div>
      
      {/* 차트 */}
      <canvas ref={ref} width={400} height={100} className="w-full h-auto mb-3" />
      
      {/* 변동률 */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-2xl font-bold ${stats.pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {stats.pct >= 0 ? '▲' : '▼'} {Math.abs(stats.pct).toFixed(2)}%
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {stats.last.toFixed(2)}
        </span>
      </div>
      
      {/* 지표 그리드 */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5">
          <div className="text-gray-500 dark:text-gray-400">시작가</div>
          <div className="font-semibold">{stats.first.toFixed(2)}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5">
          <div className="text-gray-500 dark:text-gray-400">현재가</div>
          <div className="font-semibold">{stats.last.toFixed(2)}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5">
          <div className="text-gray-500 dark:text-gray-400">최저</div>
          <div className="font-semibold text-blue-600 dark:text-blue-400">{stats.min.toFixed(2)}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5">
          <div className="text-gray-500 dark:text-gray-400">최고</div>
          <div className="font-semibold text-orange-600 dark:text-orange-400">{stats.max.toFixed(2)}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5 col-span-2">
          <div className="text-gray-500 dark:text-gray-400">평균</div>
          <div className="font-semibold">{stats.avg.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}