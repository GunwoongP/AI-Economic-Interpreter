from __future__ import annotations

from typing import List, Dict, Any, Optional, Tuple
import os
import re
from collections import defaultdict

from .config import settings
from .embedding import Embedder
from .vectorstore import VectorStore
from .retriever import Retriever
from .chunks import chunk_text


def _call_openai(system_prompt: str, user_prompt: str, model: str, api_key: str) -> str:
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        return f"[LLM call failed: {exc}]\n\n{user_prompt[:1000]}"


class RAGPipeline:
    def __init__(self) -> None:
        tfidf_state = os.path.join(settings.DATA_DIR, f"{settings.INDEX_NAME}.tfidf.pkl")
        self.embedder = Embedder(
            settings.EMBEDDER, settings.EMBEDDER_MODEL, state_path=tfidf_state
        )
        dim = self.embedder.dim or 384
        self.store = VectorStore(settings.DATA_DIR, settings.INDEX_NAME, dim=dim)
        self.retriever = Retriever(self.store, self.embedder)
        self._wise_by_code: Dict[str, List[int]] = defaultdict(list)
        self._wise_by_name: Dict[str, List[int]] = defaultdict(list)
        self._naver_by_name: Dict[str, List[int]] = defaultdict(list)
        self._build_meta_indexes()

    def add_texts(
        self,
        texts: List[str],
        sources: Optional[List[str]] = None,
        metas: Optional[List[Dict[str, Any]]] = None,
        *,
        chunk: bool = True,
    ) -> int:
        if not texts:
            return 0
        if metas is not None and len(metas) != len(texts):
            raise ValueError("metas length must match texts length")

        chunked: List[str] = []
        chunked_metas: List[Dict[str, Any]] = []

        for idx, text in enumerate(texts):
            src = sources[idx] if sources and idx < len(sources) else "unknown"
            parts = chunk_text(text, settings.CHUNK_SIZE, settings.CHUNK_OVERLAP) if chunk else [text]
            base_meta = metas[idx] if metas else {}

            for part_index, part in enumerate(parts):
                payload = {
                    "text": part,
                    "source": src,
                    "chunk_id": f"{idx}-{part_index}",
                }
                if base_meta:
                    payload.update(base_meta)
                payload["text"] = part
                chunked.append(part)
                chunked_metas.append(payload)

        if self.embedder.method == "tfidf" and not self.embedder.is_trained():
            self.embedder.fit(chunked)
        vectors = self.embedder.encode(chunked)
        if self.embedder.method == "tfidf":
            self.embedder.save_state()
        added = self.store.add(vectors, chunked_metas)
        self._build_meta_indexes()
        return added

    def answer_query(
        self, query: str, top_k: int = 5, use_llm: bool = True
    ) -> Tuple[str, List[Dict[str, Any]]]:
        contexts = self.retriever.retrieve(query, top_k=top_k)
        contexts = self._augment_contexts(query, contexts, top_k=top_k)
        contexts = self._deduplicate_contexts(contexts, top_k=top_k)
        if not contexts:
            return ("Index is empty. Ingest data first.", [])

        if not use_llm or not settings.OPENAI_API_KEY:
            joined = "\n\n".join(
                f"[source: {ctx.get('source', 'unknown')} | score: {ctx.get('score', 0.0):.3f}]\n{ctx.get('text', '')}"
                for ctx in contexts
            )
            answer = f"Summary based on top {len(contexts)} contexts:\n\n" + joined[:1800]
            return (answer, contexts)

        system = (
            "You are a helpful assistant. Answer strictly from the provided context. "
            "If the answer is missing, say you do not know. Respond concisely in Korean."
        )
        context_blob = "\n\n".join(
            f"[source: {ctx.get('source', 'unknown')}]\n{ctx.get('text', '')}" for ctx in contexts
        )
        user = f"질문: {query}\n\n[컨텍스트]\n{context_blob}\n\n컨텍스트를 근거로 답변해주세요."
        answer = _call_openai(system, user, model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY)
        return (answer, contexts)

    @staticmethod
    def _normalize_key(value: str) -> str:
        return "".join(ch for ch in value.lower() if ch.isalnum())

    def _build_meta_indexes(self) -> None:
        self._wise_by_code.clear()
        self._wise_by_name.clear()
        self._naver_by_name.clear()
        for idx, meta in enumerate(self.store.metas):
            dataset = meta.get("dataset")
            if dataset == "wise_reports":
                code = str(meta.get("code") or "").strip()
                if code:
                    self._wise_by_code[code].append(idx)
                name = meta.get("name")
                if name:
                    norm = self._normalize_key(name)
                    if norm:
                        self._wise_by_name[norm].append(idx)
            elif dataset == "naver_terms":
                name = meta.get("name")
                if name:
                    norm = self._normalize_key(name)
                    if norm:
                        self._naver_by_name[norm].append(idx)

    def _augment_contexts(
        self, query: str, contexts: List[Dict[str, Any]], top_k: int
    ) -> List[Dict[str, Any]]:
        if not contexts and not (self._wise_by_code or self._wise_by_name or self._naver_by_name):
            return contexts

        norm_query = self._normalize_key(query)
        code_tokens = re.findall(r"\d{4,}", query)
        candidate_indices: List[int] = []

        for code in code_tokens:
            candidate_indices.extend(self._wise_by_code.get(code, []))

        for norm_name, idxs in self._wise_by_name.items():
            if norm_name and norm_name in norm_query:
                candidate_indices.extend(idxs)

        for norm_name, idxs in self._naver_by_name.items():
            if norm_name and norm_name in norm_query:
                candidate_indices.extend(idxs)

        existing_indices = {
            ctx.get("_meta_index")
            for ctx in contexts
            if ctx.get("_meta_index") is not None
        }

        appended: List[Dict[str, Any]] = []
        for idx in candidate_indices:
            if idx in existing_indices:
                continue
            meta = self.store.get(idx).copy()
            meta["_meta_index"] = idx
            meta["score"] = float(meta.get("score", 0.0) + 2.5)
            appended.append(meta)
            existing_indices.add(idx)

        merged = contexts + appended
        self._apply_dataset_boosts(query, merged)
        merged.sort(key=lambda m: m.get("score", 0.0), reverse=True)
        return merged[:top_k]

    def _apply_dataset_boosts(self, query: str, contexts: List[Dict[str, Any]]) -> None:
        if not contexts:
            return
        norm_query = self._normalize_key(query)
        code_tokens = set(re.findall(r"\d{4,}", query))
        for meta in contexts:
            score = float(meta.get("score", 0.0))
            dataset = meta.get("dataset")
            if dataset == "wise_reports":
                code = str(meta.get("code") or "").strip()
                name = meta.get("name") or ""
                if code and code in code_tokens:
                    score += 3.0
                if name and self._normalize_key(name) in norm_query:
                    score += 1.5
            elif dataset == "naver_terms":
                name = meta.get("name") or ""
                if name and self._normalize_key(name) in norm_query:
                    score += 2.5
            meta["score"] = score

    def _deduplicate_contexts(self, contexts: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        deduped: List[Dict[str, Any]] = []
        seen_keys: set[tuple] = set()
        seen_text: set[tuple] = set()
        for ctx in contexts:
            dataset = ctx.get("dataset") or ""
            source = ctx.get("source") or ""
            code = str(ctx.get("code") or "")
            name = str(ctx.get("name") or "")
            chunk_id = str(ctx.get("chunk_id") or "")
            text_sig = (dataset, source, ctx.get("text", "")[:200])

            if text_sig in seen_text:
                continue

            key = (dataset, source, code, name, chunk_id)
            if key in seen_keys:
                continue

            seen_keys.add(key)
            seen_text.add(text_sig)
            deduped.append(ctx)
            if len(deduped) >= top_k:
                break
        return deduped
