# AI 경제해석관 — Backend v1 (Express + TypeScript)

## Quick Start
```bash
npm i
npm run dev
# http://localhost:3001
```

### Endpoints
- `POST /ask` — 오케스트레이터(모의 RAG/AI 내장)
- `GET  /timeseries?symbol=KOSPI|IXIC` — 더미 시계열(스파크라인용)
- `GET  /health` — 헬스체크

### Frontend 연결
프론트 루트에서:
```bash
NEXT_PUBLIC_API_BASE=http://localhost:3001 npm run dev
```

> v1은 Mock입니다. 이후 단계에서 Python FastAPI/LoRA/RAG/SQLite를 붙이세요.
