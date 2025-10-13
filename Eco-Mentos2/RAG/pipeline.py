from __future__ import annotations

from typing import List, Dict, Any, Optional, Tuple
import os

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
        return self.store.add(vectors, chunked_metas)

    def answer_query(
        self, query: str, top_k: int = 5, use_llm: bool = True
    ) -> Tuple[str, List[Dict[str, Any]]]:
        contexts = self.retriever.retrieve(query, top_k=top_k)
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
        user = f"질문: {query}\n\n[컨텍스트]\n{context_blob}\n\n컨텍스트를 근거로 답변해 주세요."
        answer = _call_openai(system, user, model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY)
        return (answer, contexts)

