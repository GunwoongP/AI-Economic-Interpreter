# Gemini CLI 코드 리뷰 Summary - 2025-10-21

## 리뷰 범위
- AI 서버 (Python)
- Backend 라우팅 로직 (TypeScript)
- 프롬프트 관리 (TypeScript)
- AI 브릿지 (TypeScript)
- RAG 시스템 (TypeScript)

## 리뷰 진행 상황

### ✅ 완료: ai/main.py

#### 주요 발견사항:

**잘된 점:**
1. **견고한 하드웨어 자동 감지**: NPU > GPU > CPU 우선순위 자동 선택
2. **지능적인 모델 경로 해석**: 다양한 경로 탐색 및 중복 제거
3. **멀티프로세스 아키텍처**: 안정성, 자원 격리, 확장성 확보
4. **명확한 정보 제공**: 시작 시 테이블 형태 출력

**문제점:**
1. **NPU 모델 경로 하드코딩**: `/home/elicer/yeonsup/...` 특정 환경 종속
2. **리소스 관리 한계**: `terminate()` 즉시 종료로 요청 중단 가능
3. **상대 경로 의존성**: `./lora/...` 실행 위치에 따라 변경 가능
4. **백엔드-모델 경로 강한 결합**: SRP 위반

**개선 제안:**
1. 모델 경로를 프로젝트 루트 기준 상대 경로로 변경
2. Graceful Shutdown 구현 (SIGINT → 대기 → SIGKILL)
3. LoRA 경로를 절대 경로로 변환
4. Health Check 기능 추가

**우선순위:**
- NPU 경로 하드코딩: 긴급도 5, 중요도 5
- Graceful Shutdown: 긴급도 3, 중요도 4
- 상대 경로 문제: 긴급도 4, 중요도 3
- Health Check: 긴급도 2, 중요도 3

---

### 🔄 진행중: backend/src/routes/ask.ts

#### 주요 발견사항 (진행중):

**잘된 점:**
1. **하이브리드 라우팅**: AI router + heuristic fallback 전략 우수
2. **중복 제거 전략**: fingerprint + normalized content 이중 검사
3. **견고한 에러 핸들링**: Graceful degradation 패턴 적용

**문제점:**
1. **700줄 단일 파일**: 유지보수성 한계
2. **selectRoles 복잡도**: 100+ 줄 if-else 체인
3. **AI 라우터 타임아웃**: 150ms 너무 짧을 가능성
4. **전역 타임아웃 부재**: runAsk 전체 타임아웃 없음

**개선 제안:**
1. **모듈 분리**:
   - `/services/routing.ts` - 라우터 로직
   - `/services/askOrchestrator.ts` - 오케스트레이션
   - `/services/ragService.ts` - RAG 검색
   - `/services/deduplication.helper.ts` - 중복 제거
   - `/services/contextBuilder.ts` - 컨텍스트 구성

2. **Rule-based Router**:
```typescript
// 예시: /services/heuristicRules.ts
const rules = [
  { 
    roles: ['eco', 'firm'], 
    keywords: [/기업|실적/, /코스피|시장/, /영향|변동/] 
  },
  ...
];
```

3. **AI 라우터 타임아웃 모니터링**: p95, p99 측정 후 재조정

---

### ⏳ 대기중
- backend/src/ai/prompts.ts
- backend/src/ai/bridge.ts
- backend/src/ai/rag_faiss.ts

---

