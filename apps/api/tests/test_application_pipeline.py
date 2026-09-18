import unittest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.models import ApplicationEvent, ApplicationQueue, ApplicationTask, Job
from app.routers.applications import (
    _answer_set_for_job,
    _application_answer_templates,
    _split_resume_sections,
    bulk_delete_application_jobs,
    claim_next_application_task,
    create_application_queue,
    duplicate_application_job,
    save_application_profile,
    update_application_task,
)
from app.schemas.schemas import (
    ApplicationAnswerSet,
    ApplicationBulkDeleteRequest,
    ApplicationProfile,
    ApplicationQueueCreate,
    ApplicationTaskStateUpdate,
    JobPipelineUpdate,
)
from app.services.job_pipeline import apply_job_pipeline_patch


class ApplicationPipelineTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_job(self, title: str, priority: int, score: float) -> Job:
        job = Job(
            platform="career",
            job_title=title,
            company="示例公司",
            job_url=f"https://jobs.example.com/{title}",
            priority=priority,
            match_score=score,
            status="pending",
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def test_pipeline_status_synchronizes_legacy_fields_and_records_history(self):
        job = self.add_job("AI 应用开发", 3, 90)
        apply_job_pipeline_patch(
            self.db,
            job,
            JobPipelineUpdate(
                status="offer",
                priority=1,
                application_tags=["AI", "校招", "AI"],
                event_note="通过终面",
            ),
        )
        self.db.commit()

        self.assertEqual(job.status, "offer")
        self.assertEqual(job.priority, 1)
        self.assertTrue(job.has_applied_resume)
        self.assertEqual(job.offer_status, "received")
        self.assertIsNotNone(job.applied_at)
        events = self.db.query(ApplicationEvent).filter_by(job_id=job.id).all()
        self.assertTrue(any(row.event_type == "status_changed" for row in events))
        self.assertTrue(any(row.event_type == "details_updated" for row in events))

    def test_pipeline_allows_editing_reference_table_fields(self):
        job = self.add_job("旧职位", 3, 80)
        apply_job_pipeline_patch(
            self.db,
            job,
            JobPipelineUpdate(
                company="新公司",
                job_title="新职位",
                job_url="https://jobs.example.com/new",
                city="深圳",
                job_category="秋招",
                written_test_status="是",
                interview_stage="AI面",
            ),
        )
        self.db.commit()

        self.assertEqual(job.company, "新公司")
        self.assertEqual(job.job_title, "新职位")
        self.assertEqual(job.job_url, "https://jobs.example.com/new")
        self.assertEqual(job.city, "深圳")
        self.assertEqual(job.job_category, "秋招")
        self.assertEqual(job.written_test_status, "是")
        self.assertEqual(job.interview_stage, "AI面")

    def test_queue_is_priority_ordered_and_success_updates_job(self):
        low = self.add_job("低优先级", 3, 99)
        high = self.add_job("高优先级", 1, 80)
        queue_out = create_application_queue(
            ApplicationQueueCreate(max_count=10, max_priority=4),
            self.db,
        )
        self.assertEqual([task.job_id for task in queue_out.tasks], [high.id, low.id])

        claimed = claim_next_application_task(queue_out.id, self.db)
        self.assertIsNotNone(claimed.task)
        self.assertEqual(claimed.task.job_id, high.id)
        update_application_task(
            claimed.task.id,
            ApplicationTaskStateUpdate(status="filling", message="填写中"),
            self.db,
        )
        update_application_task(
            claimed.task.id,
            ApplicationTaskStateUpdate(status="submitting", message="提交中"),
            self.db,
        )
        finished = update_application_task(
            claimed.task.id,
            ApplicationTaskStateUpdate(status="succeeded", message="已提交"),
            self.db,
        )
        self.assertEqual(finished.succeeded, 1)
        self.db.refresh(high)
        self.assertEqual(high.status, "applied")

    def test_profile_uses_answers_from_selected_direction_set(self):
        profile = save_application_profile(
            ApplicationProfile(
                full_name="测试用户",
                custom_fields={"常住地": "重庆"},
                answer_sets=[
                    ApplicationAnswerSet(
                        id="java",
                        name="Java后端问答",
                        job_category="Java后端",
                        answers={"为什么选择我们": "希望把政企项目经验用于真实业务交付"},
                    )
                ],
                active_answer_set_id="java",
            ),
            self.db,
        )
        self.assertEqual(profile.effective_custom_fields["常住地"], "重庆")
        self.assertIn("政企项目经验", profile.effective_custom_fields["为什么选择我们"])

    def test_resume_sections_do_not_leak_awards_into_projects(self):
        projects, sections = _split_resume_sections(
            "渔见智能平台\n负责接口开发与联调。\n\n荣誉奖项\n蓝桥杯省级三等奖\n\n语言能力\nCET-4 514分"
        )
        self.assertIn("渔见智能平台", projects)
        self.assertNotIn("蓝桥杯", projects)
        self.assertEqual(sections["awards"], "蓝桥杯省级三等奖")
        self.assertEqual(sections["language_ability"], "CET-4 514分")

    def test_job_documents_are_loaded_and_selected_by_job_direction(self):
        templates = _application_answer_templates()
        self.assertEqual(len(templates), 15)
        java_template = next(item for item in templates if "Java" in item["job_category"])
        self.assertIn("实习经历", java_template["answers"])
        self.assertIn("项目经历", java_template["answers"])
        self.assertIn("实习经历（完整版）", java_template["answers"])
        self.assertIn("项目经历（完整版）", java_template["answers"])
        self.assertIn("实习经历（精简版）", java_template["answers"])
        self.assertIn("项目经历（精简版）", java_template["answers"])

        profile = ApplicationProfile(
            answer_sets=[ApplicationAnswerSet(**{
                key: value for key, value in item.items() if key != "resume_hint"
            }) for item in templates]
        )
        selected = _answer_set_for_job(profile, "Java后端开发工程师")
        self.assertIsNotNone(selected)
        self.assertIn("Java", selected.job_category)
        selected = _answer_set_for_job(profile, "AI FDE 应用交付工程师")
        self.assertIsNotNone(selected)
        self.assertIn("AI", selected.job_category)

    def test_confirmed_government_counterpart_fact_is_present_in_all_direction_materials(self):
        templates = _application_answer_templates()
        self.assertEqual(len(templates), 15)
        for template in templates:
            answers = template["answers"]
            self.assertIn("甲方政府部门负责人", answers["实习经历"])
            self.assertIn("20余项", answers["实习经历（完整版）"])
            self.assertIn("2套原型、4个后台页面", answers["实习经历（完整版）"])

    def test_bulk_delete_removes_selected_jobs(self):
        first = self.add_job("Java后端", 1, 90)
        second = self.add_job("售前解决方案", 2, 85)
        result = bulk_delete_application_jobs(
            ApplicationBulkDeleteRequest(job_ids=[first.id, second.id]),
            self.db,
        )
        self.assertEqual(result.deleted, 2)
        self.assertEqual(self.db.query(Job).count(), 0)

    def test_duplicate_application_job_copies_workspace_fields(self):
        source = self.add_job("网络安全售前", 2, 88)
        source.city = "北京"
        source.job_category = "网络安全售前"
        source.status = "interview"
        source.offer_status = "pending"
        source.written_test_status = "是"
        source.assessment_status = "已测评"
        source.interview_stage = "二面"
        source.application_notes = "等待业务面试"
        source.application_tags_json = '["重点"]'
        source.applied_at = datetime(2026, 9, 14)
        self.db.commit()

        copied = duplicate_application_job(source.id, self.db)

        self.assertNotEqual(copied.id, source.id)
        for field in (
            "company",
            "job_title",
            "job_url",
            "city",
            "job_category",
            "status",
            "offer_status",
            "written_test_status",
            "assessment_status",
            "interview_stage",
            "application_notes",
            "applied_at",
        ):
            self.assertEqual(getattr(copied, field), getattr(source, field))
        self.assertEqual(copied.application_tags, ["重点"])


if __name__ == "__main__":
    unittest.main()
