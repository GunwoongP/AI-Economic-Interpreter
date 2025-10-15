# 🧠 AI-Economic-Interpreter

**AI-Economic-Interpreter**는 실시간 경제 지수(KOSPI, NASDAQ 등)와 뉴스·정책·자금 흐름을 해석하여  
“한 줄 요약 + 역할별 전문가 분석(Eco / Firm / House)”을 자동 생성하는 통합 AI 경제 해석 시스템입니다.

---

## 🏗️ 시스템 아키텍처

```
[Client / Browser]
└─ Frontend (Next.js / TypeScript)
   ├─ /              : 대시보드(경제 상식, 지수 스파크라인, 한줄 해석)
   ├─ /ask           : 모드/역할 선택, 3가지 분석 카드
   ├─ Theme/Mode Store : 테마/모드 관리
   ├─ Error/Skeleton   : 오류 및 로딩 UI
   └─ Source/Conf 등   : 소스/신뢰도 뱃지
        │
[HTTPS / JSON]
        │
[API Gateway / Backend (Node.js / Express / TypeScript)]
   ├─ /ask              : 오케스트레이션 엔드포인트
   ├─ /timeseries       : (캐시) 시계열 지수 API
   ├─ /health           : 서버 상태 체크
   ├─ auth/metering     : (옵션) API Key, Rate limit
   └─ 내부 라이브러리    : rag/, db/, model/, safety/, cache/, observability/
        │
[gRPC / HTTP (LAN)]
        │
[AI Core (Python / FastAPI)]
   ├─ /generate_draft   : 역할별 초안 생성 (LoRA 자동 장착)
   └─ /generate_edit    : 편집자(합성/정제)
        │
[Local I/O]
        │
[Data Plane]
   ├─ Vector DB            : macro/firm/household 네임스페이스
   ├─ SQLite (finance.db)  : 정형 재무/메타 데이터
   └─ TS Cache             : 시계열 데이터 캐시 (KOSPI/IXIC, TTL 5~15분)
```

---

## 🔑 주요 기능

- **실시간 경제 지수 해석** (KOSPI, NASDAQ 등)
- **뉴스·정책·자금 흐름 기반 전문가 분석** (Eco / Firm / House)
- **역할별 LoRA 어댑터** 이용 초개인화 해석 가능
- **RAG 기반 근거 검색** 및 근거 데이터 활용 *(확장 예정)*
- **데이터 파이프라인**: 시계열 캐시, 벡터 DB, SQLite 통합

---

## ⚙️ 사용법

### 1. 요구 환경

- Node.js ≥ 18
- Python ≥ 3.10
- (선택) Docker / Docker Compose
- GPU 사용 시: CUDA + PyTorch

### 2. 환경 변수 설정

루트 `.env.example` 참고:

```bash
# --- Backend ---
BACKEND_PORT=3001
AI_BASE_URL=http://localhost:8008
TIMESERIES_CACHE_TTL=600

# --- Frontend ---
NEXT_PUBLIC_API_BASE=http://localhost:3001

# --- Router / AI Endpoints ---
ROUTER_AI_BASE=http://localhost:8008
ECO_AI_BASE=http://localhost:8008
FIRM_AI_BASE=http://localhost:8008
HOUSE_AI_BASE=http://localhost:8008
EDITOR_AI_BASE=http://localhost:8008

# --- AI Core ---
AI_HOST=0.0.0.0
AI_PORT=8008
MODEL_ID=Qwen/Qwen3-0.6B
```

복사 예시:

```bash
cp .env.example backend/.env
cp .env.example frontend/.env
cp .env.example ai/.env
```

> `ROUTER_AI_BASE`는 라우터에 사용할 Qwen3-0.6B(OpenAI 호환) 엔드포인트를 가리킵니다. 별도 프록시나 포트를 쓸 경우 `ECO_AI_BASE` / `FIRM_AI_BASE` / `HOUSE_AI_BASE` / `EDITOR_AI_BASE`를 해당 서비스의 `/chat` 주소로 덮어쓰세요.

### 3. 설치

```bash
# 1) Python 가상환경 및 공통 패키지
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2) Backend / Frontend 의존성
cd backend && npm i && cd ..
cd frontend && npm i && cd ..
```

### 4. 통합 실행 (`run.sh`)

새로운 실행 스크립트가 네 개의 서비스를 한 번에 기동합니다.

```bash
cd Eco-Mentos
chmod +x run.sh               # 최초 1회

# (선택) 필요 시 환경변수 덮어쓰기
export MARKET_API_PORT=8010
export AI_WORKDIR=/path/to/custom/ai
export ROUTER_AI_BASE=http://localhost:8008

./run.sh
```

- 기동 서비스  
  - `market_api` : FastAPI 기반 지수·시세 API (`MARKET_API_PORT`, 기본 8000)  
  - `ai-core`    : Eco/Firm/House/Editor 라우팅 파이프라인 (기본 8008)  
  - `backend`    : Express API (`BACKEND_PORT`, 기본 3001)  
  - `frontend`   : Next.js 클라이언트 (`NEXT_PUBLIC_PORT`, 기본 3000)  
- 로그는 `logs/*.log` 로 스트리밍되며, Ctrl+C 입력 시 모든 하위 프로세스가 안전하게 종료됩니다.

> 전체 데이터 흐름: **Frontend(3000) → Backend(3001) → AI Router(8008) → 역할별 LoRA 서버**

### 5. 개별 서비스 수동 실행 (선택)

통합 스크립트 대신 각 서비스를 따로 실행하고 싶은 경우:

```bash
# (1) 시장 데이터 API
cd market_api
uvicorn app:app --host 127.0.0.1 --port 8000 --reload

# (2) AI Core (멀티 프로세스 라우터)
cd ai
python main.py

# (3) Backend
cd backend
npm run dev   # or npm run build && npm start

# (4) Frontend
cd frontend
npm run dev
```

### 6. LoRA 어댑터 활용 (역할별 분석 강화)

- RBLN 모델과 어댑터를 한 번에 내보내려면:

```bash
python ai/compile_rbln_model.py Qwen/Qwen3-0.6B \
  --max-seq-len 8192 \
  --lora eco=ai/eco/lora/qwen3_0p6b_lora_eco/final \
  --lora firm=ai/firm/lora/qwen3_0p6b_lora_firm/final \
  --lora house=ai/house/lora/qwen3_0p6b_lora_house/final
```

- 기본 출력: `ai/models/Qwen3-0.6B` (베이스 모델) + `ai/models/Qwen3-0.6B-eco|firm|house` (LoRA 병합본)
- `run.sh`는 위 디렉터리를 자동 감지하여 `ECO_MODEL_ID`, `FIRM_MODEL_ID`, `HOUSE_MODEL_ID` 환경변수로 전달합니다.
- RBLN SDK가 아직 LoRA 핫스왑 API를 제공하지 않아, 현재는 역할별 프로세스에 병합된 모델을 주입하는 방식으로 동작합니다.
- 어댑터 경로만 바꾸면 재컴파일로 손쉽게 교체할 수 있습니다 (`--force`로 덮어쓰기).

### 7. Docker Compose

```bash
docker compose up --build
# frontend(3000), backend(3001), ai(8008) 자동 연결
```

### 8. 빠른 테스트

```bash
# 헬스 체크
curl http://localhost:3001/health

# 자동 라우팅 (질문에 따라 eco→firm)
curl -s http://localhost:3001/ask \
  -H "Content-Type: application/json" \
  -d '{"q":"금리 인상 이후 삼성전자 전망을 알려줘","mode":"auto"}' | jq '.meta.plan_roles,.meta.mode'

# 순차 라우팅 강제 지정 (eco → firm → house)
curl -s http://localhost:3001/ask \
  -H "Content-Type: application/json" \
  -d '{"q":"가계 투자 전략까지 단계별로 정리해줘","roles":["eco","firm","house"]}' | jq '.cards[].title'

# 시장 지수 API
curl "http://127.0.0.1:8000/series/KOSPI"
```

### 9. 프론트엔드 라우트

| 경로         | 설명                                           |
|--------------|------------------------------------------------|
| `/`          | 대시보드 (경제 상식, 스파크라인, 한줄 해석)     |
| `/ask`       | 질의 입력 → 모드/역할 선택 → Eco/Firm/House 카드 |
| `/history`   | 질의 기록/결과 저장 (추후 DB 연동)              |

### 10. 데이터 플레인 구조

```
data/
 ├─ docs/        # 텍스트/리포트
 ├─ csv/         # 시계열/재무 CSV
 ├─ embeddings/  # 벡터 인덱스 캐시
 └─ finance.db   # SQLite (정형 데이터)
```

**SQLite 예시:**
```sql
CREATE TABLE IF NOT EXISTS history(
  id INTEGER PRIMARY KEY,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  q TEXT, roles TEXT, mode TEXT,
  cards_json TEXT, metrics_json TEXT
);
```

### 11. AI Core API

| Endpoint           | 설명                         |
|--------------------|-----------------------------|
| `/chat`            | 기본 대화 (현재 사용)        |
| `/generate_draft`  | 역할별 초안 생성             |
| `/generate_edit`   | 에디터 합성/정제             |

**응답 예시:**
```json
{
  "content": "요약 결과 ...",
  "usage": { "prompt_tokens": 123, "completion_tokens": 98 }
}
```

## 🚑 트러블슈팅

- `/ask` roles 미지정 → 기본값 `["eco"]` 자동 적용
- 빈 응답 시: AI Core trust_remote_code=True, 폴백 요약 로직 있음
- CORS 문제: 백엔드에서 프론트 도메인 허용 필요
- 지연 시: 카드 하단 TTFT / Tokens / TPS / Conf 등 실시간 모니터링

---

## 🧰 기술 스택

| 구분       | 기술                                  |
|------------|--------------------------------------|
| Frontend   | Next.js 14, TypeScript, Tailwind     |
| Backend    | Node.js, Express, TypeScript         |
| AI Core    | FastAPI, Transformers, Exaone-3.5    |
| Data       | FAISS, SQLite, RAG                   |
| Infra      | Docker, .env, Localhost Bridge       |

---

## 🚦 프로젝트 현황

| 항목           | 상태   | 설명                              |
|----------------|--------|-----------------------------------|
| 프론트엔드 UI    | ✅     | 대시보드 + 질문 카드 UI           |
| 백엔드 REST API | ✅     | /ask, /timeseries, /health        |
| AI Core 연결     | ✅     | 로컬 Exaone                       |
| E2E 흐름        | ✅     | Front → Back → AI 완전 연결        |
| RAG / 근거검색   | 🚧     | 성능지표 / LoRA 확장 예정          |

---

> **AI-Economic-Interpreter**는 역할별 LoRA 어댑터 장착으로  
> 더욱 전문적이고 세분화된 경제 해석을 제공합니다.
