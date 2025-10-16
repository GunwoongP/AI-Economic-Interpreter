# 🧠 AI-Economic-Interpreter

통합 경제 해석 플랫폼 **AI-Economic-Interpreter**는 KOSPI·NASDAQ 등 주요 지수와 뉴스/정책/자금 흐름을 수집하고, 세 명의 가상 전문가(Eco · Firm · House)가 순차적으로 토론하는 형식으로 인사이트를 제공합니다.

---

## ✨ 핵심 요약
- **다중 전문가 체인**: Eco → Firm → House 순으로 앞선 결과를 참고해 심화 분석을 이어갑니다.
- **RAG + LoRA**: 역할별 LoRA 어댑터와 RAG 근거 검색을 결합해 숫자·출처가 있는 해석을 생성합니다.
- **라이브 데이터**: Yahoo Finance 기반 시계열, Naver 뉴스 API, 로컬 지식 베이스(JSONL)로 구조화된 데이터를 유지합니다.
- **한눈에 보는 대시보드**: 오늘의 경제 상식, KOSPI/NASDAQ 스파크라인, AI 요약을 한 화면에서 확인합니다.

---

## 🏛 시스템 구조
```
사용자 브라우저
 └─ Frontend (Next.js 14)
     ├─ /           대시보드
     ├─ /ask        질의/역할 선택, 실시간 스트리밍 답변
     └─ /history    로컬 스토리지에 저장된 대화 기록
        │
HTTPS JSON
        │
Backend (Express + TypeScript)
 ├─ /ask            전문가 플로 orchestration
 ├─ /ask/stream     NDJSON 스트리밍 응답
 ├─ /timeseries     Market API 프록시 + 캐시
 └─ /insight/daily  뉴스 + 지수 → 데일리 요약
        │
Internal HTTP
        │
AI Core (FastAPI)
 ├─ /chat           역할별 드래프트 생성 (LoRA 핫스왑)
 └─ 편집 파이프라인    sequential 모드 전용 에디터
        │
자료 계층
 ├─ data/rag/*.jsonl      역할별 문헌
 ├─ market_api (FastAPI)  Yahoo Finance 캐시
 └─ logs/                 orchestrator 로그
```

---

## 🔄 요청 시퀀스
1. 사용자가 `/ask`에 질문과 모드를 전송합니다 (기본 `mode=auto`).
2. 백엔드 플래너가 필요한 역할 조합(총 7가지)을 고르고 순차/병렬 모드를 결정합니다.
3. 각 역할은 **buildRoleQuery → searchRAG → genDraft**를 수행하면서 앞선 카드 내용을 참조합니다.
4. 편집자는 생성된 카드 묶음을 통합해 최종 요약 + 참여 전문가 목록을 작성합니다.
5. `/ask/stream`를 사용하면 초안 조각을 실시간 NDJSON으로 받을 수 있습니다.

---

## 🚀 빠른 시작
```bash
# 0. 선행조건
#    Node.js 18+, Python 3.10+, (선택) CUDA GPU

# 1. 의존성 설치
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
(cd backend && npm install)
(cd frontend && npm install)

# 2. 환경 변수 템플릿 복사
cp .env.example backend/.env
cp .env.example frontend/.env
cp .env.example ai/.env

# 3. 올인원 실행
./run.sh
# market_api(8000), ai-core(8008), backend(3001), frontend(3000) 순서로 기동
```
> run.sh는 `logs/*.log`에 실시간 로그를 남기며, Ctrl+C 시 안전 종료합니다.

---

## ⚙️ 환경 변수 메모
| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `MARKET_API_PORT` | 8000 | FastAPI 시장 지수 서버 포트 |
| `AI_PORT` | 8008 | AI Core (LoRA 서버) 포트 |
| `BACKEND_PORT` | 3001 | Express API 포트 |
| `NEXT_PUBLIC_API_BASE` | http://localhost:3001 | 프론트에서 사용하는 백엔드 베이스 |
| `ROUTER_AI_BASE` | http://localhost:8008 | 백엔드 → AI Core 엔드포인트 |
| `MODEL_ID` | Qwen/Qwen3-0.6B | 공통 기본 모델 |
| `ECO_MODEL_ID` 등 | (Optional) | 역할별 모델 덮어쓰기 |

> 외부 접근을 허용하려면 각 서비스 host를 `0.0.0.0`으로 바꾸고 방화벽/포트를 여세요.

---

## 🔍 주요 기능 상세
### 1. RAG + Sequential 체인
- `buildRoleQuery()`가 역할별 키워드와 이전 카드 요약을 결합해 RAG 검색어를 만듭니다.
- `fetchEvidence()`는 실패 시 기본 질문으로 폴백하며, Eco 카드가 비면 Firm/House도 자연스럽게 축소됩니다.
- 중복 감지를 위해 카드 normalized 텍스트 + 200자 fingerprint를 모두 비교합니다.

### 2. 데일리 인사이트
- `/insight/daily`는 KOSPI/IXIC 시계열 + Naver 뉴스(정렬: date)를 가져온 후 두 단계로 생성합니다.
  1. JSON 구조 통일 (코스피/나스닥 headline & bullet)
  2. `marketSummaryPrompt`로 자연어 요약(4~6문장) 생성
- 프런트는 fallback 텍스트를 준비해 API 실패 시에도 UI가 깨지지 않습니다.

### 3. 역할별 LoRA 어댑터
- `ai/main.py`에서 eco/firm/house 어댑터 경로를 등록하고, `set_active_lora` 지원 시 핫스왑합니다.
- RBLN 포맷으로 내보내려면:
  ```bash
python ai/compile_rbln_model.py Qwen/Qwen3-0.6B \
  --max-seq-len 8192 \
  --lora eco=ai/eco/lora/qwen3_0p6b_lora_eco/final \
  --lora firm=ai/firm/lora/qwen3_0p6b_lora_firm/final \
  --lora house=ai/house/lora/qwen3_0p6b_lora_house/final
```

---

## 🧪 유용한 테스트 스크립트
```bash
# 헬스 체크
curl http://localhost:3001/health

# Sequential 강제 (Eco → Firm → House)
curl -s http://localhost:3001/ask   -H "Content-Type: application/json"   -d '{"q":"미국 금리 인상 후 국내 가계 전략은?","roles":["eco","firm","house"],"mode":"sequential"}' | jq '.cards[].title'

# 데일리 인사이트 (뉴스 + 지수)
curl -s http://localhost:3001/insight/daily?limit=3 | jq '.summary'
```

Node 기반 단위 테스트 예시 (`tests/sequential-ask.test.ts`):
```ts
import assert from 'node:assert/strict';
import fetch from 'node-fetch';

(async () => {
  const res = await fetch('http://localhost:3001/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: '금리 인상 이후 삼성전자와 가계 포트폴리오 전략은?',
      mode: 'sequential',
      roles: ['eco', 'firm', 'house'],
    }),
  });

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.meta.mode, 'sequential');
  assert.deepEqual(payload.meta.roles, ['eco', 'firm', 'house']);
  assert.ok(payload.cards[0].content.includes('<참여 전문가>'));
})();
```

---

## 🛠️ 개발 노트
- 코드 스타일: TypeScript `pnpm lint`, Python `ruff` 추천 (설치만 하면 됨)
- RAG 데이터 추가: `backend/data/rag/{eco,firm,house}.jsonl`에 JSON Lines로 문서를 추가하면 즉시 반영됩니다.
- 멀티 사용자: 현재는 로컬호스트 기반이며, 프런트가 로컬 스토리지를 이용해 히스토리를 보관합니다. 외부 공유 시 세션 토큰/로그 저장소를 추가로 구현하세요.
- Docker: `docker compose up --build`로 프런트/백엔드/AI 코어를 한 번에 띄울 수 있습니다 (시장 API는 선택적으로 compose에 추가).

---

## 📁 주요 디렉터리
```
ai/                 # AI Core (FastAPI, LoRA 관리)
backend/            # Express API + RAG 로직
frontend/           # Next.js UI
market_api/         # Yahoo Finance 프록시 (FastAPI)
data/rag/           # 역할별 RAG 데이터셋(JSONL)
logs/               # run.sh 실행 로그
run.sh              # 올인원 부트스트랩 스크립트
```

---

## ❓ FAQ
- **Q. 다른 사용자와 동시에 써도 되나요?**
  - A. 기본 구성은 로컬 호스트 전용입니다. 여러 사용자가 접근하려면 포트 개방 및 세션 분리를 고려하세요.

- **Q. 순차 흐름이 반복된 내용을 낼 때는?**
  - A. RAG 데이터에 업종별 레포트를 추가하거나, `backend/src/routes/ask.ts`의 `buildRoleQuery` 키워드를 조정해 주세요.

- **Q. RBLN 없이 CPU로만 돌릴 수 있나요?**
  - A. 가능하지만 속도가 느려집니다. `MODEL_BACKEND=torch`로 바꾸면 Hugging Face 변환 경로를 사용합니다.

---

## ✅ 체크리스트
- [x] Frontend/Backend/AI Core 연결
- [x] Sequential 역할 체인 + RAG
- [x] 데일리 인사이트 자동 요약
- [ ] RAG 데이터 확장 (기업 실적/섹터 리포트)
- [ ] 사용자별 세션/저장소 분리

즐거운 분석 되세요! 💹
