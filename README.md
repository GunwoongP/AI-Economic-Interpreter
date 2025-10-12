# 🧠 AI-Economic-Interpreter

AI-Economic-Interpreter는 실시간 경제 지수(KOSPI, NASDAQ 등)를 해석하고  
뉴스·정책·자금흐름 기반으로 “한 줄 요약 + 역할별 전문가 분석(Eco/Firm/House)”을 자동 생성하는  
통합 AI 해석 시스템입니다.

---

## 🏗️ 시스템 아키텍처

```
[Client / Browser]
└─ Frontend (Next.js / TypeScript)
   • /          : 대시보드 (상식, 지수 스파크라인, 한줄 해석)
   • /ask       : 모드/역할 선택, 카드 3장
   • Theme/Mode Store : 테마/모드 관리
   • Error/Skeleton   : 오류 및 로딩 UI
   • Source/Conf 등   : 소스/신뢰도 뱃지
   │
[HTTPS / JSON 통신]
   │
[API Gateway / Backend (Node.js / Express / TypeScript)]
   ├─ /ask           : 오케스트레이션 엔드포인트
   ├─ /timeseries    : 시계열(코스피/나스닥) 캐시
   ├─ /health        : 서버 상태 확인
   ├─ auth/metering  : (옵션) API Key / Rate limit
   └─ 내부 라이브러리 : rag/, db/, model/, safety/, cache/, observability/
   │
[gRPC / HTTP (LAN)]
   │
[AI Core (Python / FastAPI)]
   ├─ /attach_lora   : ECO/FIRM/HOUSE 어댑터 장착
   ├─ /generate_draft: 역할별 초안 생성
   └─ /generate_edit : 편집자(합성/정제)
   │
[Local I/O]
   │
[Data Plane]
   ├─ Vector DB        : macro/firm/household 네임스페이스
   ├─ SQLite (finance.db): 정형 재무/메타 데이터
   └─ TS Cache         : 시계열 데이터 캐시 (KOSPI/IXIC, TTL 5~15분)
```

---

## 🔧 주요 구성 요소

### 🩵 프론트엔드
- Next.js 기반 대시보드 및 질의/카드 UI
- 테마/모드, 오류 처리, 소스 신뢰도 표시 등

### 🧩 백엔드 API 게이트웨이
- 데이터 오케스트레이션, 시계열 데이터 캐싱
- 인증 및 메타링, 내부 라이브러리 분리

### 🧠 AI Core
- 역할별 초안 생성 및 편집
- LoRA 어댑터 확장 지원

### 📊 데이터 플레인
- 벡터 DB: 문서 임베딩 및 검색용
- SQLite: 재무/메타 정형 데이터
- 시계열 캐시: 주기적 외부 데이터 동기화

---

## ⚙️ 사용 방법 (Usage)

### 1️⃣ 사전 준비물

- Node.js ≥ 18
- Python ≥ 3.10
- (선택) Docker / Docker Compose
- GPU 사용 시: CUDA + PyTorch 환경

### 2️⃣ 환경 변수 (.env)

루트 `.env.example` 참고:

```bash
# --- Backend ---
BACKEND_PORT=3001
AI_BASE_URL=http://localhost:8008
TIMESERIES_CACHE_TTL=600

# --- Frontend ---
NEXT_PUBLIC_API_BASE=http://localhost:3001

# --- AI Core ---
AI_HOST=0.0.0.0
AI_PORT=8008
MODEL_ID=LGAI-EXAONE/EXAONE-3.5-2.4B-Instruct
```

복사 예시:

```bash
cp .env.example backend/.env
cp .env.example frontend/.env
cp .env.example ai/.env
```

### 3️⃣ 설치

```bash
# 루트 기준
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt  # Python 패키지 설치

cd backend && npm i && cd ..
cd frontend && npm i && cd ..
```

### 4️⃣ 실행 (개발모드)

1. **시장 데이터 API (FastAPI)**

python3 -m venv .venv

source .venv/bin/activate

pip install -r requirements.txt

uvicorn app:app --host 127.0.0.1 --port 8000 --reload

2. **AI Core, Backend, Frontend**

```bash
# AI Core
cd ai
python main.py           # http://localhost:8008

# Backend
cd backend
npm run dev              # http://localhost:3001

# Frontend
cd frontend
npm run dev              # http://localhost:3000
```

> 전체 플로우: Frontend(3000) → Backend(3001) → AI Core(8008)

### 5️⃣ Docker Compose 실행

```bash
docker compose up --build
# frontend:3000, backend:3001, ai:8008 자동 연결
```

### 6️⃣ 빠른 테스트

```bash
# 헬스체크
curl http://localhost:3001/health

# 질의 API
curl -X POST http://localhost:3001/ask -H "Content-Type: application/json" \
  -d '{"q":"코스피가 뭐야","roles":["eco"],"mode":"parallel"}'

# 시장 데이터 (FastAPI)
curl "http://127.0.0.1:8000/series/KOSPI"
```

### 7️⃣ 프론트엔드 라우트

| 경로         | 설명                                   |
|--------------|----------------------------------------|
| `/`          | 대시보드 (경제 상식, 스파크라인, 한줄 해석) |
| `/ask`       | 질의 입력 → 모드/역할 선택 → 카드 3장(Eco/Firm/House) |
| `/history`   | 질의 기록/결과 저장 (추후 DB 연동)         |

### 8️⃣ 데이터 플레인

```
data/
 ├─ docs/        # 텍스트/리포트
 ├─ csv/         # 시계열/재무 CSV
 ├─ embeddings/  # 벡터 인덱스 캐시
 └─ finance.db   # SQLite (정형 데이터)
```

**SQLite 스키마 예시:**
```sql
CREATE TABLE IF NOT EXISTS history(
  id INTEGER PRIMARY KEY,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  q TEXT, roles TEXT, mode TEXT,
  cards_json TEXT, metrics_json TEXT
);
```

### 9️⃣ AI Core API

| Endpoint           | 설명                    |
|--------------------|-----------------------|
| `/chat`            | 기본 대화 (현재 사용)    |
| `/attach_lora`     | 역할별 LoRA 어댑터 장착 |
| `/generate_draft`  | 역할별 초안 생성        |
| `/generate_edit`   | 에디터 합성/정제        |

**응답 예시:**
```json
{
  "content": "요약 결과 ...",
  "usage": { "prompt_tokens": 123, "completion_tokens": 98 }
}
```

### 🔟 런 스크립트 (권장)

`scripts/dev.sh` 예시:
```bash
#!/usr/bin/env bash
set -e
(cd ai && python main.py) &
(cd backend && npm run dev) &
(cd frontend && npm run dev)
```

실행:
```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

---

## 🧩 트러블슈팅

- `roles.filter` 에러: /ask에서 roles 미지정 시 기본값 ["eco"]로 처리
- 빈 응답: AI Core trust_remote_code=True, 폴백 요약 로직 추가
- CORS 문제: 백엔드에서 프론트 도메인 허용
- 지연: 카드 하단에 TTFT / Tokens / TPS / Conf 표시로 모니터링

---

## 📦 핵심 기술 스택

| 구분       | 기술                                  |
|----------|--------------------------------------|
| Frontend | Next.js 14, TypeScript, Tailwind     |
| Backend  | Node.js, Express, TypeScript         |
| AI Core  | FastAPI, Transformers, Exaone-3.5    |
| Data     | FAISS, SQLite, RAG                   |
| Infra    | Docker, .env, Localhost Bridge       |

---

## ✅ 프로젝트 상태

| 항목           | 상태   | 설명                        |
|--------------|------|---------------------------|
| 프론트엔드 UI    | ✅ 완성 | 대시보드 + 질문 카드 UI         |
| 백엔드 REST API | ✅ 완성 | /ask, /timeseries, /health |
| AI Core 연결     | ✅ 성공 | 로컬 Exaone                  |
| E2E 흐름        | ✅ 정상 | Front→Back→AI 완전 연결        |
| RAG / 근거검색   | 🚧 예정 | 성능지표 / LoRA 확장 예정       |
