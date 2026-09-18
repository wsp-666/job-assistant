"""验证所有 zhiye 预设能否抓到校招岗位，输出精选 ID 列表。"""
import asyncio
import json
from pathlib import Path

from app.schemas.schemas import CareerSiteSource
from app.services.career_scrapers.runner import scrape_career_source

PRESETS = Path(__file__).resolve().parents[1] / "apps" / "api" / "app" / "data" / "career_presets.json"


async def probe_one(preset: dict) -> tuple[str, int, str]:
    source = CareerSiteSource(
        id=preset["id"],
        company=preset["company"],
        list_url=preset["list_url"],
        adapter="auto",
        enabled=True,
        keywords=[],
    )
    try:
        jobs, adapter = await scrape_career_source(source, max_jobs=5)
        return preset["id"], len(jobs), adapter
    except Exception as exc:
        return preset["id"], -1, str(exc)[:40]


async def main() -> None:
    presets = json.loads(PRESETS.read_text(encoding="utf-8"))
    zhiye = [p for p in presets if "zhiye.com" in (p.get("list_url") or "").lower()]
    print(f"probing {len(zhiye)} zhiye presets…")

    good: list[str] = []
    for i, p in enumerate(zhiye, 1):
        pid, n, adapter = await probe_one(p)
        mark = "OK" if n > 0 else "—"
        if n > 0:
            good.append(pid)
        print(f"[{i}/{len(zhiye)}] {mark} {p['company']:12} jobs={n} {adapter}")
        await asyncio.sleep(0.3)

    print(f"\nverified ({len(good)}):", json.dumps(good, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
