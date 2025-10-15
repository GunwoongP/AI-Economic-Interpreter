from __future__ import annotations

from typing import List

from .utils import NewsItem, fetch_rss_feed, dedupe_by_title, filter_by_keywords, filter_informative

ECO_SOURCES = [
    ("조선비즈 경제", "https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml"),
    ("한국경제 경제", "https://www.hankyung.com/feed/economy"),
]


def fetch_eco_news(limit_per_source: int = 5) -> List[NewsItem]:
    items: List[NewsItem] = []
    for source_name, url in ECO_SOURCES:
        try:
            items.extend(
                fetch_rss_feed(role="eco", source_name=source_name, url=url, limit=limit_per_source)
            )
        except Exception as exc:
            # Skip failing sources but continue crawling others.
            from logging import getLogger

            logger = getLogger(__name__)
            logger.warning("eco source '%s' failed: %s", source_name, exc)
    filtered = filter_by_keywords(
        dedupe_by_title(items),
        keywords=[
            "경제",
            "금리",
            "환율",
            "물가",
            "경기",
            "성장",
            "무역",
            "수출",
            "수입",
            "정책",
            "gdp",
        ],
        exclude_keywords=["부동산", "아파트", "주택"],
    )
    informative = filter_informative(filtered)
    return informative or filtered
