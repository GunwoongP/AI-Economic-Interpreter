# Router & Expert Selection 상세 분석

## 📋 목차
1. [Router 기능 제거 배경](#router-기능-제거-배경)
2. [현재 Expert Selection 동작 방식](#현재-expert-selection-동작-방식)
3. [Request Flow 전체 흐름](#request-flow-전체-흐름)
4. [Role Selection 휴리스틱 상세](#role-selection-휴리스틱-상세)

---

## 🚫 Router 기능 제거 배경

### **Before (제거 전):**

시스템에는 **2가지 역할 선택 메커니즘**이 병존했습니다:

1. **`selectRoles()` - 정규식 기반 휴리스틱** (ask.ts:60-149)
   - 질문 텍스트에서 키워드 패턴 매칭
   - 예: "금리" → `['eco']`, "삼성전자" → `['firm']`

2. **`planRoles()` - AI 기반 Router** (bridge.ts:314-327)
   - 작은 LLM을 호출해 JSON 응답 파싱
   - 예: `{"roles":["eco","firm"],"mode":"sequential"}`

### **문제점:**

```typescript
// prepareAsk() in ask.ts:170-214 (Before)
async function prepareAsk(body: AskInput): Promise<PreparedAsk> {
  const explicit = sanitizeSequence(body.roles);
  const fallback = selectRoles(q, preferList);

  // ❌ 명시적 roles 없으면 AI planner 호출
  const plannerEnabled = !explicit.length;
  let planner = null;
  if (plannerEnabled) {
    planner = await planRoles({ query: q, prefer: preferList });  // 200-300ms 소요
  }

  // ❌ planner 실패 시 fallback으로 다시 selectRoles 사용
  const mergedPath = explicit.length ? explicit
    : plannerPath.length ? enforceAllowed(plannerPath)
    : fallback;
}
```

**실제 호출 흐름:**
```
사용자 요청
  ↓
prepareAsk()
  ↓
roles 명시 안 됨?
  ↓ Yes
planRoles() 호출 ← 200-300ms 지연 + LLM 토큰 소비
  ↓
JSON 파싱 성공?
  ↓ No (실패 가능)
selectRoles() fallback ← 결국 휴리스틱 사용
```

**결론:**
- AI planner는 **오버헤드만 발생**하고 휴리스틱보다 나은 결과를 보장하지 못함
- 휴리스틱이 이미 한국어 질문 패턴을 잘 처리함

---

### **After (현재):**

```typescript
// prepareAsk() in ask.ts:170-202 (After)
async function prepareAsk(body: AskInput): Promise<PreparedAsk> {
  const explicit = sanitizeSequence(body.roles);
  const preferList = body.prefer ?? [];

  // ✅ AI planner 제거, 휴리스틱만 사용
  const roles = explicit.length ? explicit : selectRoles(q, preferList);

  // ✅ Mode 결정도 단순화
  const mode = body.mode !== 'auto' ? body.mode
    : roles.length > 1 ? 'sequential'
    : selectMode(q, 'auto');

  return { q, roles, mode, generationRoles: roles };
}
```

**개선 효과:**
- ✅ 200-300ms 지연 제거
- ✅ 코드 복잡도 감소
- ✅ 예측 가능한 동작 (AI planner의 불확실성 제거)

---

## ⚙️ 현재 Expert Selection 동작 방식

### **1단계: Role 결정**

사용자 요청이 들어오면 다음 우선순위로 역할(Expert) 결정:

```typescript
// ask.ts:170-202
const explicit = sanitizeSequence(body.roles);  // 사용자 명시적 지정
const preferList = body.prefer ?? [];           // 선호 힌트

const roles = explicit.length > 0
  ? explicit                    // 1순위: 명시적 지정
  : selectRoles(q, preferList); // 2순위: 휴리스틱 자동 선택
```

#### **케이스 1: 명시적 지정 (최우선)**

```bash
# API 요청 예시
curl -X POST http://localhost:3001/ask \
  -H "Content-Type: application/json" \
  -d '{
    "q": "미국 금리 인상 영향은?",
    "roles": ["eco", "firm"]  # ← 명시적 지정
  }'

# 결과: ["eco", "firm"] 사용 (휴리스틱 무시)
```

#### **케이스 2: 자동 선택 (휴리스틱)**

```bash
curl -X POST http://localhost:3001/ask \
  -H "Content-Type: application/json" \
  -d '{
    "q": "미국 금리 인상 후 삼성전자 주가와 가계 대출 전략은?"
    # roles 필드 없음
  }'

# selectRoles() 호출
# → "금리" (eco), "삼성전자" (firm), "대출" (house) 감지
# → 결과: ["eco", "firm", "house"]
```

---

### **2단계: Mode 결정**

```typescript
// ask.ts:185-191
const hasExplicitMode = body.mode && body.mode !== 'auto';

let mode: 'parallel' | 'sequential';
if (hasExplicitMode) {
  mode = body.mode;  // 명시적 지정
} else {
  // 역할 개수로 판단
  mode = roles.length > 1 ? 'sequential' : selectMode(q, 'auto');
}
```

**Mode 결정 로직:**

| 조건 | Mode | 설명 |
|------|------|------|
| `body.mode="sequential"` | `sequential` | 사용자 명시 |
| `body.mode="parallel"` | `parallel` | 사용자 명시 |
| `roles.length > 1` | `sequential` | 2명 이상 → 순차 |
| `roles.length === 1` | `selectMode(q)` | 질문 패턴 분석 |

**selectMode() 패턴 분석:**
```typescript
// ask.ts:152-158
function selectMode(q: string, mode: 'auto'|'parallel'|'sequential'='auto'){
  if (mode !== 'auto') return mode;

  const normalized = q.toLowerCase();

  // "반영", "기준으로", "그 다음" 등 순차 키워드 감지
  return /(반영|기준으로|토대로|업데이트|재해석|그\s*(?:다음|후)|먼저|순서대로|단계|이어[서지는]?)/.test(normalized)
    ? 'sequential'
    : 'parallel';
}
```

---

### **3단계: Expert 실행**

#### **Parallel Mode (병렬)**
```typescript
// ask.ts:484-485
await Promise.all(generationRoles.map((role, index) => runRole(role, index)));
```

```
사용자 질문: "코스피가 뭐야?"
  ↓
selectRoles() → ["eco"]
  ↓
mode = "parallel" (단일 역할)
  ↓
┌─────────────┐
│ Eco Expert  │ ← 독립 실행
└─────────────┘
  ↓
Editor 통합 → 최종 카드
```

#### **Sequential Mode (순차)**
```typescript
// ask.ts:480-483
if (mode === 'sequential') {
  for (let i = 0; i < generationRoles.length; i += 1) {
    await runRole(generationRoles[i], i);
  }
}
```

```
사용자 질문: "미국 금리 인상 후 삼성전자 주가와 가계 전략은?"
  ↓
selectRoles() → ["eco", "firm", "house"]
  ↓
mode = "sequential" (3명)
  ↓
┌─────────────┐
│ Eco Expert  │ ← RAG: 금리 인상 데이터
└─────────────┘
       ↓ (Eco 카드 요약 800자 전달)
┌─────────────┐
│ Firm Expert │ ← RAG: 삼성전자 실적 + Eco 요약
└─────────────┘
       ↓ (Eco + Firm 카드 요약 전달)
┌─────────────┐
│House Expert │ ← RAG: 가계 대출 + Eco/Firm 요약
└─────────────┘
       ↓
Editor 통합 → 최종 3개 카드
```

---

## 🔍 Request Flow 전체 흐름

### **API 요청 → 응답 전체 과정**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. HTTP POST /ask                                           │
│    { "q": "금리 인상 후 삼성전자는?", "mode": "auto" }      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. prepareAsk() - ask.ts:170-202                            │
│    - explicit roles 체크                                     │
│    - selectRoles(q) 호출 → ["eco", "firm"]                  │
│    - mode 결정 → "sequential" (2명 이상)                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. runAsk() - ask.ts:306-489                                │
│    - attachAdapters(roles) ← LoRA 준비 (실제론 noop)        │
│    - Sequential 모드 시작                                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. runRole("eco", 0) - ask.ts:338-439                       │
│    ┌──────────────────────────────────────────────────┐    │
│    │ 4-1. gatherEvidence()                            │    │
│    │      - buildRoleQuery("eco", q, [])              │    │
│    │      - searchRAG(query, ["eco"], 6)              │    │
│    │      → RAG 상위 3개 결과 반환                     │    │
│    └──────────────────────────────────────────────────┘    │
│    ┌──────────────────────────────────────────────────┐    │
│    │ 4-2. genDraft()                                  │    │
│    │      - draftPrompt("eco", q, evidences, [])      │    │
│    │      - localGenerate("eco", msgs)                │    │
│    │        → POST http://localhost:8001/chat         │    │
│    │      → Eco 카드 생성                             │    │
│    └──────────────────────────────────────────────────┘    │
│    ┌──────────────────────────────────────────────────┐    │
│    │ 4-3. 중복 체크 (최대 2-3회 시도)                 │    │
│    │      - temperature 0.3, 0.6 시도                 │    │
│    │      → 최종 Eco 카드 확정                        │    │
│    └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. runRole("firm", 1) - Sequential 모드                     │
│    ┌──────────────────────────────────────────────────┐    │
│    │ 5-1. 이전 카드 컨텍스트 준비                      │    │
│    │      - rawPrevious = [Eco 카드]                  │    │
│    │      - compactCardForContext(Eco, 6줄, 800자)    │    │
│    │        → Eco 요약본 생성                          │    │
│    └──────────────────────────────────────────────────┘    │
│    ┌──────────────────────────────────────────────────┐    │
│    │ 5-2. gatherEvidence()                            │    │
│    │      - buildRoleQuery("firm", q, [Eco 요약])     │    │
│    │      - searchRAG(query, ["firm"], 6)             │    │
│    │        → Eco 컨텍스트 + 삼성전자 키워드 검색      │    │
│    └──────────────────────────────────────────────────┘    │
│    ┌──────────────────────────────────────────────────┐    │
│    │ 5-3. genDraft()                                  │    │
│    │      - draftPrompt("firm", q, evidences,         │    │
│    │                    previousCards=[Eco 요약])     │    │
│    │      - localGenerate("firm", msgs)               │    │
│    │        → POST http://localhost:8002/chat         │    │
│    │      → Firm 카드 생성 (Eco 내용 참조)            │    │
│    └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. genEditor() - bridge.ts:213-252                          │
│    - editorPrompt(q, [Eco카드, Firm카드])                   │
│    - localGenerate("editor", msgs)                          │
│      → POST http://localhost:8001/chat (Eco 서버 공유)      │
│    → 통합 카드 1개 + 보조 카드 1-2개                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. HTTP Response                                            │
│    {                                                        │
│      "cards": [                                             │
│        { "type": "combined", "title": "통합 해석", ... },   │
│        { "type": "eco", "title": "거시 핵심", ... },        │
│        { "type": "firm", "title": "기업 스냅샷", ... }      │
│      ],                                                     │
│      "metrics": { "ttft_ms": 2500, "tps": 45 },            │
│      "meta": {                                              │
│        "mode": "sequential",                                │
│        "roles": ["eco", "firm"]                             │
│      }                                                      │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Role Selection 휴리스틱 상세

### **selectRoles() 전체 로직** (ask.ts:60-149)

```typescript
function selectRoles(q: string, prefer: Role[] = []): AskRole[] {
  const s = q.toLowerCase();

  // ═══════════════════════════════════════════════════════════
  // 1단계: 키워드 감지
  // ═══════════════════════════════════════════════════════════
  const hasInvest = /(투자|포트폴리오|리밸런싱|매수|매도|분산투자|자산배분|전략)/.test(s);
  const hasMacroCue = /(gdp|국내총생산|금리|환율|정책|경기|경제|물가|부동산|dxy|유가)/.test(s);
  const hasSpecificFirm = /(삼성|하이닉스|네이버|카카오|현대|sk|lg|테슬라|엔비디아|애플)/.test(s);
  const hasGenericFirm = /(기업|회사|업종|섹터|산업|종목|분야|시장)/.test(s);
  const hasHouseCue = /(가계|가족|은퇄|연금|저축|예금|적금|채권|포트폴리오|dsr|대출)/.test(s);

  // ═══════════════════════════════════════════════════════════
  // 2단계: Special Intent Routing (우선순위 높음)
  // ═══════════════════════════════════════════════════════════

  // "코스피가 뭐야?" → eco only
  if (/코스피/.test(s) && /(뭐야|무엇|뜻|설명)/.test(s)) {
    return ['eco'];
  }

  // "오르는 데 가장 기여한 기업은?" → eco → firm
  if (/(기여|기여한).*(기업)/.test(s) || /(기여).*(코스피|지수)/.test(s)) {
    return ['eco', 'firm'];
  }

  // "어떤 기업에 투자하면 좋을까?" → eco → firm → house
  if (/(어떤\s*기업|기업).*투자(하면|할까|좋을까)/.test(s) || /(투자).*(기업)/.test(s)) {
    return ['eco', 'firm', 'house'];
  }

  // ═══════════════════════════════════════════════════════════
  // 3단계: 키워드 조합 패턴 분석
  // ═══════════════════════════════════════════════════════════

  // prefer가 없는 경우의 단축 경로
  const preferActive = prefer.length > 0;

  if (!preferActive) {
    if (/(gdp|국내총생산)/.test(s)) {
      return ['eco'];  // GDP → eco only
    }

    if (hasSpecificFirm && hasInvest) {
      return ['firm', 'house'];  // 삼성 + 투자 → firm, house
    }

    if (hasSpecificFirm && !hasInvest && !hasMacroCue) {
      return ['firm'];  // 삼성 단독 → firm only
    }

    if (hasHouseCue && !hasSpecificFirm && !hasGenericFirm) {
      return hasMacroCue ? ['eco', 'house'] : ['house'];
    }

    // ... 더 많은 패턴
  }

  // ═══════════════════════════════════════════════════════════
  // 4단계: 키워드 버퍼 누적
  // ═══════════════════════════════════════════════════════════
  const buffer: Role[] = prefer.slice(0, 3);

  if (/(금리|환율|정책|경기|경제|물가|부동산)/.test(s)) buffer.push('eco');
  if (/(per|roe|재무|실적|기업|회사|종목|반도체)/.test(s)) buffer.push('firm');
  if (/(가계|포트폴리오|dsr|대출|분산|예산|리스크)/.test(s)) buffer.push('house');

  let roles = sanitizeSequence(buffer);  // 중복 제거

  // ═══════════════════════════════════════════════════════════
  // 5단계: 기본값 및 보정
  // ═══════════════════════════════════════════════════════════
  if (!roles.length) {
    roles = ['eco', 'firm', 'house'];  // 모호한 질문 → 전체
  }

  if (!roles.includes('eco')) {
    roles = ['eco', ...roles];  // eco가 없으면 항상 추가
  }

  // 단일 역할인 경우 확장 로직
  if (roles.length === 1) {
    const single = roles[0];
    if (single === 'eco') {
      const addFirm = /(기업|실적|주가|산업|시장|투자)/.test(s);
      const addHouse = /(가계|포트폴리오|대출|부채|소비)/.test(s);
      roles = ['eco'];
      if (addFirm) roles.push('firm');
      if (addHouse) roles.push('house');
      if (roles.length === 1) {
        roles.push('firm', 'house');  // eco만 → 전체로 확장
      }
    }
    // firm/house 단독도 유사하게 확장
  }

  // ═══════════════════════════════════════════════════════════
  // 6단계: 최종 순서 정렬 및 검증
  // ═══════════════════════════════════════════════════════════
  const ROLE_ORDER: AskRole[] = ['eco', 'firm', 'house'];
  const ordered = ROLE_ORDER.filter((role) => roles.includes(role));

  return enforceAllowed(ordered.length ? ordered : ['eco', 'firm', 'house']);
}
```

---

### **실제 예시**

#### **예시 1: "미국 금리 인상이 삼성전자 주가에 미치는 영향은?"**

```
Step 1: 키워드 감지
  - hasMacroCue = true  ← "금리"
  - hasSpecificFirm = true  ← "삼성전자"
  - hasInvest = false

Step 2: Special Intent
  - /(어떤\s*기업|기업).*투자/ ← 매칭 안 됨

Step 3: 조합 패턴
  - hasSpecificFirm && !hasInvest && hasMacroCue
  - → 매칭 안 됨 (hasMacroCue=true이므로)

Step 4: 버퍼 누적
  - buffer = []
  - "금리" 감지 → buffer.push('eco')
  - "삼성전자" 감지 → buffer.push('firm')
  - roles = ['eco', 'firm']

Step 5: 기본값 보정
  - roles.length > 1 → 통과
  - roles.includes('eco') → 통과

Step 6: 최종 정렬
  - ordered = ['eco', 'firm']

✅ 결과: ["eco", "firm"]
```

#### **예시 2: "코스피가 뭐야?"**

```
Step 2: Special Intent
  - /코스피/.test(s) && /(뭐야|무엇|뜻|설명)/.test(s)
  - ✅ 매칭!

✅ 결과: ["eco"] (즉시 반환)
```

#### **예시 3: "어떤 기업에 투자하면 좋을까?"**

```
Step 2: Special Intent
  - /(어떤\s*기업|기업).*투자(하면|할까|좋을까)/.test(s)
  - ✅ 매칭!

✅ 결과: ["eco", "firm", "house"] (즉시 반환)
```

---

## 📊 Expert 활성화 흐름 요약

```
사용자 요청
  ↓
┌─────────────────────────────────────────┐
│ prepareAsk()                            │
│  ├─ explicit roles 있음?                │
│  │   ├─ Yes → 그대로 사용                │
│  │   └─ No → selectRoles(q) 호출        │
│  │         ↓                            │
│  │   [휴리스틱 분석]                     │
│  │    - 키워드 감지                      │
│  │    - 특수 패턴 체크                   │
│  │    - 버퍼 누적 & 정렬                 │
│  │         ↓                            │
│  │   ["eco", "firm", "house"]           │
│  │                                      │
│  └─ mode 결정                            │
│      - roles.length > 1 → sequential    │
│      - roles.length === 1 → selectMode()│
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ runAsk()                                │
│  - Sequential 모드 시작                  │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ for each role in ["eco", "firm", ...]: │
│   ├─ gatherEvidence()                  │
│   │    - buildRoleQuery()               │
│   │    - searchRAG()                    │
│   │                                     │
│   ├─ genDraft()                         │
│   │    - draftPrompt()                  │
│   │    - localGenerate(role, msgs)      │
│   │      → HTTP POST to 8001/8002/8003  │
│   │                                     │
│   └─ 중복 체크 & 최종 카드 확정          │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ genEditor()                             │
│  - editorPrompt()                       │
│  - localGenerate("editor", msgs)        │
│    → HTTP POST to 8001 (Eco 서버 공유)  │
└─────────────────────────────────────────┘
  ↓
최종 응답 (cards + metrics + meta)
```

---

## 🔑 핵심 요약

1. **Router 제거**: AI 기반 `planRoles()` 완전 제거, 휴리스틱만 사용
2. **Expert 선택**: `selectRoles()` 휴리스틱이 질문 패턴 분석하여 자동 결정
3. **Sequential 체인**: Eco → Firm → House 순서로 이전 카드 요약(800자)을 다음 Expert에게 전달
4. **포트 할당**:
   - 8001: Eco (+ Editor/Router 공유)
   - 8002: Firm
   - 8003: House
5. **응답 시간**: AI planner 제거로 200-300ms 단축
