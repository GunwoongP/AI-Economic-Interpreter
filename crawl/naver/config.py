from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class SectionConfig:
    sid1: str
    sid2_list: List[str]
    min_length: int = 120
    label: str | None = None  # optional descriptive label


ROLE_SECTIONS: Dict[str, SectionConfig] = {
    "eco": SectionConfig(
        sid1="101",
        sid2_list=["259", "262", "263"],
        min_length=80,
        label="경제/거시",
    ),
    "firm": SectionConfig(
        sid1="101",
        sid2_list=["258", "261"],
        min_length=80,
        label="기업/증시",
    ),
    "house": SectionConfig(
        sid1="101",
        sid2_list=["260", "771"],
        min_length=80,
        label="부동산/가계",
    ),
}
