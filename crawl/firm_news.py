from __future__ import annotations

from typing import List

from .utils import NewsItem, fetch_rss_feed, dedupe_by_title, filter_by_keywords, filter_informative

FIRM_SOURCES = [
    ("조선비즈 증권", "https://biz.chosun.com/arc/outboundfeeds/rss/category/stock/?outputType=xml"),
    ("조선비즈 금융", "https://biz.chosun.com/arc/outboundfeeds/rss/category/finance/?outputType=xml"),
]


def fetch_firm_news(limit_per_source: int = 5) -> List[NewsItem]:
    items: List[NewsItem] = []
    for source_name, url in FIRM_SOURCES:
        try:
            items.extend(
                fetch_rss_feed(
                    role="firm",
                    source_name=source_name,
                    url=url,
                    limit=limit_per_source,
                )
            )
        except Exception as exc:
            from logging import getLogger

            logger = getLogger(__name__)
            logger.warning("firm source '%s' failed: %s", source_name, exc)
    filtered = filter_by_keywords(
        dedupe_by_title(items),
        keywords=[
            "주가",
            "증시",
            "주식",
            "ipo",
            "상장",
            "실적",
            "투자",
            "산업",
            "기업",
            "수주",
            "매출",
            "영업이익",
        ],
    )
    informative = filter_informative(filtered)
    return informative or filtered
