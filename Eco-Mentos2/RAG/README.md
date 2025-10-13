# RAG Minimal Usage Guide

이 디렉터리는 원본 프로젝트에서 RAG 핵심 구성만 추려 놓은 경량 버전입니다. 아래 단계에 따라 독립적으로 인덱싱하고 질의할 수 있습니다.

## 1. 의존성 설치

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r rag_minimal\requirements.txt
```

## 2. 환경 변수 설정

`rag_minimal`만 사용할 때는 벡터 인덱스를 별도 경로에 저장하는 것이 좋습니다. 가장 간단한 방법은 명령 실행 전에 `DATA_DIR` 환경 변수를 설정하는 것입니다.

### PowerShell (Windows)
```powershell
$env:DATA_DIR = 'rag_minimal/index'
```

### (선택 사항) `.env` 파일로 고정

저장소 루트에 `.env` 파일을 만들고 아래 내용을 추가하면 매번 환경 변수를 설정할 필요가 없습니다.

```
DATA_DIR=rag_minimal/index
INDEX_NAME=default
EMBEDDER=tfidf
```

> `EMBEDDER=tfidf`를 지정하면 `sentence-transformers` 모델을 추가로 내려받지 않고도 동작합니다.

## 3. 인덱싱

`rag_minimal/data`에 원본 JSON 자료가 복사되어 있습니다. 예시로 `bok_terms_full.jsonl`을 인덱싱하려면 다음을 실행합니다.

```powershell
python -m rag_minimal.ingest --input rag_minimal\data\bok_terms_full.jsonl
```

성공 시 `rag_minimal/index`(또는 `DATA_DIR` 지정 경로)에 `default.vectors.npy`, `default.metas.jsonl`, `default.tfidf.pkl`이 생성됩니다.

## 4. CLI 질의

```powershell
python -m rag_minimal.cli_query --question "세계은행의 역할은?" --top-k 3
```

- `--use-llm` 옵션을 주면 OpenAI API 키가 설정돼 있을 때만 LLM 후처리를 수행합니다.
- 반환되는 컨텍스트에는 각 데이터셋의 메타 정보가 포함되어 있어 원문 위치를 쉽게 확인할 수 있습니다.

## 5. 인덱스 초기화 / 재구성

테스트 후 인덱스를 새로 만들고 싶다면 벡터/메타 파일을 삭제한 뒤 다시 인덱싱합니다.

```powershell
Remove-Item rag_minimal\index\default.*
python -m rag_minimal.ingest --input rag_minimal\data\bok_terms_full.jsonl
```

## 6. 추가 팁

- 더 많은 JSON을 포함하고 싶다면 `rag_minimal/data`에 파일을 추가한 뒤 같은 명령으로 인덱싱하면 됩니다.
- OpenAI 기반 LLM 응답이 필요 없는 경우 `requirements.txt`에는 포함되어 있지 않으므로 별도 설치 없이도 동작합니다.
- FastAPI 등의 서버 코드는 포함되어 있지 않으므로 RAG CLI만 실행됩니다.

이 과정을 통해 현재 환경에서 `rag_minimal` 모듈만으로도 인덱싱과 질의가 정상 동작함을 확인할 수 있습니다.
