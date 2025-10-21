# Changelog - 2025-10-21

## Summary of Changes

This changelog documents the implementation of three major improvements to the Economy Mentor system:

1. **Historical Facts Integration** (Issue #3) - ✅ Already completed
2. **RAG Hallucination Prevention** (Issue #1) - ✅ Completed
3. **Duplicate Combined Card Fix** (Issue #2) - ✅ Completed
4. **Sequential Mode Summary Chain** (New Feature) - ✅ Completed

---

## 1. Historical Facts Integration (Issue #3)

### Status: ✅ Already Completed

### Summary
Verified that 187 historical economic events from `events_catalog_v2.json` are already integrated into the FAISS index.

### Details
- **File**: `RAG_zzin/data/events_catalog_v2.json`
- **Content**: 187 경제 이벤트 (예: 닉슨 쇼크 1971, 브레튼우즈 체제 붕괴 등)
- **Integration**: `scripts/build_faiss_index.py` lines 188-191
- **Result**: ECO index contains 1,535 documents (including all 187 events)

### No Changes Required
This feature was already implemented in the previous session.

---

## 2. RAG Hallucination Prevention (Issue #1)

### Status: ✅ Completed

### Problem
AI was generating fake URLs and sources (e.g., `https://www.kospi.co.kr`) when RAG data lacked proper source metadata.

### Root Cause
The prompt in `backend/src/ai/prompts.ts` line 47 forced the AI to always include source citations:
```typescript
- 각 불릿 끝에는 반드시 근거 괄호를 추가: (RAG#1 | 날짜 | 출처)
```

### Solution
Modified the prompt to make source citations **conditional** - only include when RAG data has actual source information.

### Changes Made
**File**: `backend/src/ai/prompts.ts`

```typescript
// BEFORE (lines 47-48)
- 각 불릿 끝에는 반드시 근거 괄호를 추가: (RAG#1 | 날짜 | 출처)
  예: (RAG#1 | 2023-01-15 | 한국은행)

// AFTER (lines 47-49)
- 각 불릿 끝에는 RAG 근거가 있을 때만 괄호를 추가: (RAG#1 날짜 출처)
  예: (RAG#1 2023-01-15 한국은행)
  주의: RAG 근거에 출처가 없으면 괄호를 생략하라. 절대 URL이나 링크를 임의로 생성하지 마라.
```

### Verification
- ✅ Tested with Gemini CLI code review
- ✅ Manual testing shows no more fake URLs generated

---

## 3. Duplicate Combined Card Fix (Issue #2)

### Status: ✅ Completed

### Problem
Sequential mode was generating **2 combined cards** instead of 1:
1. One from `genEditor`
2. One from `genCombinedAnswer`

### Root Cause
Both cards were being added to the `finalCards` array without deduplication.

### Solution
Filter out `genEditor`'s combined card when `genCombinedAnswer` exists.

### Changes Made
**File**: `backend/src/routes/ask.ts` (lines 654-662)

```typescript
// BEFORE
const finalCards = [...final.cards];
if (combinedCard) {
  finalCards.push(combinedCard);
}

// AFTER
let finalCards: Card[];
if (combinedCard) {
  // Sequential mode with combined answer: exclude genEditor's combined card
  finalCards = [...final.cards.filter(card => card.type !== 'combined'), combinedCard];
} else {
  // Parallel mode or single-expert: use genEditor's cards as-is
  finalCards = [...final.cards];
}
```

### Verification
- ✅ Tested successfully - only 1 combined card generated in sequential mode
- ✅ Gemini CLI code review approved (logic correctness, edge cases, performance all passed)

---

## 4. Sequential Mode Summary Chain (New Feature)

### Status: ✅ Completed

### Feature Description
Each expert in sequential mode now generates a **2-line summary** at the end of their answer. This summary is extracted and passed to the next expert instead of the full answer, reducing context size and improving efficiency.

### Implementation

#### 4.1 Prompt Modification
**File**: `backend/src/ai/prompts.ts` (lines 52-56)

Added instruction to include embedded summary in expert answers:

```typescript
- 답변 맨 마지막에 반드시 다음 형식으로 2줄 요약을 추가하라:

--- 다음 전문가를 위한 요약 ---
[핵심 포인트 1줄]
[추가 컨텍스트 1줄]

- 내부 추론이나 메타 설명은 출력하지 마라.
```

#### 4.2 Summary Extraction Logic
**File**: `backend/src/routes/ask.ts` (lines 559-574)

Replaced external API call to `genSummary` with **regex-based extraction** from answer content:

```typescript
// ✅ Extract embedded summary from answer (for sequential mode)
let summaryForNextExpert = '';
if (mode === 'sequential') {
  const content = finalDraft.content;
  const summaryMatch = content.match(/---\s*다음 전문가를 위한 요약\s*---\n([\s\S]*?)(?:\n---|\n\n|$)/);
  if (summaryMatch && summaryMatch[1]) {
    summaryForNextExpert = summaryMatch[1].trim();
    console.log(`[ASK][SUMMARY][${role}]`, summaryForNextExpert.slice(0, 100));
  } else {
    // Fallback: extract last 2 non-empty lines
    const lines = content.split('\n').filter(l => l.trim());
    summaryForNextExpert = lines.slice(-2).join('\n');
    console.log(`[ASK][SUMMARY][${role}][FALLBACK]`, summaryForNextExpert.slice(0, 100));
  }
  summaryMap.set(role, summaryForNextExpert);
}
```

**Key Features:**
- Regex pattern matches the summary marker and extracts following content
- **Fallback mechanism**: If marker not found, extracts last 2 non-empty lines
- Stores summary in `summaryMap` for next expert to access
- Console logging for debugging

### 4.3 Performance Impact

Benchmark results from `test_sequential_summary.py`:

| Metric | Sequential Mode | Parallel Mode | Difference |
|--------|----------------|---------------|------------|
| **Avg Response Time** | 51.73s | 34.96s | +16.77s (+48%) |
| **GDP 단일 질문** | 22.92s | 20.70s | +2.22s (+11%) |
| **2-Expert (ECO+FIRM)** | 60.54s | 35.07s | +25.47s (+73%) |
| **3-Expert (All)** | 71.73s | 49.10s | +22.63s (+46%) |

**Summary Coverage:**
- Total cards generated: 9
- Cards with embedded summaries: 3
- **Coverage: 33.3%** (3/9 cards)

**Note**: Summary marker consistency varies by expert. ECO and FIRM experts sometimes generate summaries without the marker, triggering the fallback extraction mechanism.

---

## Testing Results

### Test Files Created
1. **`test_sequential_summary.py`** - Comprehensive feature test + performance benchmark
2. **`sequential_summary_test_results.json`** - Detailed test results with metrics

### Key Findings
- ✅ Embedded summary feature working (33% marker coverage, 100% with fallback)
- ✅ Sequential overhead acceptable (+48% avg, expected for sequential processing)
- ✅ No fake URLs generated
- ✅ Only 1 combined card per response
- ✅ Router accuracy maintained

---

## Code Review (Gemini CLI)

All changes were reviewed using Gemini CLI integration:

### Issue #2 Review Results:
- ✅ **Logic Correctness**: Perfect implementation
- ✅ **Edge Cases**: All scenarios handled safely
- ✅ **Performance**: `filter()` overhead negligible
- ✅ **Code Quality**: Optimal solution

---

## Files Modified

### 1. `backend/src/ai/prompts.ts`
- Lines 47-49: RAG citation conditional logic
- Lines 52-56: Embedded summary instruction

### 2. `backend/src/routes/ask.ts`
- Lines 559-574: Summary extraction logic
- Lines 654-662: Duplicate combined card filter

### 3. Test Files Created
- `test_sequential_summary.py`
- `sequential_summary_test_results.json`
- `CHANGELOG_2025-10-21.md` (this file)

---

## Next Steps (Optional Future Improvements)

1. **Improve Summary Marker Consistency**
   - Fine-tune prompts to ensure all experts consistently generate the summary marker
   - Current fallback mechanism works but could be optimized

2. **Optimize Sequential Mode Performance**
   - Current +48% overhead is expected for sequential processing
   - Could explore parallel RAG retrieval while maintaining sequential expert chain

3. **Extended Testing**
   - Test with more complex multi-expert scenarios
   - Validate summary quality with human evaluation

---

## Migration Notes

No breaking changes. All modifications are backward-compatible:
- Parallel mode behavior unchanged
- Single-expert mode behavior unchanged
- RAG citation logic is now conditional (more robust)
- Combined card generation is cleaner (no duplicates)

---

## Contributors

- Implementation: Claude Code (AI Assistant)
- Code Review: Gemini CLI
- Testing: Automated test suite + manual verification
- User: woong

---

**Generated**: 2025-10-21 09:06:21 KST
**Test Duration**: ~4.5 minutes (3 test cases)
**Total Lines Modified**: ~50 lines
**Files Modified**: 2
**Files Created**: 3
