import unittest
from collections import defaultdict

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.models import Job, JobLibraryCompanyRule, JobLibraryEntry
from app.services.job_library import list_library, set_entries_hidden, track_library_item


class JobLibraryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add_all([
            JobLibraryEntry(
                source_key="progress:1",
                collection="progress",
                source_sheet="优先投递",
                source_row=5,
                recommendation_level="核心推荐",
                company="示例科技",
                job_title="Java开发工程师",
                target_direction="Java后端开发",
                application_url="https://example.com/apply/java",
            ),
            JobLibraryEntry(
                source_key="all:2",
                collection="all",
                source_sheet="校招总表",
                source_row=2,
                recommendation_level="总库",
                company="示例科技",
                job_title="Java开发工程师",
                application_url="https://example.com/apply/java",
            ),
            JobLibraryEntry(
                source_key="all:3",
                collection="all",
                source_sheet="校招总表",
                source_row=3,
                recommendation_level="总库",
                company="示例科技",
                job_title="解决方案工程师",
                application_url="https://example.com/apply/solution",
            ),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_lists_two_scopes_and_tracks_each_position_separately(self):
        recommended = list_library(self.db, scope="progress", page=1, page_size=10)
        full = list_library(self.db, scope="all", page=1, page_size=10)
        self.assertEqual(recommended["total"], 1)
        self.assertGreater(full["total"], recommended["total"])
        self.assertEqual(full["companies"], [])
        self.assertEqual(
            list_library(self.db, scope="all", company="示例", page=1, page_size=10)["total"],
            2,
        )

        first = recommended["items"][0]
        job = track_library_item(self.db, scope="progress", item_id=first["id"])
        self.assertEqual(job.company, first["company"])
        self.assertEqual(job.job_title, first["job_title"])
        self.assertEqual(job.status, "ready")
        self.assertEqual(self.db.query(Job).count(), 1)

        same = track_library_item(self.db, scope="progress", item_id=first["id"])
        self.assertEqual(same.id, job.id)
        self.assertEqual(self.db.query(Job).count(), 1)

        grouped = defaultdict(list)
        for item in list_library(self.db, scope="all", page=1, page_size=1000)["items"]:
            grouped[item["company"]].append(item)
        pair = next(
            rows for rows in grouped.values()
            if len({row["job_title"] for row in rows}) >= 2
        )
        distinct = []
        seen_titles = set()
        for item in pair:
            if item["job_title"] not in seen_titles:
                seen_titles.add(item["job_title"])
                distinct.append(item)
            if len(distinct) == 2:
                break
        before = self.db.query(Job).count()
        track_library_item(self.db, scope="all", item_id=distinct[0]["id"])
        track_library_item(self.db, scope="all", item_id=distinct[1]["id"])
        self.assertEqual(self.db.query(Job).count(), before + 1)

    def test_mark_applied_hides_every_job_from_the_same_company(self):
        job = track_library_item(
            self.db,
            scope="progress",
            item_id="progress:1",
            mark_applied=True,
        )

        self.assertEqual(job.status, "applied")
        self.assertEqual(
            list_library(self.db, scope="progress", page=1, page_size=10)["total"],
            0,
        )
        visible_full = list_library(self.db, scope="all", page=1, page_size=10)
        self.assertEqual(visible_full["total"], 0)

        hidden_full = list_library(
            self.db,
            scope="all",
            show_hidden=True,
            page=1,
            page_size=10,
        )
        self.assertEqual(hidden_full["total"], 2)
        self.assertTrue(all(item["hidden"] for item in hidden_full["items"]))
        applied_item = next(item for item in hidden_full["items"] if item["job_title"] == "Java开发工程师")
        self.assertEqual(applied_item["tracked_status"], "applied")

    def test_manual_hide_is_company_wide_and_survives_new_library_rows(self):
        result = set_entries_hidden(self.db, ["all:3"], True)

        self.assertEqual(result, {"requested": 1, "updated": 3})
        self.assertEqual(list_library(self.db, scope="progress", page=1, page_size=10)["total"], 0)
        self.assertEqual(list_library(self.db, scope="all", page=1, page_size=10)["total"], 0)

        # A later library refresh can replace the rows, but the company rule remains.
        self.db.query(JobLibraryEntry).delete(synchronize_session=False)
        self.db.add(JobLibraryEntry(
            source_key="all:new",
            collection="all",
            source_sheet="校招总表",
            source_row=99,
            company="示例科技",
            job_title="新岗位",
            application_url="https://example.com/apply/new",
        ))
        self.db.add(JobLibraryEntry(
            source_key="all:other-company",
            collection="all",
            source_sheet="校招总表",
            source_row=100,
            company="另一家公司",
            job_title="其他岗位",
            application_url="https://example.com/apply/other",
        ))
        self.db.commit()

        visible = list_library(self.db, scope="all", page=1, page_size=10)
        self.assertEqual(visible["total"], 1)
        self.assertEqual(visible["items"][0]["company"], "另一家公司")

        hidden = list_library(self.db, scope="all", show_hidden=True, page=1, page_size=10)
        blocked = next(item for item in hidden["items"] if item["company"] == "示例科技")
        self.assertTrue(blocked["hidden"])

    def test_existing_applied_job_hides_same_company_but_not_similar_company_name(self):
        self.db.add(Job(company="示例科技", job_title="产品经理", status="applied", job_url="https://example.com/product"))
        self.db.add(JobLibraryEntry(
            source_key="all:similar-company",
            collection="all",
            source_sheet="校招总表",
            source_row=101,
            company="示例科技集团",
            job_title="产品经理",
            application_url="https://example.com/apply/group",
        ))
        self.db.commit()

        visible = list_library(self.db, scope="all", page=1, page_size=10)
        self.assertEqual(visible["total"], 1)
        self.assertEqual(visible["items"][0]["company"], "示例科技集团")

    def test_existing_applied_source_status_hides_company_and_survives_refresh(self):
        self.db.query(JobLibraryEntry).filter(JobLibraryEntry.source_key == "all:2").update(
            {JobLibraryEntry.source_status: "已投递"},
            synchronize_session=False,
        )
        self.db.commit()

        visible = list_library(self.db, scope="all", page=1, page_size=10)
        self.assertEqual(visible["total"], 0)

        # This mirrors the startup migration before a later library import.
        self.db.add(JobLibraryCompanyRule(company="示例科技", applied=True))
        self.db.commit()

        self.db.query(JobLibraryEntry).delete(synchronize_session=False)
        self.db.add(JobLibraryEntry(
            source_key="all:refreshed",
            collection="all",
            source_sheet="校招总表",
            source_row=102,
            company="示例科技",
            job_title="新投递岗位",
            application_url="https://example.com/apply/refreshed",
        ))
        self.db.commit()

        self.assertEqual(list_library(self.db, scope="all", page=1, page_size=10)["total"], 0)


if __name__ == "__main__":
    unittest.main()
