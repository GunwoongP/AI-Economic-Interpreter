# RAG Vector Store 비교: FAISS vs MongoDB (Vector DB)

## 📊 현재 구현 상태

### Current Implementation: **In-Memory Token Search**

**파일**: `backend/src/ai/rag.ts`

**방식**:
- JSON/JSONL 파일에서 문서 로드 → 메모리에 저장
- 한글 토큰화 (공백/특수문자 제거, Stopwords 필터링)
- TF 기반 스코어링 (단순 토큰 매칭 카운트)
- 실시간 선형 탐색 (모든 문서 순회)

**장점**:
- ✅ 구현 간단 (외부 의존성 없음)
- ✅ 배포 쉬움 (추가 서버 불필요)
- ✅ 디버깅 용이

**단점**:
- ❌ **의미 검색 불가** (semantic similarity 없음)
- ❌ **확장성 제한** (문서 1만 개 이상 시 느려짐)
- ❌ **메모리 사용량 높음** (모든 문서를 RAM에 적재)
- ❌ **정확도 낮음** (동의어/유사 표현 매칭 불가)

**현재 데이터셋 규모**:
```typescript
// RAG_zzin/data 폴더 기준
- events_catalog_v2.json: ~100 events
- bok_terms_full.jsonl: ~500 terms
- chunks_flat.jsonl: ~5,000 chunks
- wisereport_all.json: ~2,000 reports
// 총 ~8,000 documents
```

---

## 🔥 Option 1: FAISS (Facebook AI Similarity Search)

### 개요
- **Meta(Facebook)이 개발한 오픈소스 벡터 검색 라이브러리**
- CPU/GPU 가속 지원
- 로컬 파일 시스템 기반 인덱스 저장

### 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Node.js/TypeScript)              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   ask.ts     │────────▶│  rag_faiss.ts│                 │
│  └──────────────┘         └──────┬───────┘                 │
│                                   │ HTTP/gRPC               │
└───────────────────────────────────┼─────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────┐
│              FAISS Server (Python FastAPI)                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  main_faiss.py                                      │   │
│  │  - Sentence Transformers (embedding model)          │   │
│  │  - FAISS Index (IVF, HNSW, Flat)                    │   │
│  │  - Load/Save index from disk                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              File System (Local/NFS)                        │
│  - faiss_index_eco.bin                                      │
│  - faiss_index_firm.bin                                     │
│  - faiss_index_house.bin                                    │
│  - metadata_eco.json (id, title, source, date)             │
└─────────────────────────────────────────────────────────────┘
```

### 구현 예시

**1. FAISS Server (Python)**
```python
# ai/main_faiss.py
from fastapi import FastAPI
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
import json

app = FastAPI()

# Embedding model (한국어 지원)
model = SentenceTransformer('jhgan/ko-sroberta-multitask')
# 또는: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'

# FAISS Index
index_eco = faiss.read_index('data/faiss_index_eco.bin')
index_firm = faiss.read_index('data/faiss_index_firm.bin')
index_house = faiss.read_index('data/faiss_index_house.bin')

# Metadata
with open('data/metadata_eco.json') as f:
    meta_eco = json.load(f)
# ... firm, house 동일

@app.post('/search')
async def search(query: str, roles: list[str], k: int = 3):
    # 1. Query embedding
    query_vec = model.encode([query])[0].astype('float32')

    # 2. FAISS search
    results = []
    for role in roles:
        if role == 'eco':
            D, I = index_eco.search(np.array([query_vec]), k)
        elif role == 'firm':
            D, I = index_firm.search(np.array([query_vec]), k)
        elif role == 'house':
            D, I = index_house.search(np.array([query_vec]), k)

        # 3. Metadata lookup
        for idx, dist in zip(I[0], D[0]):
            meta = meta_eco[idx] if role == 'eco' else ...
            results.append({
                'role': role,
                'text': meta['summary'],
                'meta': {
                    'id': meta['id'],
                    'title': meta['title'],
                    'source': meta['source'],
                    'date': meta['date'],
                },
                'sim': float(1 - dist / 2)  # cosine similarity
            })

    return results
```

**2. Backend Integration (TypeScript)**
```typescript
// backend/src/ai/rag_faiss.ts
export async function searchRAG(q: string, roles: RoleKey[], k = 3): Promise<Hit[]> {
  const response = await fetch('http://localhost:8004/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, roles, k })
  });

  const data = await response.json();
  return data.map((hit: any) => ({
    ns: ROLE_TO_NS[hit.role],
    text: hit.text,
    meta: hit.meta,
    sim: hit.sim,
  }));
}
```

**3. Index 생성 스크립트**
```python
# scripts/build_faiss_index.py
from sentence_transformers import SentenceTransformer
import faiss
import json

model = SentenceTransformer('jhgan/ko-sroberta-multitask')

# Load documents
with open('RAG_zzin/data/bok_terms_full.jsonl') as f:
    docs_eco = [json.loads(line) for line in f]

# Generate embeddings
texts = [f"{doc['title']} {doc['definition']}" for doc in docs_eco]
embeddings = model.encode(texts, show_progress_bar=True)

# Build FAISS index
dimension = embeddings.shape[1]  # 768 for sroberta
index = faiss.IndexFlatIP(dimension)  # Inner Product (cosine if normalized)
# 또는: index = faiss.IndexIVFFlat(quantizer, dimension, nlist=100)  # 더 빠름

faiss.normalize_L2(embeddings)  # Normalize for cosine similarity
index.add(embeddings)

# Save
faiss.write_index(index, 'data/faiss_index_eco.bin')

# Save metadata separately
metadata = [{'id': doc['id'], 'title': doc['title'], ...} for doc in docs_eco]
with open('data/metadata_eco.json', 'w') as f:
    json.dump(metadata, f, ensure_ascii=False)
```

### 장점 ✅

1. **의미 검색 가능**
   - "금리 인상" → "기준금리 상승", "통화긴축" 등 유사 표현 매칭
   - Sentence Transformers로 한국어 semantic embedding

2. **빠른 검색 속도**
   - HNSW/IVF 인덱스: O(log N) 탐색
   - 100만 문서에서도 밀리초 단위 응답

3. **낮은 메모리 사용**
   - 인덱스는 디스크에 저장
   - 검색 시에만 필요한 부분만 로드 (mmap 지원)

4. **GPU 가속 지원**
   - `faiss-gpu` 사용 시 대규모 검색 100배 이상 빠름

5. **오프라인 동작**
   - 외부 API/서버 불필요 (자체 호스팅)
   - 인터넷 연결 없이 동작

### 단점 ❌

1. **초기 인덱스 구축 시간**
   - 8,000 문서 × 768차원 embedding: ~5분 소요
   - 업데이트 시 재구축 필요 (incremental add는 가능하나 비효율적)

2. **Python 의존성**
   - Node.js에서 직접 사용 불가 → FastAPI 서버 필요
   - 배포 시 Python 환경 + FAISS 라이브러리 설치 필요

3. **메타데이터 관리**
   - FAISS는 벡터만 저장 → 별도 JSON으로 메타데이터 관리
   - 문서 업데이트 시 인덱스 + 메타데이터 동기화 필요

4. **필터링 제약**
   - 날짜 범위, 태그 필터링 등은 후처리로만 가능
   - FAISS 자체는 벡터 검색만 지원

5. **디버깅 어려움**
   - Binary 인덱스 파일 → 내부 상태 확인 어려움

### 적합한 경우

- ✅ **의미 검색이 중요한 경우** (예: "경기 침체" → "recession" 매칭)
- ✅ **문서 수가 1만 개 이상**
- ✅ **업데이트가 적은 경우** (일 1회 배치 업데이트)
- ✅ **오프라인 환경** (인터넷 연결 불필요)
- ✅ **GPU 가속 가능한 인프라**

---

## 🗄️ Option 2: MongoDB Atlas Vector Search (또는 Qdrant, Milvus)

### 개요
- **MongoDB Atlas의 벡터 검색 기능** (2023년 정식 출시)
- 또는 전용 VDB: Qdrant, Milvus, Weaviate, Pinecone

### 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Node.js/TypeScript)              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   ask.ts     │────────▶│  rag_mongo.ts│                 │
│  └──────────────┘         └──────┬───────┘                 │
│                                   │ MongoDB Driver          │
└───────────────────────────────────┼─────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────┐
│              MongoDB Atlas (Cloud/Self-hosted)              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Collections:                                       │   │
│  │  - rag_eco_docs                                     │   │
│  │    { id, title, summary, embedding: [768 floats],  │   │
│  │      source, date, tags, role: "eco" }             │   │
│  │  - rag_firm_docs                                    │   │
│  │  - rag_house_docs                                   │   │
│  │                                                      │   │
│  │  Vector Index:                                      │   │
│  │  - Atlas Vector Search (HNSW)                       │   │
│  │  - Filter: { role: "eco", date: {$gte: "2024-01"} }│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 구현 예시

**1. MongoDB Schema**
```typescript
// backend/src/ai/rag_mongo_schema.ts
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI!);
const db = client.db('economy_mentor');
const collection = db.collection('rag_docs');

// Document schema
interface RagDoc {
  _id: string;
  role: 'eco' | 'firm' | 'house';
  title: string;
  summary: string;
  embedding: number[];  // 768-dim vector
  source?: string;
  date?: string;
  tags: string[];
  created_at: Date;
}

// Vector search index (Atlas UI에서 생성)
// {
//   "mappings": {
//     "dynamic": true,
//     "fields": {
//       "embedding": {
//         "type": "knnVector",
//         "dimensions": 768,
//         "similarity": "cosine"
//       },
//       "role": { "type": "token" },
//       "date": { "type": "date" }
//     }
//   }
// }
```

**2. Backend Integration**
```typescript
// backend/src/ai/rag_mongo.ts
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI!);
const collection = client.db('economy_mentor').collection('rag_docs');

// Embedding API (OpenAI, Cohere, 또는 로컬 FastAPI)
async function embed(text: string): Promise<number[]> {
  const response = await fetch('http://localhost:8004/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const data = await response.json();
  return data.embedding;
}

export async function searchRAG(q: string, roles: RoleKey[], k = 3): Promise<Hit[]> {
  const queryEmbedding = await embed(q);

  const pipeline = [
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: k * 10,
        limit: k,
        filter: {
          role: { $in: roles }  // 역할 필터링
        }
      }
    },
    {
      $project: {
        _id: 1,
        role: 1,
        title: 1,
        summary: 1,
        source: 1,
        date: 1,
        tags: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    }
  ];

  const results = await collection.aggregate(pipeline).toArray();

  return results.map((doc: any) => ({
    ns: ROLE_TO_NS[doc.role],
    text: doc.summary,
    meta: {
      id: doc._id,
      title: doc.title,
      source: doc.source,
      date: doc.date,
      tags: doc.tags,
      score: doc.score,
    },
    sim: doc.score,
  }));
}
```

**3. 데이터 Import 스크립트**
```typescript
// scripts/import_to_mongodb.ts
import { MongoClient } from 'mongodb';
import fs from 'fs';

const client = new MongoClient(process.env.MONGODB_URI!);
const collection = client.db('economy_mentor').collection('rag_docs');

// Embedding API 호출
async function embed(text: string): Promise<number[]> {
  const response = await fetch('http://localhost:8004/embed', {
    method: 'POST',
    body: JSON.stringify({ text })
  });
  return (await response.json()).embedding;
}

async function importDocs() {
  const bokTerms = fs.readFileSync('RAG_zzin/data/bok_terms_full.jsonl', 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));

  // Batch embedding (100개씩)
  for (let i = 0; i < bokTerms.length; i += 100) {
    const batch = bokTerms.slice(i, i + 100);
    const embeddings = await Promise.all(
      batch.map(doc => embed(`${doc.term} ${doc.definition}`))
    );

    const documents = batch.map((doc, idx) => ({
      _id: doc.id || `bok_${i + idx}`,
      role: 'eco',
      title: doc.term,
      summary: doc.definition,
      embedding: embeddings[idx],
      source: '한국은행 경제용어사전',
      tags: [doc.category].filter(Boolean),
      created_at: new Date(),
    }));

    await collection.insertMany(documents);
    console.log(`Imported ${i + batch.length} / ${bokTerms.length}`);
  }
}

importDocs().catch(console.error);
```

### 장점 ✅

1. **통합 데이터 관리**
   - 벡터 + 메타데이터 + 필터링을 한 곳에서 처리
   - 별도 동기화 불필요

2. **강력한 필터링**
   - 날짜 범위, 태그, 출처 등을 벡터 검색과 함께 실행
   - 예: "2024년 이후 한국은행 보고서만"
   ```typescript
   filter: {
     role: "eco",
     date: { $gte: "2024-01-01" },
     source: "한국은행"
   }
   ```

3. **Incremental Update**
   - 문서 추가/수정/삭제가 실시간 반영
   - FAISS처럼 전체 재구축 불필요

4. **확장성**
   - MongoDB Atlas는 자동 스케일링
   - 수백만 문서도 안정적 처리

5. **TypeScript 네이티브**
   - Node.js에서 직접 사용 (별도 Python 서버 불필요)

6. **백업/복구**
   - MongoDB의 표준 백업 도구 사용 가능

### 단점 ❌

1. **비용**
   - **MongoDB Atlas**: M10 클러스터 이상 필요 (~$57/월)
   - 벡터 인덱스는 추가 메모리/CPU 소모
   - 대안: 오픈소스 Qdrant (무료, 자체 호스팅)

2. **네트워크 의존성**
   - 외부 MongoDB 서버 필요 (로컬도 가능하나 설정 복잡)
   - 인터넷 연결 끊기면 검색 불가 (self-hosted 제외)

3. **Embedding API 필요**
   - MongoDB는 벡터 저장만 하고, embedding은 외부에서 생성
   - OpenAI API ($0.0001/1K tokens) 또는 로컬 FastAPI 서버 필요

4. **초기 Import 시간**
   - 8,000 문서 embedding + insert: ~10-20분
   - FAISS보다 느림 (네트워크 I/O)

5. **디버깅**
   - 벡터 검색 결과가 왜 이렇게 나왔는지 설명 어려움
   - FAISS와 동일한 문제

### 적합한 경우

- ✅ **실시간 업데이트 필요** (뉴스 크롤링 등)
- ✅ **복잡한 필터링 필요** (날짜, 태그, 출처 조합)
- ✅ **대규모 확장 예정** (100만+ 문서)
- ✅ **클라우드 배포** (관리 부담 최소화)
- ✅ **이미 MongoDB 사용 중**

---

## 🔥 Option 3: Qdrant (추천 대안)

**Qdrant**: 오픈소스 전용 Vector DB (Rust로 작성, 매우 빠름)

### 특징
- MongoDB Vector Search와 유사하나 **무료**
- Docker로 쉽게 배포
- TypeScript/Python SDK 제공
- 필터링 + 벡터 검색 통합
- Self-hosted → 비용 없음

### 아키텍처
```
┌────────────────────────────────────────┐
│       Backend (Node.js)                │
│  ┌──────────────┐                      │
│  │ rag_qdrant.ts│──────┐               │
│  └──────────────┘      │               │
└────────────────────────┼───────────────┘
                         │ HTTP REST API
┌────────────────────────▼───────────────┐
│  Qdrant (Docker Container)             │
│  - Port 6333                           │
│  - Collections: eco_docs, firm_docs    │
│  - Vectors + Payloads (metadata)       │
└────────────────────────────────────────┘
```

### 간단 예시

**1. Docker 실행**
```bash
docker run -p 6333:6333 qdrant/qdrant
```

**2. TypeScript 클라이언트**
```typescript
import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({ url: 'http://localhost:6333' });

export async function searchRAG(q: string, roles: RoleKey[], k = 3): Promise<Hit[]> {
  const queryEmbedding = await embed(q);

  const results = await client.search('rag_collection', {
    vector: queryEmbedding,
    limit: k,
    filter: {
      must: [
        { key: 'role', match: { any: roles } }
      ]
    },
    with_payload: true,
  });

  return results.map(hit => ({
    ns: ROLE_TO_NS[hit.payload.role],
    text: hit.payload.summary,
    meta: hit.payload,
    sim: hit.score,
  }));
}
```

**장점**:
- ✅ **무료** (오픈소스)
- ✅ **빠름** (Rust 기반)
- ✅ **필터링 강력**
- ✅ **TypeScript 네이티브**

**단점**:
- ❌ **별도 서버 필요** (Docker)
- ❌ **관리 부담** (백업, 모니터링)

---

## 📊 종합 비교표

| 항목 | **현재 (Token Search)** | **FAISS** | **MongoDB Atlas** | **Qdrant** |
|------|------------------------|-----------|-------------------|------------|
| **의미 검색** | ❌ | ✅ | ✅ | ✅ |
| **검색 속도** | 느림 (O(N)) | 매우 빠름 (O(log N)) | 빠름 | 매우 빠름 |
| **메모리 사용** | 높음 (전체 로드) | 낮음 (mmap) | 낮음 | 낮음 |
| **확장성** | 낮음 (<1만) | 높음 (100만+) | 매우 높음 | 높음 |
| **필터링** | 후처리 | 후처리 | 강력 (통합) | 강력 (통합) |
| **실시간 업데이트** | 쉬움 | 어려움 (재구축) | 쉬움 | 쉬움 |
| **비용** | **무료** | 무료 (인프라만) | **유료** ($57+/월) | **무료** |
| **배포 복잡도** | 낮음 | 중간 (Python 서버) | 낮음 (클라우드) | 중간 (Docker) |
| **오프라인 동작** | ✅ | ✅ | ❌ (Self-hosted 제외) | ✅ (Self-hosted) |
| **TypeScript 지원** | ✅ | ❌ (FastAPI 필요) | ✅ | ✅ |
| **한국어 지원** | 기본 | ✅ (모델 선택) | ✅ (모델 선택) | ✅ (모델 선택) |

---

## 🎯 추천 결론

### 현재 프로젝트에 적합한 선택

#### **추천 1순위: FAISS** ⭐⭐⭐⭐⭐

**이유**:
1. **NPU 환경과 궁합 좋음**
   - 이미 Python AI 서버 (Eco/Firm/House) 운영 중
   - FAISS 서버 하나 추가하면 됨 (port 8004)
   - NPU에서 embedding 가속 가능

2. **오프라인 동작**
   - 외부 API/클라우드 불필요
   - `run.sh`에 FAISS 서버 시작 추가만 하면 됨

3. **무료**
   - 인프라 비용만 (이미 보유)

4. **의미 검색으로 정확도 향상**
   - "금리 인상" → "기준금리 상승", "통화긴축" 매칭
   - 현재 토큰 검색보다 2-3배 정확도 향상 예상

**구현 계획**:
```bash
Economy-Mentor/
├── ai/
│   ├── main.py (기존 Eco/Firm/House 서버)
│   ├── main_faiss.py (NEW: FAISS 서버)
│   └── requirements.txt (faiss-cpu, sentence-transformers 추가)
├── backend/
│   └── src/ai/
│       ├── rag.ts (기존 유지, LEGACY)
│       └── rag_faiss.ts (NEW: FAISS 클라이언트)
├── scripts/
│   └── build_faiss_index.py (NEW: 인덱스 생성)
└── run.sh (FAISS 서버 시작 추가)
```

---

#### **추천 2순위: Qdrant** ⭐⭐⭐⭐

**이유**:
1. **MongoDB보다 가볍고 무료**
2. **실시간 업데이트 필요 시**
   - 뉴스 크롤링, 리포트 자동 수집 등
3. **복잡한 필터링 필요 시**
   - "2024년 이후 + 삼성전자 + 실적 관련"

**적합한 경우**:
- 향후 실시간 뉴스 크롤링 추가 계획
- 사용자별 맞춤 RAG 필터링 필요
- 확장 가능성 고려

---

#### **비추천: MongoDB Atlas** ❌

**이유**:
1. **비용** ($57/월 최소)
2. **현재 프로젝트에 과도한 스펙**
   - 문서 8,000개 수준에는 과함
3. **이미 Python 인프라 있음**
   - FAISS가 더 적합

---

## 🚀 FAISS 마이그레이션 로드맵

### Phase 1: FAISS 서버 구현 (2-3시간)
1. `ai/main_faiss.py` 작성
   - FastAPI 엔드포인트: `/embed`, `/search`
   - Sentence Transformers 로드
   - FAISS 인덱스 로드/검색

2. `scripts/build_faiss_index.py` 작성
   - RAG_zzin 데이터 읽기
   - Embedding 생성 (진행률 표시)
   - FAISS 인덱스 저장

3. 인덱스 생성 실행
   ```bash
   python scripts/build_faiss_index.py
   # 결과: data/faiss_index_{eco,firm,house}.bin
   ```

### Phase 2: Backend 통합 (1-2시간)
1. `backend/src/ai/rag_faiss.ts` 작성
2. `ask.ts`에서 `searchRAG()` import 변경
   ```typescript
   // Before
   import { searchRAG } from './ai/rag.js';

   // After
   import { searchRAG } from './ai/rag_faiss.js';
   ```

### Phase 3: 테스트 & 비교 (1시간)
1. 동일한 쿼리로 기존 vs FAISS 비교
   ```bash
   curl -X POST http://localhost:4000/ask \
     -d '{"q": "금리 인상이 주식시장에 미치는 영향"}'
   ```
2. 정확도, 응답 시간, 관련성 비교

### Phase 4: 배포 (30분)
1. `run.sh`에 FAISS 서버 추가
   ```bash
   python ai/main_faiss.py --port 8004 &
   ```
2. `requirements.txt` 업데이트
3. 문서 업데이트

---

## 🤔 최종 결정 가이드

### FAISS를 선택하세요 (강력 추천)

- ✅ 현재 문서 수: ~8,000 (FAISS 최적)
- ✅ 업데이트 빈도: 낮음 (배치 업데이트)
- ✅ 의미 검색 필요: 높음
- ✅ 비용 제약: 있음
- ✅ Python 인프라: 이미 있음 (Eco/Firm/House 서버)
- ✅ 오프라인 동작: 필요

### Qdrant를 고려하세요

- ✅ 실시간 업데이트 계획: 있음
- ✅ 복잡한 필터링 필요: 있음
- ✅ 장기 확장 계획: 100만+ 문서
- ✅ Docker 관리 가능: 있음

### MongoDB Atlas는 비추천

- ❌ 비용 부담
- ❌ 현재 규모에 과함
- ❌ Python 인프라로 충분

---

**결론**: **FAISS 먼저 구현하고, 향후 실시간 업데이트가 필요해지면 Qdrant로 마이그레이션하는 것이 최선의 전략입니다.**

FAISS 구현을 도와드릴까요?
