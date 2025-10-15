"""
News crawling utilities for building the RAG dataset.

Each crawler returns a list of dictionaries adhering to the schema:
{
    "role": "eco|firm|house",
    "source": "<human readable source>",
    "title": "<headline>",
    "summary": "<clean text summary>",
    "url": "<origin url>",
    "published_at": "<ISO-8601 timestamp>",
    "tags": ["optional", "keywords"]
}
"""

from .eco_news import fetch_eco_news  # noqa: F401
from .firm_news import fetch_firm_news  # noqa: F401
from .house_news import fetch_house_news  # noqa: F401
from .utils import NewsItem, to_dicts  # noqa: F401

