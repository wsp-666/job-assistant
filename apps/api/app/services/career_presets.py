"""规模企业招聘官网精选预设（仅保留实测可抓校招的北森源，其余请手动添加）。"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "career_presets.json"


@dataclass(frozen=True)
class CareerSitePreset:
    id: str
    company: str
    list_url: str
    adapter: str
    category: str
    keywords: tuple[str, ...] = ()
    note: str = ""


def _parse_item(raw: dict) -> CareerSitePreset:
    return CareerSitePreset(
        id=str(raw["id"]),
        company=str(raw["company"]),
        list_url=str(raw["list_url"]),
        adapter=str(raw.get("adapter", "auto")),
        category=str(raw.get("category", "其他")),
        keywords=tuple(raw.get("keywords", [])),
        note=str(raw.get("note", "")),
    )


@lru_cache(maxsize=1)
def load_career_presets() -> list[CareerSitePreset]:
    if not _DATA_FILE.is_file():
        return []
    data = json.loads(_DATA_FILE.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return []
    items: list[CareerSitePreset] = []
    seen_ids: set[str] = set()
    for raw in data:
        if not isinstance(raw, dict) or not raw.get("id") or not raw.get("company"):
            continue
        preset = _parse_item(raw)
        if preset.id in seen_ids:
            continue
        seen_ids.add(preset.id)
        items.append(preset)
    return items


# 兼容旧引用
CAREER_SITE_PRESETS: list[CareerSitePreset] = load_career_presets()


def get_preset_by_id(preset_id: str) -> CareerSitePreset | None:
    for preset in load_career_presets():
        if preset.id == preset_id:
            return preset
    return None


def list_presets(category: str | None = None) -> list[CareerSitePreset]:
    items = load_career_presets()
    if not category:
        return items
    return [item for item in items if item.category == category]


def list_categories() -> list[str]:
    cats = sorted({item.category for item in load_career_presets() if item.category})
    return cats
