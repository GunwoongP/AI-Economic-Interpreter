import '@/styles/globals.css';
import Header from '@/components/Header';
import type { ReactNode } from 'react';


export const metadata = { title: 'AI 경제해석관 — Front', description: '대시보드 + 질문' };


export default function RootLayout({ children }:{ children: ReactNode }){
return (
<html lang="ko">
<body>
<Header />
<main className="max-w-[1080px] mx-auto px-5 pb-16">{children}</main>
</body>
</html>
);
}