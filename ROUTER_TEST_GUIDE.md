# Router Test Guide

## 🧪 Backend 시작 방법

### Option 1: 전체 시스템 시작 (권장)
```bash
cd /home/woong/Economy-Mentor
./run.sh
```

### Option 2: Backend만 개발 모드로 시작
```bash
cd /home/woong/Economy-Mentor/backend
npm run dev
```

---

## 📋 Test Cases

### Test 1: AI Router Success - 명확한 역할 질문

**기업 분석 질문**:
```bash
curl -X POST http://localhost:4000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "q": "삼성전자 2024년 4분기 실적 분석해줘"
  }'
```

**Expected**:
- `router_source: "ai_router"` (AI가 성공적으로 분류)
- `router_confidence: 0.7~0.9`
- `roles: ["firm"]` 또는 `["eco", "firm"]`

**로그 확인**:
```
[ASK][Router] AI: ["firm"] (conf=0.90)
[ASK] { q: '삼성전자 2024년 4분기 실적 분석해줘', roles: ['firm'], mode: 'parallel', router: 'ai_router', confidence: '0.90' }
```

---

**거시 경제 질문**:
```bash
curl -X POST http://localhost:4000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "q": "미국 금리 인상이 한국 경제에 미치는 영향?"
  }'
```

**Expected**:
- `router_source: "ai_router"`
- `router_confidence: 0.7~0.9`
- `roles: ["eco"]`

---

**가계 재무 질문**:
```bash
curl -X POST http://localhost:4000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "q": "DSR 규제가 가계 대출에 미치는 영향은?"
  }'
```

**Expected**:
- `router_source: "ai_router"`
- `router_confidence: 0.7~0.9`
- `roles: ["house"]` 또는 `["eco", "house"]`

---

### Test 2: Heuristic Fallback - AI 타임아웃/실패

**애매한 질문 (AI 신뢰도 낮음)**:
```bash
curl -X POST http://localhost:4000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "q": "요즘 시장 어때?"
  }'
```

**Expected**:
- `router_source: "heuristic_fallback"` (AI 신뢰도 < 0.7 또는 타임아웃)
- `router_confidence: 0.85`
- `roles: ["eco", "firm", "house"]` (휴리스틱 결과)

**로그 확인**:
```
[ASK][Router] AI failed/timeout, using heuristic: ["eco","firm","house"]
[ASK] { q: '요즘 시장 어때?', roles: ['eco','firm','house'], mode: 'sequential', router: 'heuristic_fallback', confidence: '0.85' }
```

---

**복합 질문 (여러 역할 필요)**:
```bash
curl -X POST http://localhost:4000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "q": "삼성전자 실적이 코스피에 미치는 영향과 내 포트폴리오에 미치는 영향 알려줘"
  }'
```

**Expected**:
- AI가 여러 역할을 정확히 선택하면: `router_source: "ai_router"`, `roles: ["eco", "firm", "house"]`
- AI가 애매하게 판단하면: `router_source: "heuristic_fallback"`, `roles: ["eco", "firm", "house"]`

---

### Test 3: Explicit Roles - 명시적 역할 지정

**명시적 역할 우선**:
```bash
curl -X POST http://localhost:4000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "q": "최근 경제 동향은?",
    "roles": ["eco", "firm"]
  }'
```

**Expected**:
- `router_source: "explicit"` (AI Router 건너뜀)
- `router_confidence: 1.0`
- `roles: ["eco", "firm"]` (요청한 대로)

**로그 확인**:
```
[ASK] { q: '최근 경제 동향은?', roles: ['eco','firm'], mode: 'sequential', router: 'explicit', confidence: '1.00' }
```

---

### Test 4: 실시간 로그 모니터링

**Backend 로그 실시간 확인**:
```bash
# Terminal 1: Backend 실행
cd /home/woong/Economy-Mentor/backend
npm run dev

# Terminal 2: 로그 모니터링
tail -f /home/woong/Economy-Mentor/backend/logs/app.log | grep -E '\[ASK\]|\[Router\]'
```

**또는 stdout 직접 확인**:
```bash
# Terminal 1에서 Backend 실행 시 stdout에 로그 출력됨
cd /home/woong/Economy-Mentor/backend
npm run dev
```

---

## 📊 성능 측정

### AI Router 성공률 계산

**Backend 로그 파일 분석**:
```bash
# AI Router 성공/실패 횟수 집계
grep -E '\[ASK\]\[Router\]' backend/logs/app.log | \
  awk '
    /AI:/ { ai++ }
    /failed|timeout/ { heur++ }
    END {
      total = ai + heur
      if (total > 0) {
        printf "AI Success: %d\n", ai
        printf "Heuristic Fallback: %d\n", heur
        printf "Success Rate: %.1f%%\n", (ai/total)*100
      } else {
        print "No router logs found"
      }
    }
  '
```

**예상 출력**:
```
AI Success: 23
Heuristic Fallback: 7
Success Rate: 76.7%
```

---

### 평균 응답 시간 측정

**Curl with timing**:
```bash
for i in {1..10}; do
  echo "Request $i:"
  time curl -X POST http://localhost:4000/ask \
    -H "Content-Type: application/json" \
    -d '{"q": "삼성전자 실적 분석"}' \
    -s -o /dev/null -w "HTTP %{http_code} | Time: %{time_total}s\n"
  sleep 1
done
```

**예상 출력**:
```
Request 1:
HTTP 200 | Time: 1.234s
real    0m1.245s

Request 2:
HTTP 200 | Time: 1.189s
real    0m1.198s
...
```

---

## 🔍 Debugging

### Router가 작동하지 않는 경우

**1. Eco 서버 상태 확인**:
```bash
curl http://localhost:8001/health
```

**예상 응답**:
```json
{"status": "ok", "role": "eco"}
```

**만약 에러가 나면**:
- AI 서버가 실행 중인지 확인: `ps aux | grep "python.*main.py"`
- `run.sh`로 전체 재시작: `./run.sh`

---

**2. Backend 로그 확인**:
```bash
tail -50 backend/logs/app.log
```

**찾아야 할 에러**:
- `[Router] Classification failed: ...` → AI 서버 통신 실패
- `ECONNREFUSED` → Eco 서버(port 8001) 미응답
- `Timeout` → 150ms 내 응답 없음 (정상적인 fallback)

---

**3. TypeScript Import 확인**:
```bash
# bridge.ts에서 routerPromptV2 import 확인
grep -n "routerPromptV2" backend/src/ai/bridge.ts
```

**예상 출력**:
```
218:    const { routerPromptV2 } = await import('./prompts.js');
219:    const msgs = routerPromptV2(q);
```

---

**4. JSON 파싱 에러**:
```bash
# Eco 서버가 올바른 JSON을 반환하는지 직접 테스트
curl -X POST http://localhost:8001/generate \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "질문을 읽고 필요한 전문가를 선택하라.\n\n전문가:\n- eco: 금리·환율·경기·물가·정책\n- firm: 기업·주가·실적·재무\n- house: 가계·대출·포트폴리오·저축\n\n출력: {\"roles\":[\"eco\"]} (JSON만)"},
      {"role": "user", "content": "삼성전자 실적 분석\n\nJSON:"}
    ],
    "max_tokens": 30,
    "temperature": 0
  }'
```

**예상 응답**:
```json
{
  "content": "{\"roles\":[\"firm\"]}",
  "metrics": {...}
}
```

---

## ✅ 성공 기준

### 최소 요구사항
- [ ] Backend가 정상적으로 시작됨 (`npm run dev` 성공)
- [ ] Test 1 (AI Router Success) 중 하나라도 성공
- [ ] Test 3 (Explicit Roles) 성공
- [ ] 응답 JSON에 `meta.router_source`, `meta.router_confidence` 포함

### 성능 목표
- [ ] AI Router 성공률 >= 60%
- [ ] Heuristic Fallback이 항상 성공 (100%)
- [ ] 평균 응답 시간 < 2초 (병렬 모드)
- [ ] 평균 응답 시간 < 4초 (순차 모드)

### 안정성 목표
- [ ] AI 서버가 다운되어도 Heuristic Fallback으로 정상 응답
- [ ] 타임아웃(150ms) 시 즉시 Heuristic으로 전환
- [ ] 신뢰도 < 0.7 시 Heuristic으로 전환

---

## 🎯 Quick Test Commands

**Copy-paste ready commands**:

```bash
# 1. Backend 시작
cd /home/woong/Economy-Mentor/backend && npm run dev

# 2. 다른 터미널에서 테스트
# AI Router Success
curl -X POST http://localhost:4000/ask -H "Content-Type: application/json" -d '{"q": "삼성전자 실적 분석"}'

# Heuristic Fallback
curl -X POST http://localhost:4000/ask -H "Content-Type: application/json" -d '{"q": "요즘 시장 어때?"}'

# Explicit Roles
curl -X POST http://localhost:4000/ask -H "Content-Type: application/json" -d '{"q": "경제 동향", "roles": ["eco"]}'

# 3. 응답에서 meta 확인
curl -X POST http://localhost:4000/ask -H "Content-Type: application/json" -d '{"q": "삼성전자 실적 분석"}' | jq '.meta'
```

**예상 출력**:
```json
{
  "mode": "parallel",
  "roles": ["firm"],
  "provider": "local_moe",
  "ai_base": {...},
  "router_source": "ai_router",
  "router_confidence": 0.9
}
```

---

## 📝 Troubleshooting Checklist

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` 에러 | AI 서버 시작: `./run.sh` |
| `routerPromptV2 is not a function` | TypeScript 재컴파일: `npm run build` 또는 Backend 재시작 |
| AI Router 항상 실패 | Eco 서버 health check: `curl http://localhost:8001/health` |
| 응답에 `router_source` 없음 | Backend 코드 변경사항 적용 확인, 재시작 필요 |
| 타임아웃 너무 빈번 | `ask.ts:196` timeout 값 증가 (150 → 200ms) |
| AI 신뢰도 항상 낮음 | `bridge.ts:248` 신뢰도 임계값 조정 (0.7 → 0.6) |

---

## 🚀 Next Steps After Testing

1. **성능 데이터 수집**:
   - AI Router 성공률 측정
   - 평균 응답 시간 기록
   - Fallback 비율 분석

2. **튜닝**:
   - Timeout 최적화 (50ms ~ 300ms 범위)
   - 신뢰도 임계값 조정 (0.6 ~ 0.8 범위)
   - Prompt 개선 (키워드 추가/제거)

3. **모니터링 설정**:
   - Router 성공률 대시보드
   - 응답 시간 히스토그램
   - Fallback 원인 분석 (timeout vs low confidence)

4. **Frontend 통합**:
   - 응답 meta에서 `router_source` 표시
   - 신뢰도에 따라 UI 피드백 제공
   - "AI 추천" vs "규칙 기반" 구분 표시

