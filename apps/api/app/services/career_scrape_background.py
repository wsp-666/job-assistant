from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.database import SessionLocal
from app.schemas.schemas import CareerScrapeRequest
from app.services.career_sites_store import load_career_site_config

MAX_BACKGROUND_LOGS = 800


class CareerScrapeBackground:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.running = False
        self.task_id = ""
        self.started_at: str | None = None
        self.finished_at: str | None = None
        self.total = 0
        self.completed = 0
        self.current_company = ""
        self.logs: list[str] = []
        self.summary = ""
        self.total_created = 0
        self.total_updated = 0
        self.total_fetched = 0
        self.error = ""

    def _append_log(self, line: str) -> None:
        self.logs.append(line)
        if len(self.logs) > MAX_BACKGROUND_LOGS:
            self.logs = self.logs[-MAX_BACKGROUND_LOGS:]

    def snapshot(self) -> dict[str, Any]:
        return {
            "running": self.running,
            "task_id": self.task_id,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "total": self.total,
            "completed": self.completed,
            "current_company": self.current_company,
            "logs": list(self.logs),
            "summary": self.summary,
            "total_created": self.total_created,
            "total_updated": self.total_updated,
            "total_fetched": self.total_fetched,
            "error": self.error,
        }

    def start(self, payload: CareerScrapeRequest) -> dict[str, Any]:
        if self.running:
            return self.snapshot()

        self.reset()
        self.running = True
        self.task_id = uuid4().hex[:12]
        self.started_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

        import asyncio

        asyncio.create_task(self._run(payload))
        self._append_log("后台抓取任务已启动，可自由切换页面")
        return self.snapshot()

    async def _run(self, payload: CareerScrapeRequest) -> None:
        from app.routers.career_sites import _scrape_one_source

        db = SessionLocal()
        try:
            config = load_career_site_config(db)
            targets = config.sources
            if payload.source_id:
                targets = [item for item in targets if item.id == payload.source_id]
            else:
                targets = [item for item in targets if item.enabled]

            self.total = len(targets)
            self._append_log(f"共 {self.total} 家招聘源待抓取")

            for index, source in enumerate(targets, 1):
                self.current_company = source.company
                self._append_log(f"({index}/{self.total}) {source.company}")
                try:
                    result = await _scrape_one_source(db, source, payload.max_jobs)
                    self.total_created += result.created
                    self.total_updated += result.updated
                    self.total_fetched += result.fetched
                    self._append_log(result.message)
                    for line in result.logs[-6:]:
                        if line not in self.logs[-12:]:
                            self._append_log(f"  {line}")
                except Exception as exc:
                    self._append_log(f"  失败：{exc}")
                finally:
                    self.completed = index

            self.summary = (
                f"抓取完成：{self.completed}/{self.total} 家，"
                f"新增 {self.total_created}，更新 {self.total_updated}，"
                f"有效岗位 {self.total_fetched} 条"
            )
            self._append_log(self.summary)
        except Exception as exc:
            self.error = str(exc)
            self._append_log(f"任务异常结束：{exc}")
        finally:
            db.close()
            self.running = False
            self.current_company = ""
            self.finished_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()


background_scrape = CareerScrapeBackground()
