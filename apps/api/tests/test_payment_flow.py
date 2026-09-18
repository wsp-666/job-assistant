import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base
from app.models.models import PaymentOrder, User, UserMembership
from app.services.membership_service import get_active_membership
from app.services.payment_service import (
    cancel_payment_order,
    create_payment_order,
    get_current_order,
    mark_order_paid,
    submit_payment_claim,
)


class PaymentFlowTests(unittest.TestCase):
    def setUp(self):
        self.previous_mode = settings.payment_mode
        self.previous_mock = settings.payment_mock
        settings.payment_mode = "mock"
        settings.payment_mock = True
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
        settings.payment_mode = self.previous_mode
        settings.payment_mock = self.previous_mock

    def add_user(self, nickname: str) -> User:
        user = User(nickname=nickname)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def test_claim_must_precede_admin_confirmation_and_confirmation_is_idempotent(self):
        user = self.add_user("付款测试用户")
        order = create_payment_order(self.db, user, "monthly", "wechat")
        self.assertEqual(get_current_order(self.db, user.id).id, order.id)

        with self.assertRaisesRegex(ValueError, "不能确认收款"):
            mark_order_paid(
                self.db,
                order,
                confirmation_source="admin_manual",
                allowed_statuses=("user_paid",),
            )

        submit_payment_claim(self.db, order, "微信昵称：小林")
        mark_order_paid(
            self.db,
            order,
            confirmation_source="admin_manual",
            allowed_statuses=("user_paid",),
        )
        mark_order_paid(
            self.db,
            order,
            confirmation_source="admin_manual",
            allowed_statuses=("user_paid",),
        )
        self.assertIsNotNone(get_active_membership(self.db, user.id))
        self.assertEqual(self.db.query(UserMembership).filter_by(user_id=user.id).count(), 1)

    def test_pending_order_can_be_cancelled_and_no_longer_blocks_user(self):
        user = self.add_user("取消测试用户")
        order = create_payment_order(self.db, user, "yearly", "alipay")
        cancel_payment_order(self.db, order)
        self.db.refresh(order)
        self.assertEqual(order.status, "cancelled")
        self.assertIsNone(get_current_order(self.db, user.id))
        replacement = create_payment_order(self.db, user, "monthly", "wechat")
        self.assertEqual(replacement.status, "pending")


if __name__ == "__main__":
    unittest.main()
