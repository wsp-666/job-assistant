from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utc_now
from app.models.models import PaymentOrder, User
from app.services.membership_plans import MEMBERSHIP_PLANS, PLAN_LABELS
from app.services.membership_service import get_active_membership, grant_membership
from app.services.payment_qr_service import personal_qr_enabled, qr_public_url

ORDER_TTL_MINUTES = 30
_RENEWAL_WINDOW_DAYS = 7
OPEN_ORDER_STATUSES = ("pending", "user_paid")
FINAL_ORDER_STATUSES = ("paid", "cancelled", "expired", "rejected")


def expire_stale_orders(db: Session, user_id: int | None = None) -> int:
    """Lazy expiry keeps order state correct without a separate scheduler."""
    now = utc_now()
    legacy_cutoff = now - timedelta(minutes=ORDER_TTL_MINUTES)
    query = db.query(PaymentOrder).filter(
        PaymentOrder.status == "pending",
        or_(
            PaymentOrder.expires_at < now,
            and_(PaymentOrder.expires_at.is_(None), PaymentOrder.created_at < legacy_cutoff),
        ),
    )
    if user_id is not None:
        query = query.filter(PaymentOrder.user_id == user_id)
    rows = query.all()
    for row in rows:
        row.status = "expired"
        row.cancelled_at = now
        row.admin_note = "订单超时未付款，系统自动关闭"
        row.updated_at = now
    if rows:
        db.commit()
    return len(rows)


def validate_payment_configuration(pay_channel: str) -> None:
    if pay_channel not in ("wechat", "alipay"):
        raise ValueError("无效支付渠道")
    if settings.payment_mode == "mock":
        if not settings.payment_mock:
            raise ValueError("模拟支付未启用")
        return
    if settings.payment_mode == "personal_qr":
        if not personal_qr_enabled() or not qr_public_url(pay_channel):
            label = "微信" if pay_channel == "wechat" else "支付宝"
            raise ValueError(f"管理员尚未上传{label}收款码，暂时无法创建订单")
        return
    raise ValueError("商户支付尚未接入官方下单与异步回调，请先使用个人收款码模式")


def _assert_can_create_order(db: Session, user: User, plan: str) -> None:
    expire_stale_orders(db, user.id)
    pending = (
        db.query(PaymentOrder)
        .filter(
            PaymentOrder.user_id == user.id,
            PaymentOrder.status.in_(OPEN_ORDER_STATUSES),
        )
        .order_by(PaymentOrder.id.desc())
        .first()
    )
    if pending:
        action = "完成支付" if pending.status == "pending" else "等待管理员核验"
        raise ValueError(f"您已有待处理订单 {pending.out_trade_no}，请先{action}")

    active = get_active_membership(db, user.id)
    if not active:
        return
    if active.expires_at is None:
        raise ValueError(f"您已是{PLAN_LABELS.get(active.plan, '会员')}，无需重复购买")

    days_left = (active.expires_at - utc_now()).days
    if days_left > _RENEWAL_WINDOW_DAYS:
        expires_text = active.expires_at.strftime("%Y-%m-%d")
        raise ValueError(
            f"您已是{PLAN_LABELS.get(active.plan, '会员')}（{expires_text} 到期），"
            f"到期前 {_RENEWAL_WINDOW_DAYS} 天内可续费"
        )


def create_payment_order(db: Session, user: User, plan: str, pay_channel: str) -> PaymentOrder:
    if plan not in MEMBERSHIP_PLANS:
        raise ValueError("无效套餐")
    validate_payment_configuration(pay_channel)
    _assert_can_create_order(db, user, plan)

    now = utc_now()
    cfg = MEMBERSHIP_PLANS[plan]
    order = PaymentOrder(
        user_id=user.id,
        out_trade_no=f"JA{now.strftime('%Y%m%d%H%M%S')}{uuid4().hex[:8].upper()}",
        plan=plan,
        amount_cents=int(cfg["price_cents"]),
        pay_channel=pay_channel,
        status="pending",
        expires_at=now + timedelta(minutes=ORDER_TTL_MINUTES),
        updated_at=now,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def get_current_order(db: Session, user_id: int) -> PaymentOrder | None:
    expire_stale_orders(db, user_id)
    return (
        db.query(PaymentOrder)
        .filter(PaymentOrder.user_id == user_id, PaymentOrder.status.in_(OPEN_ORDER_STATUSES))
        .order_by(PaymentOrder.id.desc())
        .first()
    )


def build_order_payment_payload(order: PaymentOrder) -> dict[str, Any]:
    if settings.payment_mode == "mock" and settings.payment_mock:
        return {
            "mock": True,
            "message": "开发模式：确认后可模拟支付成功，不会发起真实扣款。",
        }
    return {
        "mock": False,
        "qr_url": qr_public_url(order.pay_channel),
        "message": (
            f"请用{'微信' if order.pay_channel == 'wechat' else '支付宝'}扫码支付 "
            f"¥{order.amount_cents / 100:.2f}，付款备注填写订单号 {order.out_trade_no}。"
            "支付完成后填写付款昵称或手机号后四位，提交管理员核验。"
        ),
    }


async def build_wechat_native_pay(order: PaymentOrder) -> dict[str, Any]:
    return build_order_payment_payload(order)


async def build_alipay_page_pay(order: PaymentOrder) -> dict[str, Any]:
    return build_order_payment_payload(order)


def submit_payment_claim(db: Session, order: PaymentOrder, payer_remark: str) -> None:
    expire_stale_orders(db, order.user_id)
    db.refresh(order)
    if order.status == "user_paid":
        return
    if order.status != "pending":
        raise ValueError("订单已关闭，无法提交付款信息")
    now = utc_now()
    order.status = "user_paid"
    order.payer_remark = payer_remark.strip()
    order.submitted_at = now
    order.updated_at = now
    db.commit()


def cancel_payment_order(db: Session, order: PaymentOrder) -> None:
    if order.status == "cancelled":
        return
    if order.status != "pending":
        raise ValueError("仅待付款订单可以取消")
    now = utc_now()
    order.status = "cancelled"
    order.cancelled_at = now
    order.updated_at = now
    db.commit()


def mark_order_paid(
    db: Session,
    order: PaymentOrder,
    *,
    confirmation_source: str,
    allowed_statuses: tuple[str, ...],
    admin_note: str = "",
) -> None:
    """Idempotent confirmation with an explicit source and allowed transition."""
    locked = db.query(PaymentOrder).filter(PaymentOrder.id == order.id).with_for_update().first()
    if not locked:
        raise ValueError("订单不存在")
    if locked.status == "paid":
        return
    if locked.status not in allowed_statuses:
        raise ValueError("订单尚未提交付款信息或已关闭，不能确认收款")

    now = utc_now()
    locked.status = "paid"
    locked.paid_at = now
    locked.updated_at = now
    locked.confirmation_source = confirmation_source
    locked.admin_note = admin_note.strip()
    grant_membership(db, locked.user_id, locked.plan, source=f"payment:{confirmation_source}")
    db.commit()


def reject_payment_claim(db: Session, order: PaymentOrder, note: str) -> None:
    if order.status != "user_paid":
        raise ValueError("仅待核验订单可以驳回")
    now = utc_now()
    order.status = "rejected"
    order.admin_note = note.strip()
    order.cancelled_at = now
    order.updated_at = now
    db.commit()
