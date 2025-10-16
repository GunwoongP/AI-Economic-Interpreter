from __future__ import annotations

from typing import List, Dict, Any, Tuple, Optional
import os
import json
import numpy as np
import faiss
import logging
from filelock import FileLock


logger = logging.getLogger(__name__)


class VectorStore:
    def __init__(
        self,
        data_dir: str,
        name: str,
        dim: int,
        index_spec: Optional[str] = None,
        nprobe: Optional[int] = None,
    ):
        self.data_dir = os.path.abspath(data_dir)
        self.name = name
        self.dim = dim
        os.makedirs(self.data_dir, exist_ok=True)

        self.index_path = os.path.join(self.data_dir, f"{self.name}.faiss")
        self.meta_path = os.path.join(self.data_dir, f"{self.name}.metas.jsonl")
        self.cfg_path = os.path.join(self.data_dir, f"{self.name}.config.json")

        self.index: faiss.Index = None
        self.metas: List[Dict[str, Any]] = []
        self._metric = "cosine"
        default_spec = "Flat"
        self._index_spec = (
            index_spec
            or os.environ.get("VECTORSTORE_INDEX_SPEC")
            or default_spec
        )
        self._index_spec = self._index_spec.strip() or "Flat"
        if self._index_spec.lower() in {"indexflatip", "flat"}:
            self._index_spec = "Flat"
        self._nprobe = int(os.environ.get("VECTORSTORE_NPROBE", nprobe or 8))
        self._lock = FileLock(os.path.join(self.data_dir, f"{self.name}.lock"))

        self._load()

    @staticmethod
    def _normalize(vecs: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-12
        return vecs / norms

    def _create_index(self) -> faiss.Index:
        # Cosine similarity via inner product on normalized vectors
        if self._index_spec == "Flat":
            index = faiss.IndexFlatIP(self.dim)
        else:
            try:
                index = faiss.index_factory(
                    self.dim, self._index_spec, faiss.METRIC_INNER_PRODUCT
                )
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(
                    "Failed to create FAISS index with spec %s (%s); falling back to Flat",
                    self._index_spec,
                    exc,
                )
                self._index_spec = "Flat"
                index = faiss.IndexFlatIP(self.dim)

        if hasattr(index, "nprobe"):
            index.nprobe = max(1, self._nprobe)
        return index

    def _load(self):
        if os.path.exists(self.meta_path):
            with open(self.meta_path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        self.metas.append(json.loads(line))

        if os.path.exists(self.cfg_path):
            cfg = json.loads(open(self.cfg_path, "r", encoding="utf-8").read())
            self.dim = int(cfg.get("dim", self.dim))
            self._metric = cfg.get("metric", self._metric)
            self._index_spec = cfg.get("index_spec", self._index_spec)
            if self._index_spec.lower() in {"indexflatip", "flat"}:
                self._index_spec = "Flat"
            self._nprobe = int(cfg.get("nprobe", self._nprobe))

        if os.path.exists(self.index_path):
            with open(self.index_path, "rb") as fh:
                data = fh.read()
            arr = np.frombuffer(data, dtype=np.uint8)
            self.index = faiss.deserialize_index(arr)
            if self.index.d != self.dim:
                raise ValueError(
                    f"Index dimension mismatch: {self.index.d} vs expected {self.dim}"
                )
            if hasattr(self.index, "nprobe"):
                self.index.nprobe = max(1, self._nprobe)
            if self._index_spec == "Flat" and isinstance(self.index, faiss.IndexIVF):
                # configuration missing but index is IVF -> remember it
                self._index_spec = "IVF"
        else:
            self.index = self._create_index()

        if self.index.ntotal != len(self.metas):
            if len(self.metas) == 0:
                # Fresh index, nothing to reconcile
                self.index = self._create_index()
            else:
                raise ValueError(
                    "Index and metadata count mismatch. Re-ingest the dataset to rebuild."
                )

    def _persist(self):
        with self._lock:
            tmp_index = self.index_path + ".tmp"
            serialized = faiss.serialize_index(self.index).tobytes()
            with open(tmp_index, "wb") as fh:
                fh.write(serialized)
            os.replace(tmp_index, self.index_path)

            tmp_meta = self.meta_path + ".tmp"
            with open(tmp_meta, "w", encoding="utf-8") as fh:
                for meta in self.metas:
                    fh.write(json.dumps(meta, ensure_ascii=False) + "\n")
            os.replace(tmp_meta, self.meta_path)

            tmp_cfg = self.cfg_path + ".tmp"
            with open(tmp_cfg, "w", encoding="utf-8") as fh:
                json.dump(
                    {
                        "dim": self.dim,
                        "metric": self._metric,
                        "index_spec": self._index_spec,
                        "nprobe": self._nprobe,
                    },
                    fh,
                    ensure_ascii=False,
                    indent=2,
                )
            os.replace(tmp_cfg, self.cfg_path)

    def _ensure_trained(self, vecs: np.ndarray):
        if hasattr(self.index, "is_trained") and not self.index.is_trained:
            nlist = getattr(self.index, "nlist", 0)
            if nlist and vecs.shape[0] < nlist:
                raise RuntimeError(
                    f"Not enough vectors ({vecs.shape[0]}) to train IVF index (nlist={nlist})"
                )
            self.index.train(vecs)

    def add(self, embeddings: np.ndarray, metas: List[Dict[str, Any]]) -> int:
        assert embeddings.shape[1] == self.dim, "embedding dimension mismatch"
        vecs = self._normalize(embeddings.astype("float32"))
        vecs = np.ascontiguousarray(vecs, dtype="float32")

        with self._lock:
            if self.index is None:
                self.index = self._create_index()
            # 데이터가 충분한데 Flat이면 IVF로 승격
            if (
                self._index_spec == "Flat"
                and vecs.shape[0] + (self.index.ntotal or 0) >= 20000
                and not isinstance(self.index, faiss.IndexIVF)
            ):
                import math

                nlist = min(4096, max(256, int(math.sqrt(vecs.shape[0] + self.index.ntotal))))
                self._index_spec = f"IVF{nlist},Flat"
                logger.info("Switching FAISS index spec to %s based on data volume", self._index_spec)
                self.index = self._create_index()
            if hasattr(self.index, "nprobe"):
                self.index.nprobe = max(1, self._nprobe)
            try:
                self._ensure_trained(vecs)
            except Exception as exc:
                logger.warning(
                    "Training FAISS index (%s) failed (%s: %s). Falling back to Flat index.",
                    self._index_spec,
                    type(exc).__name__,
                    exc,
                )
                self._index_spec = "Flat"
                self.index = faiss.IndexFlatIP(self.dim)

            self.index.add(vecs)
            self.metas.extend(metas)
            self._persist()
        return len(metas)

    def search(self, query_vec: np.ndarray, top_k: int = 5) -> List[Tuple[int, float]]:
        if self.index is None or self.index.ntotal == 0:
            return []
        q = query_vec.reshape(1, -1).astype("float32")
        q = self._normalize(q)
        k = min(top_k, self.index.ntotal)
        if hasattr(self.index, "nprobe"):
            self.index.nprobe = max(1, self._nprobe)
        scores, indices = self.index.search(q, k)
        return [
            (int(idx), float(score))
            for idx, score in zip(indices[0], scores[0])
            if idx >= 0
        ]

    def get(self, idx: int) -> Dict[str, Any]:
        return self.metas[idx]

    def stats(self) -> Dict[str, Any]:
        return {
            "count": int(self.index.ntotal if self.index else 0),
            "dim": int(self.dim),
            "name": self.name,
            "path": self.data_dir,
            "metric": self._metric,
            "index_spec": self._index_spec,
            "nprobe": int(self._nprobe),
        }
