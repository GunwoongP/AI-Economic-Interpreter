#!/usr/bin/env python3
"""
Router Accuracy Test Script
Tests router with various question types and compares with expected roles
"""

import json
import requests
import time
from typing import List, Dict

BACKEND_URL = "http://localhost:3001"

def test_router(question: str) -> Dict:
    """Send question to backend and get router result"""
    try:
        response = requests.post(
            f"{BACKEND_URL}/ask",
            json={"q": question, "mode": "sequential"},
            timeout=60
        )
        response.raise_for_status()
        data = response.json()
        return {
            "roles": data.get("meta", {}).get("roles", []),
            "router_source": data.get("meta", {}).get("router_source", "unknown"),
            "confidence": data.get("meta", {}).get("router_confidence", 0.0),
            "cards_count": len(data.get("cards", [])),
            "cards": [{"type": c["type"], "title": c.get("title", "")[:50]} for c in data.get("cards", [])]
        }
    except Exception as e:
        return {"error": str(e)}

def compare_roles(expected: List[str], actual: List[str]) -> Dict:
    """Compare expected and actual roles"""
    expected_set = set(expected)
    actual_set = set(actual)

    correct = expected_set == actual_set
    missing = expected_set - actual_set
    extra = actual_set - expected_set

    return {
        "correct": correct,
        "missing": list(missing),
        "extra": list(extra),
        "accuracy": 1.0 if correct else 0.0
    }

def main():
    print("=" * 80)
    print("Router Accuracy Test")
    print("=" * 80)

    # Load test questions
    with open("test_router_questions.json", "r", encoding="utf-8") as f:
        test_cases = json.load(f)

    results = []
    total_accuracy = 0

    for i, test in enumerate(test_cases, 1):
        print(f"\n[{i}/{len(test_cases)}] Testing: {test['question']}")
        print(f"Expected roles: {test['expected']}")
        print(f"Category: {test['category']}")

        # Test router
        result = test_router(test['question'])

        if "error" in result:
            print(f"❌ Error: {result['error']}")
            continue

        actual_roles = result['roles']
        print(f"Actual roles:   {actual_roles}")
        print(f"Router source:  {result['router_source']}")
        print(f"Confidence:     {result['confidence']:.2f}")
        print(f"Cards count:    {result['cards_count']}")

        # Compare
        comparison = compare_roles(test['expected'], actual_roles)

        if comparison['correct']:
            print("✅ CORRECT")
        else:
            print("❌ INCORRECT")
            if comparison['missing']:
                print(f"   Missing: {comparison['missing']}")
            if comparison['extra']:
                print(f"   Extra: {comparison['extra']}")

        # Show cards
        for j, card in enumerate(result['cards'], 1):
            print(f"   Card {j} ({card['type']}): {card['title']}")

        results.append({
            "test": test,
            "result": result,
            "comparison": comparison
        })

        total_accuracy += comparison['accuracy']

        # Wait between requests
        time.sleep(2)

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total tests: {len(test_cases)}")
    print(f"Correct: {int(total_accuracy)}")
    print(f"Incorrect: {len(test_cases) - int(total_accuracy)}")
    print(f"Accuracy: {total_accuracy / len(test_cases) * 100:.1f}%")

    # Save detailed results
    with open("router_test_results.json", "w", encoding="utf-8") as f:
        json.dump({
            "summary": {
                "total": len(test_cases),
                "correct": int(total_accuracy),
                "accuracy": total_accuracy / len(test_cases)
            },
            "results": results
        }, f, ensure_ascii=False, indent=2)

    print("\nDetailed results saved to: router_test_results.json")

if __name__ == "__main__":
    main()
