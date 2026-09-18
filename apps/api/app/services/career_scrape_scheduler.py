import asyncio
import logging

logger = logging.getLogger(__name__)

_scheduler_task: asyncio.Task | None = None


async def _career_scrape_loop() -> None:
    from app.routers.career_sites import run_scheduled_career_scrape

    await asyncio.sleep(30)
    while True:
        try:
            await run_scheduled_career_scrape()
        except Exception:
            logger.exception("定时官网招聘抓取失败")
        await asyncio.sleep(3600)


def start_career_scrape_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        return
    _scheduler_task = asyncio.create_task(_career_scrape_loop())
