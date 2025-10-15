from __future__ import annotations

from typing import List

from .utils import NewsItem, fetch_rss_feed, dedupe_by_title, filter_by_keywords, filter_informative

HOUSE_SOURCES = [
    ("조선비즈 부동산", "https://biz.chosun.com/arc/outboundfeeds/rss/category/real_estate/?outputType=xml"),
    ("한국경제 부동산", "https://www.hankyung.com/feed/realestate"),
]


def fetch_house_news(limit_per_source: int = 5) -> List[NewsItem]:
    items: List[NewsItem] = []
    for source_name, url in HOUSE_SOURCES:
        try:
            items.extend(
                fetch_rss_feed(
                    role="house",
                    source_name=source_name,
                    url=url,
                    limit=limit_per_source,
                )
            )
        except Exception as exc:
            from logging import getLogger

            logger = getLogger(__name__)
            logger.warning("house source '%s' failed: %s", source_name, exc)
    filtered = filter_by_keywords(
        dedupe_by_title(items),
        keywords=[
            "부동산",
            "주택",
            "전세",
            "월세",
            "가계",
            "대출",
            "모기지",
            "청약",
            "주거",
            "임대",
        ],
    )
    informative = filter_informative(filtered)
    return informative or filtered
