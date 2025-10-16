from __future__ import annotations

from typing import List, Dict, Any, Tuple
import numpy as np

from .embedding import Embedder
from .vectorstore import VectorStore


class Retriever:
    def __init__(self, store: VectorStore, embedder: Embedder):
        self.store = store
        self.embedder = embedder

    @staticmethod
    def _keywords(query: str) -> List[str]:
        tokens: List[str] = []
        buffer: List[str] = []

        def flush() -> None:
            if len(buffer) >= 2:
                tokens.append("".join(buffer))
            buffer.clear()

        for ch in query:
            if ch.isalnum() or ("\uAC00" <= ch <= "\uD7A3"):
                buffer.append(ch)
            else:
                flush()
        flush()

        seen: set[str] = set()
        ordered: List[str] = []
        for tok in tokens:
            if tok not in seen:
                seen.add(tok)
                ordered.append(tok)
        return ordered

    @staticmethod
    def _apply_keyword_bonus(text: str, keywords: List[str]) -> Tuple[float, int]:
        if not keywords:
            return (0.0, 0)
        matches = sum(1 for kw in keywords if kw in text)
        bonus = 0.25 * matches
        return (bonus, matches)

    def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        keywords = self._keywords(query)
        candidate_k = min(max(top_k * 5, top_k), len(self.store.metas)) or top_k

        if self.embedder.method == "tfidf" and not hasattr(self.embedder.backend, "vocabulary_"):
            try:
                texts = [m.get("text", "") for m in self.store.metas]
                if not texts:
                    return []
                from sklearn.feature_extraction.text import TfidfVectorizer

                vectorizer = TfidfVectorizer(max_features=self.store.dim)
                matrix = vectorizer.fit_transform(texts)
                vectors = matrix.toarray().astype("float32")
                vectors = vectors / (np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-12)

                query_vec = vectorizer.transform([query]).toarray().astype("float32")
                query_vec = query_vec / (np.linalg.norm(query_vec, axis=1, keepdims=True) + 1e-12)

                sims = (vectors @ query_vec.T)[:, 0]
                idxs = np.argsort(-sims)[:candidate_k].tolist()
                hits = [(int(i), float(sims[i])) for i in idxs]
            except Exception:
                hits = []
        else:
            query_vector = self.embedder.encode([query])[0]
            hits = self.store.search(query_vector, top_k=candidate_k)

        scored: List[tuple[float, Dict[str, Any]]] = []
        for idx, raw_score in hits:
            meta = self.store.get(idx).copy()
            text = meta.get("text", "")
            bonus, matches = self._apply_keyword_bonus(text, keywords)
            meta_score = float(raw_score + bonus)
            if keywords and matches == 0:
                meta_score = float(raw_score - 0.25)
            meta["score"] = meta_score
            meta["_meta_index"] = idx
            scored.append((meta_score, meta))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [meta for _, meta in scored[:top_k]]
