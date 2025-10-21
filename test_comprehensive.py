#!/usr/bin/env python3
"""
Comprehensive System Test
Tests all modes, roles, router accuracy, RAG quality
"""

import json
import requests
import time
from typing import List, Dict, Any
from datetime import datetime

BACKEND_URL = "http://localhost:3001"

# Test cases covering all role combinations
TEST_CASES = [
    # Single expert tests
    {
        "id": 1,
        "question": "GDP가 뭐야?",
        "expected_roles": ["eco"],
        "category": "ECO only - definition",
        "check_rag": True,
        "test_modes": ["sequential", "parallel"]
    },
    {
        "id": 2,
        "question": "삼성전자 실적 어때?",
        "expected_roles": ["firm"],
        "category": "FIRM only - company performance",
        "check_rag": True,
        "test_modes": ["sequential", "parallel"]
    },
    {
        "id": 3,
        "question": "대출받을 때 주의사항",
        "expected_roles": ["house"],
        "category": "HOUSE only - personal finance",
        "check_rag": True,
        "test_modes": ["sequential", "parallel"]
    },

    # Two expert tests
    {
        "id": 4,
        "question": "삼성전자 3분기 실적이 코스피에 미치는 영향은?",
        "expected_roles": ["eco", "firm"],
        "category": "ECO+FIRM - company impact on market",
        "check_rag": True,
        "test_modes": ["sequential", "parallel"]
    },
    {
        "id": 5,
        "question": "포트폴리오 어떻게 구성해야 해?",
        "expected_roles": ["eco", "house"],
        "category": "ECO+HOUSE - investment strategy",
        "check_rag": True,
        "test_modes": ["sequential"]
    },

    # Three expert tests
    {
        "id": 6,
        "question": "어떤 기업에 투자하면 좋을까?",
        "expected_roles": ["eco", "firm", "house"],
        "category": "ECO+FIRM+HOUSE - investment recommendation",
        "check_rag": True,
        "test_modes": ["sequential"]
    },
    {
        "id": 7,
        "question": "반도체 산업 전망과 투자 방법",
        "expected_roles": ["eco", "firm", "house"],
        "category": "ECO+FIRM+HOUSE - sector analysis + investment",
        "check_rag": True,
        "test_modes": ["sequential"]
    },
]

def test_query(question: str, mode: str = "sequential", timeout: int = 120) -> Dict[str, Any]:
    """Send question to backend and get full response"""
    try:
        response = requests.post(
            f"{BACKEND_URL}/ask",
            json={"q": question, "mode": mode},
            timeout=timeout
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def analyze_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze response quality"""
    if "error" in data:
        return {"error": data["error"]}

    analysis = {
        "roles": data.get("meta", {}).get("roles", []),
        "router_source": data.get("meta", {}).get("router_source", "unknown"),
        "router_confidence": data.get("meta", {}).get("router_confidence", 0.0),
        "mode": data.get("meta", {}).get("mode", "unknown"),
        "cards_count": len(data.get("cards", [])),
        "cards": [],
        "issues": [],
        "rag_sources": []
    }

    for card in data.get("cards", []):
        card_info = {
            "type": card.get("type"),
            "title": card.get("title", "")[:50],
            "content_length": len(card.get("content", "")),
            "has_think_tags": "<think>" in card.get("content", "") or "</think>" in card.get("content", ""),
            "sources": card.get("sources", [])
        }

        # Check for issues
        if card_info["has_think_tags"]:
            analysis["issues"].append(f"{card['type']} card contains <think> tags")

        # Extract RAG sources from content
        content = card.get("content", "")
        if "RAG#" in content:
            # Extract all RAG references
            import re
            rag_refs = re.findall(r'\(RAG#\d+[^\)]+\)', content)
            for ref in rag_refs:
                analysis["rag_sources"].append({
                    "card_type": card.get("type"),
                    "reference": ref
                })

        analysis["cards"].append(card_info)

    # Check for duplicate combined cards
    combined_count = sum(1 for c in analysis["cards"] if c["type"] == "combined")
    if combined_count > 1:
        analysis["issues"].append(f"Multiple combined cards detected ({combined_count})")

    return analysis

def compare_roles(expected: List[str], actual: List[str]) -> Dict[str, Any]:
    """Compare expected and actual roles"""
    expected_set = set(expected)
    actual_set = set(actual)

    return {
        "correct": expected_set == actual_set,
        "missing": list(expected_set - actual_set),
        "extra": list(actual_set - expected_set),
        "accuracy": 1.0 if expected_set == actual_set else 0.0
    }

def main():
    print("=" * 100)
    print("COMPREHENSIVE SYSTEM TEST")
    print("=" * 100)
    print(f"Test started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    all_results = []
    router_accuracy_total = 0
    router_accuracy_count = 0

    for test_case in TEST_CASES:
        print(f"\n{'=' * 100}")
        print(f"[Test {test_case['id']}] {test_case['question']}")
        print(f"Category: {test_case['category']}")
        print(f"Expected roles: {test_case['expected_roles']}")
        print(f"Testing modes: {test_case['test_modes']}")
        print('=' * 100)

        test_results = {
            "test_case": test_case,
            "mode_results": {}
        }

        for mode in test_case["test_modes"]:
            print(f"\n  Testing mode: {mode}")
            print(f"  {'─' * 90}")

            # Execute test
            data = test_query(test_case["question"], mode)

            if "error" in data:
                print(f"  ❌ Error: {data['error']}")
                test_results["mode_results"][mode] = {"error": data["error"]}
                continue

            # Analyze response
            analysis = analyze_response(data)

            # Check router accuracy
            router_comparison = compare_roles(test_case["expected_roles"], analysis["roles"])
            router_accuracy_total += router_comparison["accuracy"]
            router_accuracy_count += 1

            # Display results
            print(f"  Router: {analysis['router_source']} (confidence: {analysis['router_confidence']:.2f})")
            print(f"  Actual roles: {analysis['roles']}")

            if router_comparison["correct"]:
                print(f"  ✅ Router CORRECT")
            else:
                print(f"  ❌ Router INCORRECT")
                if router_comparison["missing"]:
                    print(f"     Missing: {router_comparison['missing']}")
                if router_comparison["extra"]:
                    print(f"     Extra: {router_comparison['extra']}")

            print(f"  Cards: {analysis['cards_count']} total")
            for i, card in enumerate(analysis['cards'], 1):
                status = "⚠️" if card["has_think_tags"] else "✓"
                print(f"    {status} Card {i} ({card['type']}): {card['title']}")
                print(f"       Length: {card['content_length']} chars")

            # RAG sources
            if test_case.get("check_rag") and analysis["rag_sources"]:
                print(f"  RAG Sources: {len(analysis['rag_sources'])} found")
                for src in analysis["rag_sources"][:3]:  # Show first 3
                    print(f"    - {src['card_type']}: {src['reference'][:80]}...")

            # Issues
            if analysis["issues"]:
                print(f"  ⚠️  Issues detected:")
                for issue in analysis["issues"]:
                    print(f"    - {issue}")

            test_results["mode_results"][mode] = {
                "analysis": analysis,
                "router_comparison": router_comparison
            }

            # Wait between tests
            time.sleep(2)

        all_results.append(test_results)

    # Summary
    print("\n" + "=" * 100)
    print("SUMMARY")
    print("=" * 100)

    overall_router_accuracy = (router_accuracy_total / router_accuracy_count * 100) if router_accuracy_count > 0 else 0
    print(f"Overall Router Accuracy: {overall_router_accuracy:.1f}% ({int(router_accuracy_total)}/{router_accuracy_count})")

    # Count issues by type
    total_think_tag_issues = 0
    total_duplicate_combined = 0

    for result in all_results:
        for mode, mode_result in result["mode_results"].items():
            if "analysis" in mode_result:
                for issue in mode_result["analysis"].get("issues", []):
                    if "think" in issue.lower():
                        total_think_tag_issues += 1
                    if "combined" in issue.lower():
                        total_duplicate_combined += 1

    print(f"\nIssues Found:")
    print(f"  - <think> tags: {total_think_tag_issues}")
    print(f"  - Duplicate combined cards: {total_duplicate_combined}")

    # Save results
    output = {
        "test_date": datetime.now().isoformat(),
        "summary": {
            "total_tests": len(all_results),
            "total_mode_tests": router_accuracy_count,
            "router_accuracy": router_accuracy_total / router_accuracy_count if router_accuracy_count > 0 else 0,
            "think_tag_issues": total_think_tag_issues,
            "duplicate_combined_issues": total_duplicate_combined
        },
        "results": all_results
    }

    with open("comprehensive_test_results.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Results saved to: comprehensive_test_results.json")
    print(f"Test completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()
