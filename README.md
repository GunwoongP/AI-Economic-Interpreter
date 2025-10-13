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

### 3. 설치

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cd backend && npm i && cd ..
cd frontend && npm i && cd ..
```

### 4. 개발모드 실행

1. **시장 데이터 API (FastAPI)**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

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

> 전체 데이터 흐름: **Frontend(3000) → Backend(3001) → AI Core(8008)**

### 5. LoRA 어댑터 활용 (역할별 분석 강화)

- 디렉터리: `ai/eco/lora/`, `ai/firm/lora/`, `ai/house/lora/`
- 각 역할별 LoRA 어댑터 디렉터리에 `adapter_config.json`이 포함된 하위폴더(예: `final/`) 자동 탐색
- 환경 변수로 경로 재정의 가능

```bash
export ECO_LORA_PATH=/path/to/eco_adapter
export FIRM_LORA_PATH=/path/to/firm_adapter
export HOUSE_LORA_PATH=/path/to/house_adapter
# 공통경로: export LORA_PATH=/shared/lora
```

- 서버 기동 시 콘솔에 `lora=/...` 로그 출력 → 정상 장착
- 사용 중지: 환경 변수 비우고 어댑터 파일 제거

### 6. Docker Compose

```bash
docker compose up --build
# frontend(3000), backend(3001), ai(8008) 자동 연결
```

### 7. 빠른 테스트

```bash
curl http://localhost:3001/health
curl -X POST http://localhost:3001/ask -H "Content-Type: application/json" \
  -d '{"q":"코스피가 뭐야","roles":["eco"],"mode":"parallel"}'
curl "http://127.0.0.1:8000/series/KOSPI"
```

### 8. 프론트엔드 라우트

| 경로         | 설명                                           |
|--------------|------------------------------------------------|
| `/`          | 대시보드 (경제 상식, 스파크라인, 한줄 해석)     |
| `/ask`       | 질의 입력 → 모드/역할 선택 → Eco/Firm/House 카드 |
| `/history`   | 질의 기록/결과 저장 (추후 DB 연동)              |

### 9. 데이터 플레인 구조

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

### 10. AI Core API

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

### 11. 런 스크립트 예시

`scripts/dev.sh`:

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