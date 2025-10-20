"""
Build FAISS Indices from RAG_zzin Data

This script:
1. Loads all documents from RAG_zzin/data/
2. Generates embeddings using Sentence Transformers
3. Creates FAISS indices (one per role: eco, firm, house)
4. Saves indices and metadata to data/faiss/

Usage:
    python scripts/build_faiss_index.py
    python scripts/build_faiss_index.py --batch-size 32 --model jhgan/ko-sroberta-multitask
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional
from tqdm import tqdm

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

# ============================================================================
# Configuration
# ============================================================================

PROJECT_ROOT = Path(__file__).parent.parent
RAG_DATA_DIR = PROJECT_ROOT / "RAG_zzin" / "data"
OUTPUT_DIR = PROJECT_ROOT / "data" / "faiss"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ROLES = ["eco", "firm", "house"]
ROLE_KEYS = {"eco", "firm", "house"}

# ============================================================================
# Data Loading Functions (From rag.ts logic)
# ============================================================================

def clip_text(text: str, max_len: int = 560) -> str:
    """Clip text to max length"""
    if not text:
        return ""
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[:max_len - 1].rstrip() + "…"

def pick_first(*values) -> Optional[str]:
    """Pick first non-empty string"""
    for v in values:
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, (int, float)):
            return str(v).strip()
    return None

def coerce_tags(value) -> List[str]:
    """Convert various tag formats to list of strings"""
    if not value:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if item]
    if isinstance(value, str):
        return [tag.strip() for tag in value.split(',') if tag.strip()]
    return []

def slugify(text: str, fallback: str) -> str:
    """Create slug from text"""
    import re
    slug = re.sub(r'[^0-9a-zA-Z가-힣]+', '_', text.lower())
    slug = re.sub(r'_+', '_', slug).strip('_')
    return slug or fallback

def normalize_date(date_str: Optional[str]) -> Optional[str]:
    """Normalize date to YYYY-MM-DD format"""
    if not date_str:
        return None

    date_str = date_str.strip()

    # Already in YYYY-MM-DD format
    if len(date_str) == 10 and date_str[4] == '-' and date_str[7] == '-':
        return date_str

    # YY-MM-DD or YY.MM.DD
    import re
    match = re.match(r'(\d{2})[./-](\d{2})[./-](\d{2})', date_str)
    if match:
        yy, mm, dd = match.groups()
        year = 1900 + int(yy) if int(yy) >= 70 else 2000 + int(yy)
        return f"{year}-{mm.zfill(2)}-{dd.zfill(2)}"

    # Try parsing as date
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d')
    except:
        pass

    return None

# ============================================================================
# Document Loaders
# ============================================================================

def load_events_catalog(file_path: Path) -> List[Dict[str, Any]]:
    """Load events_catalog_v2.json"""
    docs = []
    if not file_path.exists():
        return docs

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            events = json.load(f)

        for idx, event in enumerate(events):
            name = pick_first(event.get('name'), event.get('title')) or f"Event {idx + 1}"
            summary = clip_text(pick_first(event.get('summary'), event.get('description'), ''))

            if not summary:
                continue

            year = pick_first(event.get('year'))
            sources = event.get('sources', []) if isinstance(event.get('sources'), list) else []
            source = sources[0] if sources else None

            docs.append({
                'id': f"event_{slugify(name, f'event_{idx}')}",
                'role': 'eco',
                'title': f"{name}{f' ({year})' if year else ''}",
                'summary': summary,
                'date': f"{year}-01-01" if year else None,
                'source': source,
                'tags': ['macro event'] + ([event.get('region')] if event.get('region') else []),
            })

    except Exception as e:
        print(f"[ERROR] Loading events_catalog: {e}")

    return docs

def load_jsonl(file_path: Path) -> List[Dict[str, Any]]:
    """Load JSONL file"""
    docs = []
    if not file_path.exists():
        return docs

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    docs.append(json.loads(line))
    except Exception as e:
        print(f"[ERROR] Loading {file_path.name}: {e}")

    return docs

def load_json_array(file_path: Path) -> List[Dict[str, Any]]:
    """Load JSON array file"""
    if not file_path.exists():
        return []

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception as e:
        print(f"[ERROR] Loading {file_path.name}: {e}")
        return []

def load_all_documents() -> Dict[str, List[Dict[str, Any]]]:
    """Load all documents from RAG_zzin/data/ and organize by role"""

    aggregated = {
        'eco': [],
        'firm': [],
        'house': [],
    }

    print(f"[INFO] Loading documents from {RAG_DATA_DIR}")

    # 1. Events Catalog (eco)
    events = load_events_catalog(RAG_DATA_DIR / "events_catalog_v2.json")
    aggregated['eco'].extend(events)
    print(f"[INFO] Loaded {len(events)} events")

    # 2. BOK Terms (eco)
    bok_terms = load_jsonl(RAG_DATA_DIR / "bok_terms_full.jsonl")
    for idx, term in enumerate(bok_terms):
        term_name = pick_first(term.get('term'), term.get('title'))
        definition = clip_text(pick_first(term.get('definition'), term.get('content'), ''))

        if not term_name or not definition:
            continue

        aggregated['eco'].append({
            'id': f"bok_{slugify(term_name, f'term_{idx}')}",
            'role': 'eco',
            'title': term_name,
            'summary': definition,
            'source': '한국은행 경제용어사전',
            'tags': ['경제용어', 'BOK'] + ([term.get('category')] if term.get('category') else []),
        })
    print(f"[INFO] Loaded {len(bok_terms)} BOK terms")

    # 3. 경제지표해설 (eco)
    indicators = load_jsonl(RAG_DATA_DIR / "알기_쉬운_경제지표해설(2023)F.jsonl")
    for idx, item in enumerate(indicators):
        content = clip_text(pick_first(item.get('content'), item.get('text'), ''))
        if not content:
            continue

        source = pick_first(item.get('source')) or '알기 쉬운 경제지표 해설'
        page = pick_first(item.get('page'), item.get('page_label'))

        aggregated['eco'].append({
            'id': f"indicator_{slugify(f'{source}_{page or idx}', f'indicator_{idx}')}",
            'role': 'eco',
            'title': f"{source}{f' p.{page}' if page else ''}",
            'summary': content,
            'source': source,
            'tags': ['경제지표'],
        })
    print(f"[INFO] Loaded {len(indicators)} economic indicators")

    # 4. 매일경제 용어사전 (firm)
    mail_terms = load_json_array(RAG_DATA_DIR / "maileconterms_jung.json")
    for idx, item in enumerate(mail_terms):
        title = pick_first(item.get('title'), item.get('name'))
        answer = clip_text(pick_first(item.get('answer'), item.get('summary'), ''))

        if not title or not answer:
            continue

        aggregated['firm'].append({
            'id': f"mail_{slugify(title, f'mail_{idx}')}",
            'role': 'firm',
            'title': title,
            'summary': answer,
            'source': '매일경제 용어사전',
            'tags': ['경제용어', 'Mail'],
        })
    print(f"[INFO] Loaded {len(mail_terms)} Mail terms")

    # 5. 한국경제 용어사전 (firm)
    hk_terms = load_json_array(RAG_DATA_DIR / "hangkookeconterms_jung.json")
    for idx, item in enumerate(hk_terms):
        title = pick_first(item.get('title'), item.get('name'))
        answer = clip_text(pick_first(item.get('answer'), item.get('summary'), ''))

        if not title or not answer:
            continue

        aggregated['firm'].append({
            'id': f"hk_{slugify(title, f'hk_{idx}')}",
            'role': 'firm',
            'title': title,
            'summary': answer,
            'source': '한국경제 용어사전',
            'tags': ['경제용어', '한국경제'],
        })
    print(f"[INFO] Loaded {len(hk_terms)} Hankyung terms")

    # 6. 네이버 기업 개요 (firm)
    naver_terms = load_json_array(RAG_DATA_DIR / "naver_terms_name_summary_profile.json")
    for idx, item in enumerate(naver_terms):
        name = pick_first(item.get('name'), item.get('title'))
        summary = clip_text(pick_first(item.get('summary'), item.get('description'), ''))

        if not name or not summary:
            continue

        aggregated['firm'].append({
            'id': f"naver_{slugify(name, f'naver_{idx}')}",
            'role': 'firm',
            'title': name,
            'summary': summary,
            'source': '네이버 기업 개요',
            'tags': ['기업'],
        })
    print(f"[INFO] Loaded {len(naver_terms)} Naver company profiles")

    # 7. WISEfn 리포트 (firm)
    wise_reports = load_json_array(RAG_DATA_DIR / "wisereport_all copy.json")
    for item_idx, item in enumerate(wise_reports):
        code = pick_first(item.get('code'))
        name = pick_first(item.get('name')) or code or f"기업 {item_idx}"

        reports = item.get('reports', []) if isinstance(item.get('reports'), list) else []
        for report_idx, report in enumerate(reports):
            if not isinstance(report, dict):
                continue

            report_title = pick_first(report.get('report_title'), report.get('title')) or '리포트'
            summary = clip_text(pick_first(report.get('report_summary'), report.get('summary'), ''))

            if not summary:
                continue

            date = normalize_date(pick_first(report.get('report_date'), report.get('date')))

            aggregated['firm'].append({
                'id': f"wise_{slugify(f'{code or name}_{report_idx}', f'wise_{item_idx}_{report_idx}')}",
                'role': 'firm',
                'title': f"{name} - {report_title}",
                'summary': summary,
                'date': date,
                'source': 'WISEfn 리포트',
                'tags': ['리포트', code or name],
            })
    print(f"[INFO] Loaded WISEfn reports")

    # 8. Chunks (firm)
    chunks = load_jsonl(RAG_DATA_DIR / "chunks_flat.jsonl")
    for idx, item in enumerate(chunks):
        text = clip_text(pick_first(item.get('text'), item.get('content'), ''))
        if not text:
            continue

        meta = item.get('metadata', {}) if isinstance(item.get('metadata'), dict) else {}
        source_name = pick_first(meta.get('source_name'), meta.get('source'), meta.get('title')) or '리서치 리포트'
        page = pick_first(meta.get('page_label'), meta.get('page'))
        date = normalize_date(pick_first(meta.get('moddate'), meta.get('creationdate'), meta.get('date')))

        aggregated['firm'].append({
            'id': f"chunk_{slugify(f'{source_name}_{page or idx}', f'chunk_{idx}')}",
            'role': 'firm',
            'title': f"{source_name}{f' p.{page}' if page else ''}",
            'summary': text,
            'date': date,
            'source': source_name,
            'tags': ['리포트'],
        })
    print(f"[INFO] Loaded {len(chunks)} report chunks")

    # 9. 알기쉬운 경제이야기 (house)
    story = load_jsonl(RAG_DATA_DIR / "알기쉬운 경제이야기.jsonl")
    for idx, item in enumerate(story):
        content = clip_text(pick_first(item.get('content'), item.get('text'), ''))
        if not content:
            continue

        source = pick_first(item.get('source')) or '알기 쉬운 경제이야기'
        page = pick_first(item.get('page'), item.get('page_label'))

        aggregated['house'].append({
            'id': f"story_{slugify(f'{source}_{page or idx}', f'story_{idx}')}",
            'role': 'house',
            'title': f"{source}{f' p.{page}' if page else ''}",
            'summary': content,
            'source': source,
            'tags': ['생활경제', '기초학습'],
        })
    print(f"[INFO] Loaded {len(story)} economic stories")

    # 10. 초보투자자 가이드 (house)
    beginner = load_jsonl(RAG_DATA_DIR / "초보투자자를위한 증권과 투자 따라잡기.jsonl")
    for idx, item in enumerate(beginner):
        content = clip_text(pick_first(item.get('content'), item.get('text'), ''))
        if not content:
            continue

        source = pick_first(item.get('source'))
        chapter = pick_first(item.get('chapter'), item.get('section_title'))

        aggregated['house'].append({
            'id': f"invest_{slugify(f'{chapter or "section"}_{idx}', f'invest_{idx}')}",
            'role': 'house',
            'title': chapter or '증권 투자 따라잡기',
            'summary': content,
            'source': source,
            'tags': ['투자기초'],
        })
    print(f"[INFO] Loaded {len(beginner)} beginner investment guides")

    # Print summary
    print("\n[SUMMARY]")
    for role in ROLES:
        print(f"  {role}: {len(aggregated[role])} documents")

    return aggregated

# ============================================================================
# FAISS Index Building
# ============================================================================

def build_index(
    documents: List[Dict[str, Any]],
    model: SentenceTransformer,
    batch_size: int = 32
) -> tuple[faiss.Index, List[Dict[str, Any]]]:
    """
    Build FAISS index from documents

    Returns:
        index: FAISS Index
        metadata: List of document metadata (aligned with index)
    """

    if not documents:
        raise ValueError("No documents provided")

    print(f"[INFO] Building index for {len(documents)} documents")

    # 1. Prepare texts for embedding
    texts = [f"{doc['title']} {doc['summary']}" for doc in documents]

    # 2. Generate embeddings in batches
    print("[INFO] Generating embeddings...")
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        convert_to_numpy=True
    )

    # Normalize for cosine similarity
    faiss.normalize_L2(embeddings)

    # 3. Create FAISS index
    dimension = embeddings.shape[1]
    print(f"[INFO] Creating FAISS index (dimension={dimension})")

    # Use IndexFlatIP (Inner Product) for exact cosine similarity search
    # For large datasets (>100k), consider IndexIVFFlat or IndexHNSWFlat
    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings)

    print(f"[INFO] Index created: {index.ntotal} vectors")

    # 4. Prepare metadata (minimal, for fast loading)
    metadata = [
        {
            'id': doc['id'],
            'title': doc['title'],
            'summary': doc['summary'],
            'source': doc.get('source'),
            'date': doc.get('date'),
            'tags': doc.get('tags', []),
        }
        for doc in documents
    ]

    return index, metadata

# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Build FAISS indices for RAG")
    parser.add_argument(
        "--model",
        default="jhgan/ko-sroberta-multitask",
        help="Sentence Transformer model name"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=32,
        help="Batch size for embedding generation"
    )
    parser.add_argument(
        "--roles",
        nargs='+',
        default=ROLES,
        choices=ROLES,
        help="Roles to build indices for"
    )
    args = parser.parse_args()

    print("=" * 70)
    print("FAISS Index Builder")
    print("=" * 70)
    print(f"Model: {args.model}")
    print(f"Batch size: {args.batch_size}")
    print(f"Roles: {', '.join(args.roles)}")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 70)

    # Load embedding model
    print("\n[1/3] Loading embedding model...")
    model = SentenceTransformer(args.model)
    print(f"Model loaded (dimension: {model.get_sentence_embedding_dimension()})")

    # Load documents
    print("\n[2/3] Loading documents...")
    all_documents = load_all_documents()

    # Build indices
    print("\n[3/3] Building FAISS indices...")
    for role in args.roles:
        documents = all_documents[role]

        if not documents:
            print(f"[WARNING] No documents found for {role}, skipping")
            continue

        print(f"\n--- Building index for {role} ---")
        index, metadata = build_index(documents, model, args.batch_size)

        # Save index
        index_path = OUTPUT_DIR / f"index_{role}.bin"
        faiss.write_index(index, str(index_path))
        print(f"[INFO] Saved index to {index_path}")

        # Save metadata
        meta_path = OUTPUT_DIR / f"metadata_{role}.json"
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        print(f"[INFO] Saved metadata to {meta_path}")

    print("\n" + "=" * 70)
    print("✅ FAISS indices built successfully!")
    print(f"📁 Output directory: {OUTPUT_DIR}")
    print("\nNext steps:")
    print("  1. Start FAISS server: python ai/main_faiss.py")
    print("  2. Test search: curl http://localhost:8004/health")
    print("=" * 70)

if __name__ == "__main__":
    main()
