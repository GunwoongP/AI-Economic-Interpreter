#!/usr/bin/env python3
"""
Sequential Summary Feature Test & Benchmark
Tests the new embedded summary feature and compares performance
"""

import json
import requests
import time
from datetime import datetime

BACKEND_URL = "http://localhost:3001"

TEST_CASES = [
    {
        "id": 1,
        "question": "GDP가 뭐야?",
        "expected_roles": ["eco"],
        "category": "ECO only"
    },
    {
        "id": 2,
        "question": "삼성전자 3분기 실적이 코스피에 미치는 영향은?",
        "expected_roles": ["eco", "firm"],
        "category": "ECO+FIRM sequential"
    },
    {
        "id": 3,
        "question": "반도체 산업 전망과 투자 방법",
        "expected_roles": ["eco", "firm", "house"],
        "category": "3-expert sequential"
    },
]

def test_query(question: str, mode: str = "sequential", timeout: int = 120):
    """Send question and measure response time"""
    try:
        start_time = time.time()
        response = requests.post(
            f"{BACKEND_URL}/ask",
            json={"q": question, "mode": mode},
            timeout=timeout
        )
        response.raise_for_status()
        elapsed_time = time.time() - start_time
        data = response.json()
        data['_elapsed_time'] = elapsed_time
        return data
    except Exception as e:
        return {"error": str(e)}

def check_embedded_summary(card):
    """Check if card contains embedded summary marker"""
    content = card.get("content", "")
    has_marker = "--- 다음 전문가를 위한 요약 ---" in content

    if has_marker:
        parts = content.split("--- 다음 전문가를 위한 요약 ---")
        if len(parts) > 1:
            summary = parts[1].strip()
            summary_lines = [l for l in summary.split('\n') if l.strip()]
            return {
                "has_marker": True,
                "summary_lines": len(summary_lines),
                "summary_preview": summary[:150] if summary else ""
            }

    return {"has_marker": False}

def main():
    print("=" * 100)
    print("SEQUENTIAL SUMMARY FEATURE TEST & BENCHMARK")
    print("=" * 100)
    print(f"Test started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    results = []

    for test_case in TEST_CASES:
        print(f"\n{'='* 100}")
        print(f"[Test {test_case['id']}] {test_case['question']}")
        print(f"Category: {test_case['category']}")
        print(f"Expected roles: {test_case['expected_roles']}")
        print('=' * 100)

        # Test Sequential mode
        print("\n  Testing SEQUENTIAL mode...")
        seq_data = test_query(test_case['question'], mode='sequential')

        if "error" in seq_data:
            print(f"  ❌ Error: {seq_data['error']}")
            continue

        seq_time = seq_data.get('_elapsed_time', 0)
        seq_roles = seq_data.get('meta', {}).get('roles', [])
        seq_cards = seq_data.get('cards', [])

        print(f"  Response time: {seq_time:.2f}s")
        print(f"  Actual roles: {seq_roles}")
        print(f"  Cards: {len(seq_cards)}")

        # Check for embedded summaries in each expert card
        expert_summaries = []
        for i, card in enumerate(seq_cards, 1):
            card_type = card.get('type')
            title = card.get('title', '')[:50]
            summary_info = check_embedded_summary(card)

            print(f"\n    Card {i} ({card_type}): {title}")
            print(f"      Content length: {len(card.get('content', ''))} chars")

            if summary_info['has_marker']:
                print(f"      ✅ Embedded summary: {summary_info['summary_lines']} lines")
                print(f"         Preview: {summary_info['summary_preview'][:80]}...")
                expert_summaries.append({
                    "card_type": card_type,
                    **summary_info
                })
            else:
                print(f"      ⚠️  No embedded summary marker")

        # Compare with Parallel mode (for performance benchmark)
        print("\n  Testing PARALLEL mode (for comparison)...")
        par_data = test_query(test_case['question'], mode='parallel')

        if "error" not in par_data:
            par_time = par_data.get('_elapsed_time', 0)
            print(f"  Response time: {par_time:.2f}s")

            # Calculate performance difference
            time_diff = seq_time - par_time
            time_diff_pct = (time_diff / par_time * 100) if par_time > 0 else 0
            print(f"\n  Performance comparison:")
            print(f"    Sequential: {seq_time:.2f}s")
            print(f"    Parallel:   {par_time:.2f}s")
            print(f"    Difference: {time_diff:+.2f}s ({time_diff_pct:+.1f}%)")

        results.append({
            "test_case": test_case,
            "sequential": {
                "time": seq_time,
                "roles": seq_roles,
                "cards_count": len(seq_cards),
                "embedded_summaries": expert_summaries
            },
            "parallel": {
                "time": par_data.get('_elapsed_time', 0) if "error" not in par_data else None
            }
        })

        time.sleep(2)  # Wait between tests

    # Summary
    print("\n" + "=" * 100)
    print("SUMMARY")
    print("=" * 100)

    total_summaries = sum(len(r['sequential']['embedded_summaries']) for r in results)
    total_cards = sum(r['sequential']['cards_count'] for r in results)
    avg_seq_time = sum(r['sequential']['time'] for r in results) / len(results)
    avg_par_time = sum(r['parallel']['time'] for r in results if r['parallel']['time']) / len([r for r in results if r['parallel']['time']]) if results else 0

    print(f"\nTotal tests: {len(results)}")
    print(f"Total cards generated: {total_cards}")
    print(f"Cards with embedded summaries: {total_summaries}")
    print(f"Summary coverage: {total_summaries}/{total_cards} ({total_summaries/total_cards*100:.1f}%)")

    print(f"\nPerformance:")
    print(f"  Avg Sequential time: {avg_seq_time:.2f}s")
    print(f"  Avg Parallel time:   {avg_par_time:.2f}s")
    if avg_par_time > 0:
        overhead = avg_seq_time - avg_par_time
        overhead_pct = (overhead / avg_par_time * 100)
        print(f"  Sequential overhead: {overhead:+.2f}s ({overhead_pct:+.1f}%)")

    # Save results
    output = {
        "test_date": datetime.now().isoformat(),
        "summary": {
            "total_tests": len(results),
            "total_cards": total_cards,
            "cards_with_summaries": total_summaries,
            "summary_coverage": total_summaries/total_cards if total_cards > 0 else 0,
            "avg_sequential_time": avg_seq_time,
            "avg_parallel_time": avg_par_time
        },
        "results": results
    }

    with open("sequential_summary_test_results.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Results saved to: sequential_summary_test_results.json")
    print(f"Test completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()
