import asyncio

import httpx

from app.services.career_scrapers.runner import scrape_career_source
from app.schemas.schemas import CareerSiteSource

SAMPLES = [
    ("字节跳动", "https://jobs.bytedance.com/campus/position"),
    ("腾讯", "https://careers.tencent.com/zh-cn/search.html"),
    ("知乎", "https://app.mokahr.com/social-recruitment/zhihu/76360"),
    ("三一重工", "https://sany.zhiye.com/campus"),
]


async def main() -> None:
    for company, url in SAMPLES:
        source = CareerSiteSource(
            id="test",
            company=company,
            list_url=url,
            adapter="auto",
            enabled=True,
            keywords=[],
        )
        logs: list[str] = []

        def on_log(msg: str) -> None:
            logs.append(msg)

        jobs, adapter = await scrape_career_source(source, max_jobs=5, on_log=on_log)
        print("===", company, adapter, "jobs", len(jobs))
        for job in jobs[:2]:
            print(" ", job.job_title[:40], "jd_len", len(job.jd_text))
        if not jobs:
            print(" ", logs[-3:])


if __name__ == "__main__":
    asyncio.run(main())
