from __future__ import annotations

from typing import List, Optional, Dict, Any
import os
import pickle
import logging
import numpy as np


class Embedder:
    def __init__(
        self,
        method: Optional[str] = None,
        model_name: Optional[str] = None,
        state_path: Optional[str] = None,
    ):
        self.method = (method or os.getenv("EMBEDDER") or "tfidf").strip()
        self.model_name = model_name or os.getenv(
            "EMBEDDER_MODEL", "all-MiniLM-L6-v2"
        )
        self.backend = None
        self.dim: Optional[int] = None
        self.state_path: Optional[str] = state_path
        self._init_backend()
        self._try_load_state()

    def _init_backend(self):
        if self.method.startswith("sentence"):
            try:
                from sentence_transformers import SentenceTransformer

                self.backend = SentenceTransformer(self.model_name)
                self.dim = int(self.backend.get_sentence_embedding_dimension())
                self.method = "sentence-transformers"
                return
            except Exception as exc:  # pragma: no cover - import guard
                logging.getLogger(__name__).warning(
                    "sentence-transformers 초기화 실패(%s). TF-IDF로 전환합니다.", exc
                )
                self.method = "tfidf"
                self.backend = None
                self.dim = None

        if self.method == "tfidf":
            from sklearn.feature_extraction.text import TfidfVectorizer

            self.backend = TfidfVectorizer(
                max_features=4096,
                analyzer="char_wb",
                ngram_range=(2, 5),
            )
            self.dim = 4096

    def set_state_path(self, path: str) -> None:
        self.state_path = path
        self._try_load_state()

    def _try_load_state(self) -> None:
        if self.method == "tfidf" and self.state_path and os.path.exists(
            self.state_path
        ):
            try:
                with open(self.state_path, "rb") as fh:
                    self.backend = pickle.load(fh)
                vocab = getattr(self.backend, "vocabulary_", None)
                if vocab:
                    self.dim = len(vocab)
            except Exception:
                pass

    def save_state(self) -> None:
        if self.method == "tfidf" and self.state_path:
            try:
                os.makedirs(os.path.dirname(self.state_path), exist_ok=True)
                with open(self.state_path, "wb") as fh:
                    pickle.dump(self.backend, fh)
            except Exception:
                pass

    def is_trained(self) -> bool:
        return self.method != "tfidf" or hasattr(self.backend, "vocabulary_")

    def info(self) -> Dict[str, Any]:
        return {"method": self.method, "model": self.model_name, "dim": self.dim}

    def fit(self, texts: List[str]) -> None:
        if self.method == "tfidf" and hasattr(self.backend, "fit"):
            self.backend.fit(texts)

    def encode(self, texts: List[str]) -> np.ndarray:
        if self.method == "sentence-transformers":
            arr = self.backend.encode(
                texts, show_progress_bar=False, normalize_embeddings=True
            )
            return np.asarray(arr, dtype=np.float32)

        if hasattr(self.backend, "vocabulary_"):
            X = self.backend.transform(texts)
        else:
            X = self.backend.fit_transform(texts)
        XA = X.toarray().astype("float32")
        norms = np.linalg.norm(XA, axis=1, keepdims=True) + 1e-12
        return (XA / norms).astype("float32")

