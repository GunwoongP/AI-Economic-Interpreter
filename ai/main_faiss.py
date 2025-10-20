"""
FAISS Vector Search Server for RAG
- Embedding: jhgan/ko-sroberta-multitask (Korean-optimized)
- FAISS Index: Flat (simple, exact search)
- Endpoints: /embed, /search, /health
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional

import faiss
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

# ============================================================================
# Configuration
# ============================================================================

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "faiss"
DATA_DIR.mkdir(parents=True, exist_ok=True)

EMBEDDING_MODEL = os.getenv("FAISS_EMBEDDING_MODEL", "jhgan/ko-sroberta-multitask")
# Alternative models:
# - "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2" (다국어)
# - "BM-K/KoSimCSE-roberta" (한국어 특화)

ROLES = ["eco", "firm", "house"]

# ============================================================================
# Models
# ============================================================================

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    embedding: List[float]
    dimension: int

class SearchRequest(BaseModel):
    query: str
    roles: List[str]
    k: int = 3

class SearchHit(BaseModel):
    role: str
    text: str
    meta: Dict[str, Any]
    sim: float

class SearchResponse(BaseModel):
    hits: List[SearchHit]
    query_time_ms: float

# ============================================================================
# Global State
# ============================================================================

app = FastAPI(title="FAISS RAG Server", version="1.0.0")

embedding_model: Optional[SentenceTransformer] = None
indices: Dict[str, faiss.Index] = {}
metadata: Dict[str, List[Dict[str, Any]]] = {}

# ============================================================================
# Initialization
# ============================================================================

def load_embedding_model():
    """Load Sentence Transformer model for Korean text"""
    global embedding_model
    print(f"[FAISS] Loading embedding model: {EMBEDDING_MODEL}")

    try:
        embedding_model = SentenceTransformer(EMBEDDING_MODEL)
        print(f"[FAISS] Model loaded successfully (dimension: {embedding_model.get_sentence_embedding_dimension()})")
    except Exception as e:
        print(f"[FAISS] Error loading model: {e}")
        sys.exit(1)

def load_indices():
    """Load FAISS indices and metadata for all roles"""
    global indices, metadata

    for role in ROLES:
        index_path = DATA_DIR / f"index_{role}.bin"
        meta_path = DATA_DIR / f"metadata_{role}.json"

        if not index_path.exists():
            print(f"[FAISS] Warning: Index not found for {role}: {index_path}")
            print(f"[FAISS] Run 'python scripts/build_faiss_index.py' to create indices")
            continue

        if not meta_path.exists():
            print(f"[FAISS] Warning: Metadata not found for {role}: {meta_path}")
            continue

        try:
            # Load FAISS index
            indices[role] = faiss.read_index(str(index_path))
            print(f"[FAISS] Loaded index for {role}: {indices[role].ntotal} vectors")

            # Load metadata
            with open(meta_path, 'r', encoding='utf-8') as f:
                metadata[role] = json.load(f)
            print(f"[FAISS] Loaded metadata for {role}: {len(metadata[role])} documents")

        except Exception as e:
            print(f"[FAISS] Error loading {role}: {e}")
            continue

    if not indices:
        print("[FAISS] ERROR: No indices loaded!")
        print("[FAISS] Please run: python scripts/build_faiss_index.py")
        sys.exit(1)

@app.on_event("startup")
async def startup():
    """Initialize on server start"""
    load_embedding_model()
    load_indices()
    print("[FAISS] Server ready")

# ============================================================================
# Endpoints
# ============================================================================

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "model": EMBEDDING_MODEL,
        "dimension": embedding_model.get_sentence_embedding_dimension() if embedding_model else None,
        "loaded_roles": list(indices.keys()),
        "total_vectors": {role: idx.ntotal for role, idx in indices.items()},
    }

@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    """Generate embedding for a single text"""
    if not embedding_model:
        raise HTTPException(status_code=500, detail="Embedding model not loaded")

    try:
        embedding = embedding_model.encode(req.text, convert_to_numpy=True)

        # Normalize for cosine similarity
        faiss.normalize_L2(embedding.reshape(1, -1))

        return EmbedResponse(
            embedding=embedding.tolist(),
            dimension=len(embedding)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")

@app.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest):
    """Vector search across specified roles"""
    import time
    start_time = time.time()

    if not embedding_model:
        raise HTTPException(status_code=500, detail="Embedding model not loaded")

    # Validate roles
    valid_roles = [r for r in req.roles if r in indices]
    if not valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"No valid roles found. Available: {list(indices.keys())}"
        )

    try:
        # 1. Generate query embedding
        query_embedding = embedding_model.encode(req.query, convert_to_numpy=True)
        query_embedding = query_embedding.reshape(1, -1).astype('float32')
        faiss.normalize_L2(query_embedding)

        # 2. Search each role's index
        all_hits: List[SearchHit] = []

        for role in valid_roles:
            index = indices[role]
            meta = metadata[role]

            # FAISS search (returns distances and indices)
            # For normalized vectors with Inner Product, distance = 1 - cosine_sim
            distances, idx_results = index.search(query_embedding, min(req.k, index.ntotal))

            # Convert to hits
            for dist, idx in zip(distances[0], idx_results[0]):
                if idx == -1:  # FAISS returns -1 for empty results
                    continue

                if idx >= len(meta):
                    print(f"[FAISS] Warning: Index {idx} out of range for {role} metadata")
                    continue

                doc_meta = meta[idx]

                # Calculate similarity (cosine similarity from inner product)
                # For normalized vectors: similarity = 1 - distance/2
                # But since we use IndexFlatIP, distance is already inner product
                similarity = float(dist)  # Already inner product (cosine sim for normalized vectors)

                all_hits.append(SearchHit(
                    role=role,
                    text=doc_meta.get("summary", ""),
                    meta={
                        "id": doc_meta.get("id"),
                        "title": doc_meta.get("title"),
                        "source": doc_meta.get("source"),
                        "date": doc_meta.get("date"),
                        "tags": doc_meta.get("tags", []),
                        "score": similarity,
                    },
                    sim=similarity
                ))

        # 3. Sort by similarity (highest first) and limit
        all_hits.sort(key=lambda h: h.sim, reverse=True)
        top_hits = all_hits[:req.k * len(valid_roles)]

        query_time = (time.time() - start_time) * 1000

        return SearchResponse(
            hits=top_hits,
            query_time_ms=round(query_time, 2)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FAISS RAG Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind")
    parser.add_argument("--port", type=int, default=8004, help="Port to bind")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (dev mode)")
    args = parser.parse_args()

    import uvicorn
    uvicorn.run(
        "main_faiss:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )
