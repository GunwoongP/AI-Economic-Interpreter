from typing import List


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 120) -> List[str]:
    if not text:
        return []
    if chunk_size <= 0:
        return [text]
    chunks = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        piece = text[start:end]
        last_break = max(piece.rfind("\n"), piece.rfind(". "), piece.rfind(".\n"))
        if last_break > 200:
            end = start + last_break + 1
            piece = text[start:end]
        chunks.append(piece.strip())
        if end >= n:
            break
        start = max(end - overlap, 0)
    return [c for c in chunks if c]

