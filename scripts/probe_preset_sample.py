"""抽样检测内置 zhiye 预设可访问性与校招抓取条数。"""
import asyncio
import json
from pathlib import Path

import httpx

from app.schemas.schemas import CareerSiteSource
from app.services.career_scrapers.runner import scrape_career_source

PRESETS = Path(__file__).resolve().parents[1] / "apps" / "api" / "app" / "data" / "career_presets.json"


async def main() -> None:
    presets = json.loads(PRESETS.read_text(encoding="utf-8"))
    zhiye = [p for p in presets if "zhiye.com" in (p.get("list_url") or "").lower()]
    sample = zhiye[:15]

    ok_http = 0
    with_jobs = 0
    total_jobs = 0

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        for p in sample:
            url = p["list_url"]
            try:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                http_ok = r.status_code < 400 and len(r.text) > 500
            except Exception:
                http_ok = False
            if http_ok:
                ok_http += 1

            source = CareerSiteSource(
                id="t",
                company=p.get("company", ""),
                list_url=url,
                adapter="auto",
                enabled=True,
                keywords=[],
            )
            jobs, adapter = await scrape_career_source(source, max_jobs=10)
            n = len(jobs)
            if n:
                with_jobs += 1
                total_jobs += n
            print(f"{p.get('company','?'):12} http={http_ok} jobs={n:2} adapter={adapter}")

    print(f"\n样本 {len(sample)} 家 zhiye：HTTP 可访问 {ok_http}，有岗位 {with_jobs}，共 {total_jobs} 条")


if __name__ == "__main__":
    asyncio.run(main())
