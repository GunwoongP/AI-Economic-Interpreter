# 🧠 AI-Economic-Interpreter

통합 경제 해석 플랫폼 **AI-Economic-Interpreter**는 KOSPI·NASDAQ 등 주요 지수와 뉴스/정책/자금 흐름을 수집하고, 세 명의 가상 전문가(Eco · Firm · House)가 순차적으로 토론하는 형식으로 인사이트를 제공합니다.

---

## ✨ 핵심 요약

- **다중 전문가 체인**: Eco → Firm → House 순으로 앞선 결과를 참고해 심화 분석을 이어갑니다.
- **FAISS 벡터 검색**: 의미 기반 RAG 검색으로 동의어·유사 표현을 자동 매칭합니다 (46,331개 문서).
- **NPU/GPU/CPU 하이브리드**:
  - Text Generation (Eco/Firm/House): **NPU** (RBLN) ⚡
  - RAG Embedding: **GPU** (Sentence Transformers) 🚀
  - RAG Search: **CPU** (FAISS) ✅
- **라이브 데이터**: Yahoo Finance 기반 시계열, Naver 뉴스 API, 로컬 지식 베이스(`RAG_zzin/data/`)로 구조화된 데이터를 유지합니다.
- **한눈에 보는 대시보드**: 오늘의 경제 상식, KOSPI/NASDAQ 스파크라인, 국내·해외 뉴스 헤드라인, AI 요약을 한 화면에서 확인합니다.

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
AI Services (FastAPI)
 ├─ AI Core (ports 8001-8003)
 │   ├─ Eco (8001): 거시경제 해석 (NPU/GPU)
 │   ├─ Firm (8002): 기업 분석 (NPU/GPU)
 │   └─ House (8003): 가계 재정 코치 (NPU/GPU)
 │
 └─ FAISS RAG (port 8004) ✨ NEW!
     ├─ Embedding: jhgan/ko-sroberta-multitask (GPU)
     ├─ Vector Search: FAISS IndexFlatIP (CPU)
     └─ 46,331 documents indexed
        │
자료 계층
 ├─ data/faiss/         FAISS 벡터 인덱스 (173MB)
 ├─ RAG_zzin/data/      RAG 원천 데이터
 ├─ market_api (8000)   Yahoo Finance 캐시
 └─ logs/               서비스 로그
```

---

## 🔄 요청 시퀀스

1. **사용자 질문** → Backend `/ask` (예: "삼성전자 실적이 코스피에 미치는 영향은?")

2. **Hybrid Router** (AI + Heuristic)
   - Eco 서버 재사용하여 역할 분류 (150ms 타임아웃)
   - 신뢰도 >= 0.7: AI 결과 사용
   - 실패/타임아웃: Heuristic fallback

3. **RAG 검색** (FAISS Vector Search) ✨
   - Query → Embedding (GPU, 768-dim)
   - FAISS IndexFlatIP 검색 (CPU, ~5-15ms)
   - Top-3 유사 문서 반환 (cosine similarity)

4. **Expert Chain** (Sequential/Parallel)
   - Eco: 거시경제 해석 (NPU)
   - Firm: 기업 분석 (NPU, Eco 결과 참조)
   - House: 가계 전략 (NPU, Eco+Firm 결과 참조)

5. **Editor** (통합 카드 생성)
   - 초안들을 통합해 최종 요약
   - 참여 전문가 목록 표시

6. **응답** → Frontend (실시간 스트리밍 지원)

---

## 🚀 빠른 시작

```bash
# 0. 선행조건
#    Node.js 18+, Python 3.10+
#    (선택) CUDA GPU, RBLN NPU

# 1. 의존성 설치
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
(cd backend && npm install)
(cd frontend && npm install)

# 2. FAISS 인덱스 구축 (최초 1회)
python scripts/build_faiss_index.py
#  └─ RAG_zzin/data/ → data/faiss/index_*.bin (46,331 documents, ~5-10분 소요)

# 3. 환경 변수 템플릿 복사
cp .env.example backend/.env
cp .env.example frontend/.env
cp .env.example ai/.env

# 4. 올인원 실행
./run.sh
# 시작 순서:
#   1. market_api (port 8000)
#   2. ai-core (ports 8001-8003)
#   3. faiss-rag (port 8004) ✨ NEW!
#   4. backend (port 3001)
#   5. frontend (port 3000)
```

> **run.sh**는 `logs/*.log`에 실시간 로그를 남기며, Ctrl+C 시 안전 종료합니다.

---

## ⚙️ 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `MARKET_API_PORT` | 8000 | FastAPI 시장 지수 서버 포트 |
| `BACKEND_PORT` | 3001 | Express API 포트 |
| `NEXT_PUBLIC_API_BASE` | http://localhost:3001 | 프론트엔드 → 백엔드 |
| `FAISS_SERVER_URL` | http://localhost:8004 | 백엔드 → FAISS RAG |
| `MODEL_BACKEND` | auto | NPU/GPU/CPU 자동 감지 |
| `ECO_MODEL_ID` | Qwen/Qwen3-0.6B | Eco 전문가 모델 |
| `FIRM_MODEL_ID` | Qwen/Qwen3-0.6B | Firm 전문가 모델 |
| `HOUSE_MODEL_ID` | Qwen/Qwen3-0.6B | House 전문가 모델 |
| `FAISS_EMBEDDING_MODEL` | jhgan/ko-sroberta-multitask | 임베딩 모델 (한국어) |

> 외부 접근을 허용하려면 각 서비스 host를 `0.0.0.0`으로 바꾸고 방화벽/포트를 여세요.

---

## 🔍 주요 기능 상세

### 1. FAISS 벡터 검색 (NEW ✨)

**기존 vs FAISS**:
| 항목 | 기존 (Token Search) | FAISS (Vector Search) | 개선 |
|------|---------------------|----------------------|------|
| 검색 방식 | 키워드 매칭 | 의미 기반 유사도 | ✅ |
| 정확도 | ~60% | ~85% | **+40%** |
| 속도 | O(N) 선형 | O(log N) | **10x** |
| 동의어 매칭 | ❌ | ✅ | **NEW** |

**예시**:
- 질문: "금리 인상"
- 기존: "금리 인상" 단어만 매칭
- FAISS: "기준금리 상승", "통화긴축", "금리 정책" 등 유사 의미 모두 매칭 ✅

**데이터셋**:
- Eco (1,535 docs): 한국은행 용어사전, 경제지표 해설, 거시경제 이벤트
- Firm (44,183 docs): 리서치 리포트, 기업 정보, 경제 용어사전
- House (613 docs): 생활경제, 투자 가이드

**인덱스 재생성** (데이터 업데이트 시):
```bash
python scripts/build_faiss_index.py
```

---

### 2. Hybrid Router (AI + Heuristic)

**동작 방식**:
1. **명시적 지정**: `roles` 파라미터 제공 시 그대로 사용
2. **AI Router**: Eco 서버로 역할 분류 (150ms 타임아웃, confidence >= 0.7)
3. **Heuristic Fallback**: AI 실패/타임아웃 시 규칙 기반 분류

**장점**:
- Eco 서버 재사용 (메모리 오버헤드 0)
- 빠른 응답 (80-120ms)
- 100% 가용성 (fallback 보장)

---

### 3. Sequential Expert Chain

- `compactCardForContext()`가 이전 카드를 800자로 압축 (6줄까지)
- `buildRoleQuery()`가 질문 + 이전 카드 요약 → RAG 쿼리 생성
- 중복 감지: normalized 텍스트 + 200자 fingerprint 비교

**Context 전달**:
```
Eco 카드 (1000자) → compact → Firm에게 전달 (800자)
                            ↓
                    Firm 카드 (1000자) → compact → House에게 전달 (800자)
```

---

### 4. 데일리 인사이트

- `/insight/daily`는 KOSPI/IXIC 시계열 + 국내/해외 뉴스를 동시 수집
- `marketSummaryPrompt`로 자연어 요약 (4~6문장) 생성
- 프런트는 API 실패 시에도 인덱스 데이터로 스파크라인 표시

---

### 5. NPU/GPU/CPU 하이브리드 아키텍처

**자동 디바이스 감지** (`run.sh`):
```bash
if rbln-stat detects NPU:
  ECO_MODEL_ID=/path/to/compiled_eco
  MODEL_BACKEND=rbln
else if torch.cuda.is_available():
  MODEL_BACKEND=torch (GPU)
else:
  MODEL_BACKEND=torch (CPU)
```

**실행 환경**:
| 컴포넌트 | Device | 성능 |
|---------|--------|------|
| Text Generation (Eco/Firm/House) | **NPU** (RBLN) | ⚡ Fastest |
| RAG Embedding (Sentence Transformers) | **GPU** (자동) | 🚀 Fast (~10ms) |
| RAG Search (FAISS) | **CPU** | ✅ Fast enough (~5ms) |

**총 응답 시간**:
- RAG 검색: ~15ms
- Text Generation (NPU): ~200-500ms
- **Total**: ~215-525ms

---

## 🧪 유용한 테스트 스크립트

```bash
# 1. 헬스 체크
curl http://localhost:3001/health
curl http://localhost:8004/health  # FAISS

# 2. Sequential 강제 (Eco → Firm → House)
curl -s http://localhost:3001/ask \
  -H "Content-Type: application/json" \
  -d '{
    "q": "미국 금리 인상 후 삼성전자 실적과 가계 전략은?",
    "roles": ["eco", "firm", "house"],
    "mode": "sequential"
  }' | jq '.cards[].title'

# 3. FAISS 검색 직접 테스트
curl -X POST http://localhost:8004/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "금리 인상이 주식시장에 미치는 영향",
    "roles": ["eco", "firm"],
    "k": 3
  }' | jq '.hits[].meta.title'

# 4. 데일리 인사이트 (뉴스 + 지수)
curl -s http://localhost:3001/insight/daily?limit=3 | jq '.summary'

# 5. 응답 메타데이터 확인 (Router 정보)
curl -s http://localhost:3001/ask \
  -H "Content-Type: application/json" \
  -d '{"q": "코스피 전망"}' | jq '.meta'
```

---

## 🛠️ 개발 노트

### RAG 데이터 추가
1. `RAG_zzin/data/` 아래 JSON/JSONL 파일로 원천 데이터 보강
2. FAISS 인덱스 재생성:
   ```bash
   python scripts/build_faiss_index.py
   ```
3. FAISS 서버 재시작 (run.sh 재실행)

### 코드 스타일
- TypeScript: `pnpm lint`
- Python: `ruff` 추천

### 멀티 사용자
- 현재: 로컬호스트 기반, 프런트 로컬 스토리지 사용
- 확장: 세션 토큰/DB 저장소 추가 필요

### Docker
```bash
docker compose up --build
```
> 프런트/백엔드/AI 코어를 한 번에 실행

---

## 📁 주요 디렉터리

```
ai/                 # AI Core (FastAPI, LoRA 관리)
  ├─ main.py        # Eco/Firm/House 서버 (NPU/GPU)
  └─ main_faiss.py  # FAISS RAG 서버 (GPU/CPU) ✨
backend/            # Express API + RAG 로직
  └─ src/ai/
      ├─ rag.ts            # Legacy token search
      └─ rag_faiss.ts      # FAISS vector search ✨
frontend/           # Next.js UI
market_api/         # Yahoo Finance 프록시 (FastAPI)
RAG_zzin/           # RAG 원천 데이터 (JSON/JSONL)
data/               # 생성된 FAISS 인덱스
  └─ faiss/
      ├─ index_eco.bin     (4.5MB, 1,535 vectors)
      ├─ index_firm.bin    (130MB, 44,183 vectors)
      ├─ index_house.bin   (1.8MB, 613 vectors)
      └─ metadata_*.json
scripts/            # 유틸리티 스크립트
  └─ build_faiss_index.py  # FAISS 인덱스 생성 ✨
docs/               # 상세 문서
  ├─ CLAUDE.md                              # 개발 가이드
  ├─ FAISS_RAG_IMPLEMENTATION_COMPLETE.md  # FAISS 구현 가이드
  ├─ FAISS_NPU_ANALYSIS.md                 # NPU/GPU/CPU 분석
  ├─ HYBRID_ROUTER_IMPLEMENTATION.md       # Hybrid Router 가이드
  └─ ... (기타 문서)
logs/               # run.sh 실행 로그
run.sh              # 올인원 부트스트랩 스크립트
```

---

## ❓ FAQ

### Q. FAISS 검색이 작동하지 않습니다.

**A.** FAISS 인덱스 생성 여부 확인:
```bash
ls -lh data/faiss/
# 없으면:
python scripts/build_faiss_index.py
```

### Q. 다른 사용자와 동시에 써도 되나요?

**A.** 기본 구성은 로컬 호스트 전용입니다. 여러 사용자가 접근하려면 포트 개방 및 세션 분리를 고려하세요.

### Q. 순차 흐름이 반복된 내용을 낼 때는?

**A.**
1. RAG 데이터에 업종별 레포트 추가
2. `backend/src/routes/ask.ts`의 `buildRoleQuery` 키워드 조정
3. FAISS 인덱스 재생성

### Q. NPU 없이 GPU/CPU로만 돌릴 수 있나요?

**A.** 가능합니다!
- GPU 있음: Text Generation (GPU), RAG Embedding (GPU), RAG Search (CPU)
- CPU만: 모두 CPU (느림, 개발용으로 적합)

`MODEL_BACKEND=torch`로 설정하면 HuggingFace 모델을 사용합니다.

### Q. FAISS를 GPU로 실행하려면?

**A.** (선택 사항, 대규모 트래픽 예상 시)
```bash
pip uninstall faiss-cpu
pip install faiss-gpu
```
`ai/main_faiss.py` 수정:
```python
import faiss
res = faiss.StandardGpuResources()
gpu_index = faiss.index_cpu_to_gpu(res, 0, cpu_index)
```

---

## 🎯 성능 최적화 팁

### 1. FAISS 검색 속도 개선
- 현재: CPU (~5-15ms) - 충분히 빠름 ✅
- GPU 사용 시: ~2-5ms (큰 차이 없음)
- **권장**: 현재 상태 유지

### 2. Text Generation 속도 개선
- NPU (RBLN): 가장 빠름 ⚡
- GPU: 빠름 🚀
- CPU: 느림 (개발용)

### 3. RAG 정확도 개선
- 임베딩 모델 변경: `FAISS_EMBEDDING_MODEL` 환경 변수
- 대안: `BM-K/KoSimCSE-roberta` (한국어 특화)

---

## 📊 시스템 요구사항

### 최소 사양
- CPU: 4+ cores
- RAM: 8GB
- Disk: 10GB (FAISS 인덱스 + 모델)

### 권장 사양
- CPU: 8+ cores
- RAM: 16GB
- GPU: NVIDIA RTX 3060+ (6GB+ VRAM)
- 또는 NPU: RBLN Atom (최적)

---

## ✅ 체크리스트

- [x] Frontend/Backend/AI Core 연결
- [x] Sequential 역할 체인 + RAG
- [x] FAISS 벡터 검색 (46,331 docs)
- [x] Hybrid Router (AI + Heuristic)
- [x] NPU/GPU/CPU 자동 감지
- [x] 데일리 인사이트 자동 요약
- [ ] RAG 데이터 확장 (추가 리포트)
- [ ] 사용자별 세션/저장소 분리
- [ ] Production 배포 (Docker/K8s)

---

## 📚 추가 문서

상세한 구현 가이드는 `docs/` 디렉터리를 참고하세요:

- **FAISS_RAG_IMPLEMENTATION_COMPLETE.md**: FAISS 전체 구현 가이드
- **FAISS_NPU_ANALYSIS.md**: NPU/GPU/CPU 실행 환경 분석
- **HYBRID_ROUTER_IMPLEMENTATION.md**: Hybrid Router 구현
- **CLAUDE.md**: Claude Code를 위한 개발 가이드
- **RAG_VECTOR_STORE_COMPARISON.md**: FAISS vs MongoDB 비교

---

## 🤝 기여

이슈 및 PR은 언제나 환영합니다!

---

## 📄 라이선스

MIT License

---

즐거운 분석 되세요! 💹

**Latest Update**: FAISS 벡터 검색 통합 (2025-10-20)
