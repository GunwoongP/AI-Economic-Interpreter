from __future__ import annotations

from typing import List, Optional
import os
import io
import json
try:
    from PyPDF2 import PdfReader  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    PdfReader = None  # type: ignore


def _read_txt(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def _read_md(path: str) -> str:
    return _read_txt(path)


def _read_pdf(path: str) -> str:
    out = []
    if PdfReader is None:
        return ""
    with open(path, "rb") as fh:
        reader = PdfReader(fh)
        for page in reader.pages:
            try:
                out.append(page.extract_text() or "")
            except Exception:
                continue
    return "\n".join(out)


def _format_json_entry(value: object) -> str:
    if isinstance(value, dict):
        term = value.get("term")
        definition = value.get("definition")
        if term and definition:
            return f"{term}: {definition}"
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (str, int, float)):
        return str(value)
    return json.dumps(value, ensure_ascii=False)


def read_text_from_file(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in [".txt", ".md"]:
        return _read_txt(path)
    if ext == ".pdf":
        return _read_pdf(path)
    if ext == ".jsonl":
        lines: List[str] = []
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            for raw in fh:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                except Exception:
                    lines.append(raw)
                    continue
                lines.append(_format_json_entry(entry))
        return "\n".join(lines)
    if ext == ".json":
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                data = json.load(fh)
        except Exception:
            data = None
        if data is not None:
            entries: List[str] = []
            if isinstance(data, list):
                for item in data:
                    entries.append(_format_json_entry(item))
            elif isinstance(data, dict):
                for key, value in data.items():
                    entries.append(_format_json_entry({"term": key, "definition": value}))
            if entries:
                return "\n".join(entries)
    try:
        with open(path, "rb") as f:
            raw = f.read()
        return raw.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def read_filelike_texts(raw: bytes, filename: Optional[str] = None) -> List[str]:
    name = (filename or "upload.bin").lower()
    if name.endswith((".txt", ".md")):
        return [raw.decode("utf-8", errors="ignore")]
    if name.endswith(".pdf"):
        out = []
        if PdfReader is None:
            return [""]
        reader = PdfReader(io.BytesIO(raw))
        for page in reader.pages:
            try:
                out.append(page.extract_text() or "")
            except Exception:
                continue
        return out if out else [""]
    if name.endswith(".jsonl"):
        lines: List[str] = []
        for part in raw.decode("utf-8", errors="ignore").splitlines():
            part = part.strip()
            if not part:
                continue
            try:
                entry = json.loads(part)
            except Exception:
                lines.append(part)
                continue
            lines.append(_format_json_entry(entry))
        return lines if lines else [""]
    if name.endswith(".json"):
        try:
            data = json.loads(raw.decode("utf-8", errors="ignore"))
        except Exception:
            return [raw.decode("utf-8", errors="ignore")]
        entries: List[str] = []
        if isinstance(data, list):
            for item in data:
                entries.append(_format_json_entry(item))
        elif isinstance(data, dict):
            for key, value in data.items():
                entries.append(_format_json_entry({"term": key, "definition": value}))
        return entries if entries else [raw.decode("utf-8", errors="ignore")]
    try:
        return [raw.decode("utf-8", errors="ignore")]
    except Exception:
        return [""]

