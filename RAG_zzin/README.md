# RAG 데이터 파이프라인 안내

이 저장소는 경량화된 RAG 파이프라인을 제공하며, JSON/JSONL 데이터셋을 벡터화하여 FAISS 인덱스에 저장하고 CLI로 질의할 수 있도록 구성돼 있습니다. 아래 절차에 따라 환경을 준비하고 인덱스를 구축한 뒤 질의를 실행하세요.

## 1. 실행 환경 준비

```powershell
python -m venv RAG\.venv
RAG\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r RAG\requirements.txt
```

> Linux/macOS에서는 `source RAG/.venv/bin/activate` 로 가상환경을 활성화한 뒤 `pip install -r RAG/requirements.txt`를 실행하면 됩니다.

기본 임베더는 TF‑IDF입니다. SentenceTransformer 계열 모델을 사용하려면 `pip install sentence-transformers` 후 `.env` 또는 환경 변수에서 `EMBEDDER=sentence-transformers`, `EMBEDDER_MODEL=<모델명>`을 설정하고 인덱스를 다시 빌드하세요.

## 2. 데이터 구성

RAG 파이프라인은 `RAG/data` 디렉터리의 JSON/JSONL 파일을 자동으로 스키마 감지하여 인덱싱합니다. 새 파일을 추가했다면 같은 디렉터리에 복사하거나 심볼릭 링크를 걸어 둡니다.

예시:
```
RAG/data/
 ├─ chunks_flat.jsonl
 ├─ bok_terms_full.jsonl
 └─ ...
```

## 3. 인덱스 재구축

프로젝트 루트(`새 폴더`)에서 다음 명령을 실행하면 `.venv` 환경을 이용해 전체 인덱스를 새로 작성합니다.

```powershell
.\RAG\.venv\Scripts\python.exe -m RAG.ingest --input RAG\data
```

기본 설정은 TF-IDF + FAISS IVF4096 인덱스를 사용하며, 결과 파일은 `RAG/data/index` 아래에 저장됩니다.

### FAISS + HNSW 인덱싱 (선택)

고속 근사 탐색을 위해 HNSW 기반 인덱스를 사용하고 싶다면 다음 환경 변수를 지정한 뒤 인덱스를 다시 빌드하세요.

```powershell
$env:VECTORSTORE_INDEX_SPEC = 'HNSW32'
.\RAG\.venv\Scripts\python.exe -m RAG.ingest --input RAG\data
```

추가 옵션:
- `VECTORSTORE_INDEX_SPEC`: FAISS 인덱스 구성. 예) `HNSW32`, `HNSW64`  
- `VECTORSTORE_NPROBE`: 검색 시 탐색할 이웃 수(기본 8). HNSW에서는 무시됩니다.  

다른 OS에서도 동일하게 환경 변수를 설정한 뒤 명령을 실행하면 됩니다.

## 4. CLI 질의 실행

가상환경이 활성화된 상태에서 원하는 질문을 전달하면 상위 k개의 컨텍스트와 요약본을 확인할 수 있습니다.

```powershell
python -m RAG.cli_query --question "카카오 회사 요약" --top-k 3
```

- `--top-k`: 검색할 문서 수 (기본 5)  
- `--use-llm`: OpenAI API 키가 `.env` 등의 방식으로 설정되어 있다면 LLM 요약을 사용합니다.

## 5. 보고서/벤치마크 생성

여러 질의를 한 번에 실행하려면 아래와 같이 간단한 스크립트를 작성해 활용할 수 있습니다.

```python
# run_benchmark.py 예시
from pathlib import Path
import json
from RAG import RAGPipeline

queries = [
    "GDP의 정의는?",
    "카카오 회사 요약",
    # ...
]

pipeline = RAGPipeline()
results = []
for idx, question in enumerate(queries, start=1):
    answer, contexts = pipeline.answer_query(question, top_k=3, use_llm=False)
    results.append({"id": idx, "query": question, "answer": answer, "contexts": contexts})

Path("RAG/reports/query_results.json").write_text(
    json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
)
```

```powershell
python run_benchmark.py
```

필요에 따라 컨텍스트를 정제하고 `RAG/reports/report.md`에 요약을 병행하면 테스트 결과를 한눈에 확인할 수 있습니다.

## 6. 팁 및 주의사항

- `RAG.setup_and_ingest.ps1` 또는 `RAG/setup_and_ingest.sh`를 프로젝트 루트에서 실행하면 (가상환경 설치 → 패키지 설치 → 인덱스 빌드)까지 자동화할 수 있습니다.  
- `chunks_flat.jsonl`처럼 대량 데이터를 추가한 경우, 중복 컨텍스트가 요약에 올라오지 않도록 파이프라인이 chunk ID 기준으로 필터링합니다.  
- 추가적인 성능 조정(예: SentenceTransformer 사용)을 원한다면 `RAG/config.py`에서 `EMBEDDER`, `EMBEDDER_MODEL` 등을 수정한 뒤 인덱스를 다시 빌드하세요.

필요 시 `.venv` 활성화 후 CLI로 바로 검증하면서 튜닝하면 됩니다. 문제가 발생하면 `RAG/data/index`를 비우고 다시 인덱싱을 수행하세요.
