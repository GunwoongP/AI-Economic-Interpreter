from __future__ import annotations

import logging
import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Iterable, List, Optional
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
import html

import requests

logger = logging.getLogger(__name__)

USER_AGENT = (
    "EcoMentosCrawler/1.0 (+https://github.com/eco-mentos)"
)


@dataclass
class NewsItem:
    role: str
    source: str
    title: str
    summary: str
    url: str
    published_at: str
    tags: List[str]

    def to_dict(self) -> dict:
        return asdict(self)


def _clean_text(value: str, *, max_len: int = 600) -> str:
    if not value:
        return ""
    # Remove HTML tags and entities.
    text = html.unescape(value)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        text = text[: max_len - 1].rstrip() + "…"
    return text


def _normalize_datetime(value: Optional[str]) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    try:
        dt = parsedate_to_datetime(value)
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        logger.debug("Failed to parse pubDate '%s'", value, exc_info=True)
        return datetime.now(timezone.utc).isoformat()


def fetch_rss_feed(
    *,
    role: str,
    source_name: str,
    url: str,
    limit: int = 10,
    session: Optional[requests.Session] = None,
    timeout: float = 10.0,
) -> List[NewsItem]:
    headers = {"User-Agent": USER_AGENT}
    sess = session or requests.Session()
    logger.info("Fetching RSS feed '%s' (%s)", source_name, url)
    response = sess.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    try:
        root = ET.fromstring(response.content)
    except ET.ParseError as exc:
        raise ValueError(f"Failed to parse RSS feed: {url}") from exc

    items: List[NewsItem] = []
    channel = root.find("channel")
    node_iter: Iterable[ET.Element]
    if channel is not None:
        node_iter = channel.findall("item")
    else:
        node_iter = root.findall(".//item")

    for node in node_iter:
        title = _clean_text(_get_child_text(node, "title"))
        link = (_get_child_text(node, "link") or "").strip()
        description = _clean_text(_get_child_text(node, "description"))
        if not description:
            description = _clean_text(_get_child_text(node, "{http://purl.org/rss/1.0/modules/content/}encoded"))
        if not description or description == title:
            summary_candidates = []
            summary_candidates.extend(_extract_text_blocks(node))
            for candidate in summary_candidates:
                cleaned = _clean_text(candidate)
                if cleaned and cleaned.lower() != title.lower():
                    description = cleaned
                    break
        if not description or description.lower().startswith("http") or len(description) < 40:
            description = title
        pub_date = _normalize_datetime(_get_child_text(node, "pubDate"))
        if not title:
            continue
        if not link:
            link = url
        host = urlparse(link).netloc or urlparse(url).netloc
        tags = []
        for tag_node in node.findall("category"):
            tag_text = _clean_text(tag_node.text or "")
            if tag_text:
                tags.append(tag_text)
        item = NewsItem(
            role=role,
            source=source_name or host,
            title=title,
            summary=description or title,
            url=link,
            published_at=pub_date,
            tags=tags,
        )
        items.append(item)
        if limit and len(items) >= limit:
            break
    return items


def _get_child_text(node: ET.Element, tag_name: str) -> str:
    if tag_name.startswith("{"):
        child = node.find(tag_name)
    else:
        child = node.find(tag_name)
    return child.text.strip() if child is not None and child.text else ""


def _extract_text_blocks(node: ET.Element) -> List[str]:
    blocks: List[str] = []
    for child in node:
        if child.text:
            blocks.append(child.text)
        if child.tail:
            blocks.append(child.tail)
    return blocks


def dedupe_by_title(items: List[NewsItem]) -> List[NewsItem]:
    seen = set()
    unique: List[NewsItem] = []
    for item in items:
        key = item.title.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def filter_by_keywords(
    items: List[NewsItem],
    keywords: List[str],
    exclude_keywords: Optional[List[str]] = None,
) -> List[NewsItem]:
    if not keywords and not exclude_keywords:
        return items
    lowered_keywords = [kw.lower() for kw in keywords]
    lowered_excludes = [kw.lower() for kw in (exclude_keywords or [])]
    filtered: List[NewsItem] = []
    for item in items:
        haystack = f"{item.title} {item.summary}".lower()
        if lowered_keywords and not any(keyword in haystack for keyword in lowered_keywords):
            continue
        if lowered_excludes and any(ex_kw in haystack for ex_kw in lowered_excludes):
            continue
        filtered.append(item)
    # If filtering removes everything, fall back to original list.
    return filtered or items


def filter_informative(items: List[NewsItem], min_length: int = 80) -> List[NewsItem]:
    result = [item for item in items if len(item.summary or "") >= min_length and item.summary.lower() != item.title.lower()]
    return result


def to_dicts(items: Iterable[NewsItem]) -> List[dict]:
    return [item.to_dict() for item in items]
