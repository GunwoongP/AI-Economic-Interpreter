from __future__ import annotations

from typing import List, Dict, Any
import numpy as np
import re

from .embedding import Embedder
from .vectorstore import VectorStore


class Retriever:
    def __init__(self, store: VectorStore, embedder: Embedder):
        self.store = store
        self.embedder = embedder

    def _keywords(self, query: str) -> List[str]:
        raw_tokens = re.findall(r"[0-9A-Za-z가-힣]+", query)
        suffixes = ["의", "은", "는", "이", "가", "을", "를", "에", "에서", "에게", "으로", "로", "와", "과", "도", "다"]
        tokens: set[str] = set()
        for tok in raw_tokens:
            tokens.add(tok)
            base = tok
            changed = True
            while changed and len(base) > 1:
                changed = False
                for suf in suffixes:
                    if base.endswith(suf) and len(base) > len(suf):
                        base = base[: -len(suf)]
                        tokens.add(base)
                        changed = True
                        break
        return [t for t in tokens if len(t) >= 2]

    def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        keywords = self._keywords(query)
        candidate_k = min(max(top_k * 5, top_k), len(self.store.metas)) or top_k

        if self.embedder.method == "tfidf" and not hasattr(self.embedder.backend, "vocabulary_"):
            try:
                texts = [m.get("text", "") for m in self.store.metas]
                if not texts:
                    return []
                from sklearn.feature_extraction.text import TfidfVectorizer

                v = TfidfVectorizer(max_features=self.store.dim)
                X = v.fit_transform(texts)
                XA = X.toarray().astype("float32")
                XA = XA / (np.linalg.norm(XA, axis=1, keepdims=True) + 1e-12)
                qA = v.transform([query]).toarray().astype("float32")
                qA = qA / (np.linalg.norm(qA, axis=1, keepdims=True) + 1e-12)
                sims = (XA @ qA.T)[:, 0]
                idxs = np.argsort(-sims)[:candidate_k].tolist()
                hits = [(int(i), float(sims[i])) for i in idxs]
            except Exception:
                hits = []
        else:
            qv = self.embedder.encode([query])[0]
            hits = self.store.search(qv, top_k=candidate_k)

        scored: List[tuple[float, Dict[str, Any]]] = []
        for idx, raw_score in hits:
            meta = self.store.get(idx).copy()
            text = meta.get("text", "")
            bonus = 0.0
            matches = 0
            if keywords:
                for kw in keywords:
                    if kw in text:
                        matches += 1
                        bonus += 0.25
            meta_score = float(raw_score + bonus)
            if keywords and matches == 0:
                meta_score = float(raw_score - 1.0)
            meta["score"] = meta_score
            scored.append((meta_score, meta))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [meta for _, meta in scored[:top_k]]

