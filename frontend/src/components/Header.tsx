'use client';
import { useEffect, useState } from 'react';
import { applyTheme, initTheme, Theme } from '@/lib/theme';


export default function Header() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    setTheme(initTheme());
  }, []);

  return (
    <header className="px-5 pt-8 pb-6">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-1 items-start gap-4">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-chip/70 shadow-soft"
              style={{
                background:
                  'radial-gradient(120% 120% at 20% 20%, rgba(255,255,255,0.35) 0%, transparent 55%), linear-gradient(220deg, rgba(124,139,255,0.75), rgba(34,208,255,0.65))',
              }}
            >
              <span className="text-lg font-semibold text-[#0b1130]">AI</span>
            </span>
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.38em] text-muted/70">eco mentor</p>
              <h1 className="text-2xl font-semibold tracking-tight text-text md:text-[28px]">
                경제가 낯설어도 안심하고 질문하세요
              </h1>
              <p className="max-w-2xl text-sm text-muted md:text-base">
                어려운 용어는 쉽게 풀고, 지표는 그림과 비교로 보여드려요. 지금 궁금한 경제 이슈를 편하게 물어보면 맞춤형 카드로 정리해
                드립니다.
              </p>
            </div>
          </div>

          <div className="flex w-full max-w-[220px] flex-col gap-3 rounded-2xl border border-border/60 bg-chip/60 p-4 text-sm text-muted/90 shadow-soft md:w-auto">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted/80">
              <span>모드</span>
              <span>look & feel</span>
            </div>
            <label className="flex flex-col gap-2 text-sm text-muted/90">
              <span className="text-xs font-medium text-muted/80">테마 선택</span>
              <select
                className="badge w-full justify-between bg-chip/80 text-text"
                value={theme}
                onChange={(e) => {
                  const v = e.target.value as Theme;
                  setTheme(v);
                  applyTheme(v);
                }}
              >
                <option value="system">시스템 연동</option>
                <option value="dark">다크 모드</option>
                <option value="light">라이트 모드</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </header>
  );
}
