
## RAG 테스트 실행 가이드

### 1. 사전 준비

1. 프로젝트 루트(예: `C:\Users\...\새 폴더`)에서 가상환경이 이미 구성되어 있다는 가정 하에, 먼저 인덱스를 재생성합니다.
   ```powershell
   .\RAG\.venv\Scripts\python.exe -m RAG.ingest --input RAG\data
   ```
   > 임베더나 환경 변수를 바꿨다면 반드시 재인덱싱을 수행해야 합니다.

2. 테스트 스크립트는 `RAG/tests/run_tests.py`입니다. 기본 입력 JSON은 `RAG/tests/queries.json`이고, 결과는 `RAG/reports/query_results.json`과 `RAG/reports/report.md`로 저장됩니다.

### 2. 기본 테스트 실행

```powershell
cd "C:\Users\...\새 폴더"
.\RAG\.venv\Scripts\Activate.ps1   # 필요 시 가상환경 활성화
python RAG/tests/run_tests.py
```

위 명령은 `queries.json`에 포함된 10개 질의를 사용해 파이프라인을 실행하고, 결과 JSON/리포트를 갱신합니다.

### 3. 사용자 지정 질의로 실행

다른 질의 세트를 사용하려면 JSON 파일을 작성한 뒤 `--input` 옵션으로 전달합니다. 구조는 다음과 같습니다.

```json
{
  "queries": [
    "첫 번째 질문",
    "두 번째 질문"
  ]
}
```

또는 `[{"query": "..."}, ...]` 형태의 배열도 허용됩니다.

실행 예시:

```powershell
python RAG/tests/run_tests.py `
  --input C:\path\to\my_queries.json `
  --json-output C:\path\to\custom_results.json `
  --report-output C:\path\to\custom_report.md `
  --top-k 5
```

- `--json-output`, `--report-output`: 결과 저장 경로 지정(생략 시 기본값 사용).
- `--top-k`: 질의당 검색할 컨텍스트 수(기본 3).
- `--use-llm`: LLM 요약 사용(사전 환경변수 `OPENAI_API_KEY` 필요).

### 4. 결과 확인

- `query_results.json`: 각 질의에 대한 원문 응답과 컨텍스트 메타데이터를 JSON 형태로 제공합니다.
- `report.md`: 데이터 커버리지 및 질의별 상위 컨텍스트를 보기 좋게 정리한 Markdown 리포트입니다.

추가로, 개별 질의를 즉시 확인하려면 CLI를 사용할 수 있습니다.

```powershell
python -m RAG.cli_query --question "카카오 회사 요약" --top-k 3
```

LLM 요약을 사용하려면 `--use-llm` 옵션을 추가하고 OpenAI 키를 설정해 주세요.
