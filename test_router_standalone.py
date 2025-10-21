#!/usr/bin/env python3
"""
Standalone Router Logic Test
Tests router logic without requiring AI servers to be running
"""

import json
from typing import List

def test_router_logic(question: str) -> List[str]:
    """
    Replicate the router logic from backend/src/routes/ask.ts
    """
    s = question.lower()

    # Priority rules (most specific first)

    # Rule 1: 기업 + 시장/지수 + 영향
    if any(k in s for k in ['삼성', '하이닉스', '기업', '회사', '종목', '실적']) and \
       any(k in s for k in ['코스피', '코스닥', '지수', '시장']) and \
       any(k in s for k in ['영향', '미치', '변동', '흐름']):
        return ['eco', 'firm']

    # Rule 2: 코스피/지수 + 기업/돌파/기여 (지수에 영향 준 기업)
    if any(k in s for k in ['코스피', '코스닥', '지수']) and \
       any(k in s for k in ['돌파', '기여', '영향', '올리', '끌어올리', '주도']) and \
       any(k in s for k in ['기업', '회사', '종목']):
        return ['eco', 'firm']

    # Rule 3: 산업/업종 + 전망/분석 + 투자 (산업 분석 + 투자 전략)
    if any(k in s for k in ['산업', '업종', '섹터', '분야']) and \
       any(k in s for k in ['전망', '분석', '트렌드', '성장']) and \
       any(k in s for k in ['투자', '방법', '전략']):
        return ['eco', 'firm', 'house']

    # Rule 4: 거시경제 + 시장 영향 (금리, 정책 등이 시장에 미치는 영향 - ECO만)
    if any(k in s for k in ['금리', '환율', '정책', '경기', '물가']) and \
       any(k in s for k in ['주식', '시장', '증시', '코스피']) and \
       any(k in s for k in ['영향', '미치']):
        return ['eco']  # FIRM 제외 (거시 분석만 필요)

    # Rule 5: 포트폴리오/투자 전략 (거시 경제 이해 필요)
    if any(k in s for k in ['포트폴리오', '자산배분', '분산투자']) and \
       any(k in s for k in ['구성', '방법', '전략']):
        return ['eco', 'house']

    # Rule 6: 일반 투자 질문 (어떤 기업/어디에 투자)
    if any(k in s for k in ['어떤', '어디', '어느']) and \
       any(k in s for k in ['기업', '회사', '종목']) and \
       any(k in s for k in ['투자', '좋을', '추천']):
        return ['eco', 'firm', 'house']

    # Rule 7: GDP 개념
    if 'gdp' in s or ('국내' in s and '총생산' in s):
        return ['eco']

    # Rule 8: 특정 기업 + 순수 분석 (실적, 전망, 분석) - FIRM only
    firms = ['삼성', '하이닉스', 'sk', 'lg', '현대', '네이버', '카카오', '포스코', '엔비디아', '테슬라', '애플', 'apple', '마이크로소프트']
    has_firm = any(f in s for f in firms)
    has_analysis = any(k in s for k in ['실적', '전망', '분석', '재무', '매출', '영업이익'])
    has_invest_decision = any(k in s for k in ['투자', '방법', '전략', '추천', '좋을'])

    if has_firm and has_analysis and not has_invest_decision:
        return ['firm']

    # Rule 9: 특정 기업 + 투자 결정
    has_invest = any(k in s for k in ['투자', '포트폴리오', '리밸런싱', '매수', '매도', '분산투자', '자산배분', '전략'])
    if has_firm and has_invest:
        return ['firm', 'house']

    # Rule 10: 특정 기업만
    has_macro = any(k in s for k in ['gdp', '국내총생산', '금리', '환율', '정책', '경기', '경제', '물가', '부동산'])
    if has_firm and not has_invest and not has_macro:
        return ['firm']

    # Rule 11: 가계 재무 키워드
    house_keywords = ['대출', '적금', '예금', '보험', '연금', '세금', '저축', '카드', '신용']
    if any(k in s for k in house_keywords):
        return ['house']

    # Rule 12: 거시경제 키워드
    eco_keywords = ['경기', '성장률', '물가', '금리', '환율', '실업', '인플레이션', '디플레이션']
    if any(k in s for k in eco_keywords):
        return ['eco']

    # Default: all experts
    return ['eco', 'firm', 'house']


def main():
    print("=" * 80)
    print("Standalone Router Logic Test")
    print("=" * 80)

    # Load test questions
    with open("test_router_questions.json", "r", encoding="utf-8") as f:
        test_cases = json.load(f)

    results = []
    correct_count = 0

    for i, test in enumerate(test_cases, 1):
        question = test['question']
        expected = set(test['expected'])

        # Test router logic
        actual_roles = test_router_logic(question)
        actual = set(actual_roles)

        correct = expected == actual
        missing = expected - actual
        extra = actual - expected

        print(f"\n[{i}/{len(test_cases)}] {question}")
        print(f"Expected: {sorted(expected)}")
        print(f"Actual:   {sorted(actual)}")

        if correct:
            print("✅ CORRECT")
            correct_count += 1
        else:
            print("❌ INCORRECT")
            if missing:
                print(f"   Missing: {sorted(missing)}")
            if extra:
                print(f"   Extra: {sorted(extra)}")

        results.append({
            "test": test,
            "actual": sorted(actual_roles),
            "correct": correct,
            "missing": sorted(missing),
            "extra": sorted(extra),
        })

    # Summary
    accuracy = correct_count / len(test_cases) * 100
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total tests: {len(test_cases)}")
    print(f"Correct: {correct_count}")
    print(f"Incorrect: {len(test_cases) - correct_count}")
    print(f"Accuracy: {accuracy:.1f}%")

    # Save results
    with open("router_logic_test_results.json", "w", encoding="utf-8") as f:
        json.dump({
            "summary": {
                "total": len(test_cases),
                "correct": correct_count,
                "accuracy": accuracy / 100
            },
            "results": results
        }, f, ensure_ascii=False, indent=2)

    print("\nResults saved to: router_logic_test_results.json")
    return accuracy


if __name__ == "__main__":
    accuracy = main()
    exit(0 if accuracy >= 80 else 1)
