from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import requests
from bs4 import BeautifulSoup

from .config import SectionConfig

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0 Safari/537.36"
)

BASE_URL = "https://news.naver.com/breakingnews/section/{sid1}/{sid2}"


@dataclass
class Article:
    role: str
    category: str
    title: str
    summary: str
    url: str
    press: Optional[str]
    published_at: str

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "category": self.category,
            "title": self.title,
            "summary": self.summary,
            "url": self.url,
            "press": self.press,
            "published_at": self.published_at,
        }


class NaverBreakingNewsClient:
    def __init__(self, *, session: Optional[requests.Session] = None, delay: float = 0.3):
        self.session = session or requests.Session()
        self.delay = delay

    def fetch_page(
        self,
        role: str,
        section: SectionConfig,
        sid2: str,
        page: int,
        *,
        min_length: int,
        date: Optional[str] = None,
    ) -> List[Article]:
        url = BASE_URL.format(sid1=section.sid1, sid2=sid2)
        params = {"page": page}
        if date:
            params["date"] = date
        headers = {"User-Agent": USER_AGENT}
        response = self.session.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        items = soup.select("ul.sa_list li")
        articles: List[Article] = []
        now = datetime.now(timezone.utc)

        for item in items:
            title_tag = item.select_one("a.sa_text_title strong")
            summary_tag = item.select_one("div.sa_text_lede")
            url_tag = item.select_one("a.sa_text_title")
            press_tag = item.select_one("div.sa_text_press")
            time_tag = item.select_one("div.sa_text_datetime")

            if not title_tag or not url_tag or not summary_tag:
                continue

            title = title_tag.get_text(strip=True)
            summary = summary_tag.get_text(strip=True)
            if not summary or summary.lower() == title.lower() or len(summary) < min_length:
                continue

            link = url_tag["href"]
            press = press_tag.get_text(strip=True) if press_tag else None
            published_at = _parse_datetime(time_tag.get_text(strip=True) if time_tag else "", now)

            articles.append(
                Article(
                    role=role,
                    category=sid2,
                    title=title,
                    summary=summary,
                    url=link,
                    press=press,
                    published_at=published_at,
                )
            )
        if self.delay:
            time.sleep(self.delay)
        return articles


def _parse_datetime(raw: str, now: datetime) -> str:
    raw = raw.strip()
    if not raw:
        return now.isoformat()
    try:
        if "." in raw and ":" in raw:
            # Format like "2025.10.14. 오전 09:12" or "2025.10.14. 09:12"
            cleaned = raw.replace("오전 ", "").replace("오후 ", "")
            dt = datetime.strptime(cleaned, "%Y.%m.%d. %H:%M")
            return dt.replace(tzinfo=timezone.utc).isoformat()
        if raw.endswith("분전"):
            minutes = int(raw.replace("분전", "").strip() or "0")
            return (now - timedelta(minutes=minutes)).isoformat()
        if raw.endswith("시간전"):
            hours = int(raw.replace("시간전", "").strip() or "0")
            return (now - timedelta(hours=hours)).isoformat()
        if raw.endswith("일전"):
            days = int(raw.replace("일전", "").strip() or "0")
            return (now - timedelta(days=days)).isoformat()
    except Exception:
        pass
    return now.isoformat()
