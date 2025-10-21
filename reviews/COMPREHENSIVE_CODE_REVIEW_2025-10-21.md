# 종합 코드 리뷰 보고서
## Economy-Mentor 프로젝트
**날짜**: 2025-10-21
**리뷰어**: Gemini CLI + Claude Code
**범위**: AI 서버, Backend 라우팅, 전체 아키텍처

---

## Executive Summary

Economy-Mentor 프로젝트는 3개의 AI 전문가(ECO, FIRM, HOUSE)가 협력하여 경제 질문에 답변하는 시스템입니다. Gemini CLI를 활용한 종합 코드 리뷰 결과, **기능적으로는 우수**하나 **유지보수성과 확장성** 측면에서 개선이 필요합니다.

### 핵심 발견사항:
- ✅ **잘된 점**: 하이브리드 라우팅, 중복 제거 로직, 멀티프로세스 아키텍처
- ⚠️ **긴급 문제**: NPU 경로 하드코딩, 상대 경로 의존성 (**→ 수정 완료**)
- 💡 **개선 필요**: 700줄 단일 파일, 전역 타임아웃 부재, 코드 모듈화

---

## 1. AI 서버 (`ai/main.py`)

### 역할
- 3개의 AI 전문가 서버(8001, 8002, 8003) 멀티프로세스 실행
- NPU/GPU/CPU 자동 감지 및 모델 경로 해석
- 프로세스 생명주기 관리

### 잘된 점 ✅

1. **견고한 하드웨어 자동 감지**
   - NPU > GPU > CPU 우선순위 자동 선택
   - optimum.rbln 및 rbln-stat 이중 확인
   - 다양한 배포 환경 대응 가능

2. **지능적인 모델 경로 해석**
   - 환경 변수, HF_HOME, 프로젝트 루트 등 다양한 경로 탐색
   - 중복 경로 자동 제거
   - 유연한 모델 위치 지원

3. **멀티프로세스 아키텍처 장점**
   - 안정성: 한 서버 크래시가 다른 서버에 영향 없음
   - 자원 격리: 독립된 메모리 공간
   - 확장성: 역할별 하드웨어 할당 가능

4. **명확한 정보 제공**
   - 시작 시 테이블 형태로 구성 표시
   - 디버깅 용이

### 문제점 ⚠️

#### 1. NPU 모델 경로 하드코딩 (긴급도: 5/5, 중요도: 5/5) ✅ **수정 완료**

**Before:**
```python
eco_model = resolve_local_model(os.environ.get("ECO_MODEL_ID") or
    "/home/elicer/yeonsup/compiled_lora_eco_32k/compiled")
```

**After:**
```python
base_dir = Path(__file__).resolve().parent
eco_model = resolve_local_model(os.environ.get("ECO_MODEL_ID") or
    str(base_dir / "compiled/lora_eco_32k"))
```

**수정 내용**:
- 특정 사용자 경로 제거
- 프로젝트 루트 기준 상대 경로 사용
- 다른 환경에서도 즉시 실행 가능

#### 2. 상대 경로 의존성 (긴급도: 4/5, 중요도: 3/5) ✅ **수정 완료**

**Before:**
```python
register_rbln_loras({
    "eco": "./lora/eco_adapter",  # 상대 경로
    ...
})
```

**After:**
```python
register_rbln_loras({
    "eco": str(base_dir / "lora/eco_adapter"),  # 절대 경로
    ...
})
```

**수정 내용**:
- 실행 위치에 무관하게 동작
- main.py 파일 위치 기준 절대 경로 사용

#### 3. 리소스 관리 한계 (긴급도: 3/5, 중요도: 4/5) - **개선 권장**

**문제**: `terminate()` 즉시 종료로 진행 중인 요청 중단 가능

**개선 제안**:
```python
def shutdown(_sig=None, _frm=None):
    print("[AI-Main] Sending graceful shutdown signal...")
    for p in procs.values():
        if p.is_alive():
            p.send_signal(signal.SIGINT)  # 우아한 종료 요청

    # 30초 대기
    for p in procs.values():
        p.join(timeout=30)

    # 아직 살아있으면 강제 종료
    for p in procs.values():
        if p.is_alive():
            p.kill()
    sys.exit(0)
```

#### 4. Health Check 부재 (긴급도: 2/5, 중요도: 3/5) - **Nice-to-have**

**제안**: 각 서버 시작 후 `/health` 엔드포인트 확인
```python
import requests
for role, port in ROLE_PORTS.items():
    # ... p.start() 후
    time.sleep(2)
    try:
        resp = requests.get(f"http://localhost:{port}/health", timeout=5)
        if resp.status_code == 200:
            print(f"[AI-Main] ✅ {role} health check passed")
        else:
            print(f"[AI-Main] ⚠️ {role} health check failed")
    except Exception as e:
        print(f"[AI-Main] ❌ {role} not responding: {e}")
```

---

## 2. Backend 라우팅 (`backend/src/routes/ask.ts`)

### 역할
- AI + Heuristic 하이브리드 라우팅
- Sequential/Parallel 모드 오케스트레이션
- RAG 근거 수집 및 중복 제거
- 임베디드 요약 추출

### 잘된 점 ✅

1. **하이브리드 라우팅 전략**
   - AI 라우터 실패 시 Heuristic으로 즉시 폴백
   - 시스템 안정성과 응답성 보장
   - **평가**: 매우 훌륭한 설계

2. **중복 제거 전략**
   - `normalizedContent`: 전체 내용 정확한 중복 방지
   - `fingerprintContent`: 초반 100자로 유사 답변 필터링
   - **효율성**: 단일 요청 범위 내 Set 사용, 메모리 부담 없음

3. **견고한 에러 핸들링**
   - `AskHttpError`로 명확한 HTTP 상태 전달
   - `gatherEvidence` 실패 시 빈 배열로 계속 진행 (Graceful Degradation)
   - `finally` 블록에서 리소스 정리

### 문제점 ⚠️

#### 1. 700줄 단일 파일 (긴급도: 3/5, 중요도: 5/5) - **개선 권장**

**문제**: 라우팅, 오케스트레이션, 데이터 변환, AI 호출, 에러 처리가 한 파일에 집중

**개선 제안**:
```
backend/src/
├── routes/
│   └── ask.ts (컨트롤러만 유지)
├── services/
│   ├── routing.ts (Heuristic + AI Router)
│   ├── heuristicRules.ts (규칙 기반 배열)
│   ├── askOrchestrator.ts (runAsk 로직)
│   ├── ragService.ts (gatherEvidence)
│   ├── deduplication.helper.ts (중복 제거)
│   └── contextBuilder.ts (buildRoleQuery, compactCardForContext)
```

#### 2. selectRoles 복잡도 (긴급도: 3/5, 중요도: 4/5) - **개선 권장**

**문제**: 100+ 줄 if-else 체인, 가독성 낮음

**개선 제안**:
```typescript
// heuristicRules.ts
export const routingRules = [
  {
    roles: ['eco', 'firm'],
    priority: 1,
    keywords: [/기업|실적/, /코스피|시장/, /영향|변동/],
    name: '기업+시장 영향 분석'
  },
  {
    roles: ['eco'],
    priority: 2,
    keywords: [/금리|환율/, /주식|시장/, /영향|미치/],
    excludes: [/기업/],
    name: '거시경제 시장 영향'
  },
  // ... 기타 규칙
];

// routing.ts
export function selectRolesByRules(q: string): Role[] {
  const s = q.toLowerCase();

  for (const rule of routingRules) {
    const keywordMatch = rule.keywords.every(kw => kw.test(s));
    const excludeMatch = rule.excludes?.some(ex => ex.test(s)) ?? false;

    if (keywordMatch && !excludeMatch) {
      console.log(`[Router] Matched rule: ${rule.name}`);
      return rule.roles;
    }
  }

  return ['eco', 'firm', 'house']; // default
}
```

#### 3. 전역 타임아웃 부재 (긴급도: 4/5, 중요도: 4/5) - **개선 예정**

**문제**: `runAsk` 전체를 감싸는 타임아웃 없음. LLM 호출 무한 대기 가능성

**개선 제안**:
```typescript
async function runAskWithTimeout(prepared, options, timeoutMs = 120000) {
  return Promise.race([
    runAsk(prepared, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    )
  ]);
}

router.post("/", async (req, res) => {
  try {
    const prepared = await prepareAsk(req.body);
    const out = await runAskWithTimeout(prepared, {}, 120000);  // 2분 타임아웃
    return res.json(out);
  } catch (err) {
    // ... 에러 처리
  }
});
```

#### 4. AI 라우터 타임아웃 (긴급도: 2/5, 중요도: 3/5) - **모니터링 필요**

**문제**: 150ms 타임아웃이 너무 짧을 가능성

**제안**: Prometheus 등으로 p95, p99 응답 시간 측정 후 재조정

### 성능 평가: Sequential 모드 +48% 오버헤드

**원인**: 각 전문가마다 RAG 재검색

**평가**: **품질을 위한 의도된 설계 (Trade-off by Design)**
- 장점: 이전 전문가 답변을 다음 전문가 RAG 쿼리에 반영 → 깊이 있는 분석
- 단점: RAG 검색 반복 → 속도 저하

**결론**:
- 현재 구조는 '품질 우선' 정책
- UX 요구사항에 따라 속도 최적화 고려 가능
- 대안: 초기 Broad RAG Search 또는 하이브리드 RAG

---

## 3. 수정 완료된 항목 Summary

### ✅ ai/main.py - NPU 경로 하드코딩 제거
- **Before**: `/home/elicer/yeonsup/...` 특정 환경 종속
- **After**: `base_dir / "compiled/lora_eco_32k"` 프로젝트 기준
- **효과**: 다른 환경에서도 즉시 실행 가능

### ✅ ai/main.py - 상대 경로 의존성 제거
- **Before**: `"./lora/eco_adapter"` 실행 위치 의존
- **After**: `str(base_dir / "lora/eco_adapter")` 절대 경로
- **효과**: 어디서든 안정적 실행

---

## 4. 권장 개선 사항 (우선순위 순)

### 우선순위 1: 전역 타임아웃 추가 (긴급도 4, 진행 중)
- 파일: `backend/src/routes/ask.ts`
- 작업: `runAskWithTimeout` 구현
- 예상 시간: 30분

### 우선순위 2: selectRoles 리팩토링 (긴급도 3, 권장)
- 파일: `backend/src/services/heuristicRules.ts` (신규)
- 작업: 규칙 기반 배열로 변환
- 예상 시간: 2시간

### 우선순위 3: 코드 모듈화 (긴급도 3, 권장)
- 파일: `backend/src/routes/ask.ts` 분리
- 작업: 서비스 레이어 분리 (6개 파일)
- 예상 시간: 1일

### 우선순위 4: Graceful Shutdown (긴급도 3, 권장)
- 파일: `ai/main.py`
- 작업: SIGINT → 대기 → SIGKILL 구현
- 예상 시간: 1시간

### 우선순위 5: Health Check (긴급도 2, Nice-to-have)
- 파일: `ai/main.py`
- 작업: /health 엔드포인트 확인
- 예상 시간: 1시간

---

## 5. Gemini CLI 리뷰 하이라이트

### ai/main.py 종합 평가
> "견고한 하드웨어 자동 감지, 지능적인 모델 경로 해석, 멀티프로세스 아키텍처 등 **기술적으로 매우 우수**합니다. 다만 특정 환경 의존성(NPU 경로 하드코딩)은 **즉시 수정이 필요**합니다."

### ask.ts 종합 평가
> "AI와 Heuristic을 결합한 하이브리드 라우팅은 **매우 훌륭한 설계**입니다. 다만 700줄에 육박하는 단일 파일은 **유지보수성 한계**에 도달했습니다. 현재 시점에서 **리팩토링을 통한 코드 분리**가 가장 중요합니다."

### Sequential 모드 성능 평가
> "+48%의 오버헤드는 '품질'을 최우선으로 선택한 결과이며, **의도된 트레이드오프**입니다. 사용자가 고품질 답변을 선호한다면 현재 구조는 적절합니다."

---

## 6. 다음 단계

### 즉시 실행 (진행 중)
- [x] ai/main.py NPU 경로 수정
- [x] ai/main.py 상대 경로 수정
- [ ] backend/src/routes/ask.ts 전역 타임아웃 추가

### 단기 계획 (1-2주)
- [ ] selectRoles 리팩토링 (규칙 기반)
- [ ] Graceful Shutdown 구현
- [ ] AI 라우터 응답 시간 모니터링

### 중기 계획 (1개월)
- [ ] ask.ts 코드 모듈화 (서비스 레이어 분리)
- [ ] Health Check 구현
- [ ] 성능 벤치마크 및 최적화

---

## 7. 결론

Economy-Mentor 프로젝트는 **기능적으로 우수한 AI 협업 시스템**입니다. Gemini CLI 리뷰를 통해 발견된 긴급 문제들은 즉시 수정되었으며, 중장기 개선 사항은 우선순위에 따라 점진적으로 적용할 예정입니다.

**핵심 성과**:
- ✅ 2개의 긴급 문제 즉시 수정 (NPU 경로, 상대 경로)
- ✅ 포괄적인 코드 리뷰 완료
- ✅ 우선순위 기반 개선 로드맵 수립

**다음 목표**:
- 전역 타임아웃 추가로 시스템 안정성 강화
- 점진적 리팩토링으로 유지보수성 향상

---

**리뷰 완료 일시**: 2025-10-21 09:20 KST
**리뷰 참여자**: Gemini CLI (AI Architect), Claude Code (Implementation)
**문서 버전**: 1.0
