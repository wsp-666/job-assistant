from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.models import PaymentOrder, User
from app.schemas.schemas import (
    AdminOrderRejectIn,
    AdminOrderOut,
    AdminUserOut,
    MembershipAdminGrantRequest,
    MembershipPlanOut,
    MembershipStatusOut,
    PaymentOrderCreate,
    PaymentOrderOut,
    PaymentClaimIn,
)
from app.services.auth_service import get_current_user_required
from app.services.license_service import PLAN_LABELS, verify_admin_secret
from app.services.membership_plans import MEMBERSHIP_PLANS
from app.services.membership_service import get_membership_status, grant_membership
from app.services.payment_qr_service import get_qr_file, personal_qr_enabled, qr_public_url, save_qr_file
from app.services.payment_service import (
    build_alipay_page_pay,
    build_wechat_native_pay,
    cancel_payment_order,
    create_payment_order,
    expire_stale_orders,
    get_current_order,
    mark_order_paid,
    reject_payment_claim,
    submit_payment_claim,
)

router = APIRouter(prefix="/api/membership", tags=["membership"])


def _order_out(order: PaymentOrder, pay: dict) -> PaymentOrderOut:
    return PaymentOrderOut(
        order_id=order.id,
        out_trade_no=order.out_trade_no,
        plan=order.plan,
        plan_label=PLAN_LABELS.get(order.plan, order.plan),
        amount_cents=order.amount_cents,
        pay_channel=order.pay_channel,
        status=order.status,
        pay_url=pay.get("pay_url"),
        code_url=pay.get("code_url"),
        qr_url=pay.get("qr_url"),
        mock=bool(pay.get("mock")),
        message=str(pay.get("message") or ""),
        payer_remark=order.payer_remark or "",
        created_at=order.created_at.isoformat() if order.created_at else None,
        expires_at=order.expires_at.isoformat() if order.expires_at else None,
        submitted_at=order.submitted_at.isoformat() if order.submitted_at else None,
        paid_at=order.paid_at.isoformat() if order.paid_at else None,
        can_cancel=order.status == "pending",
    )


async def _payment_payload(order: PaymentOrder) -> dict:
    if order.pay_channel == "wechat":
        return await build_wechat_native_pay(order)
    return await build_alipay_page_pay(order)


@router.get("/status", response_model=MembershipStatusOut)
def membership_status(db: Session = Depends(get_db), user=Depends(get_current_user_required)):
    return MembershipStatusOut(**get_membership_status(db, user))


@router.get("/plans", response_model=list[MembershipPlanOut])
def membership_plans():
    items: list[MembershipPlanOut] = []
    for plan_id, cfg in MEMBERSHIP_PLANS.items():
        items.append(
            MembershipPlanOut(
                plan=plan_id,
                label=str(cfg["label"]),
                price_cents=int(cfg["price_cents"]),
                description=str(cfg.get("description", "")),
            )
        )
    return items


@router.get("/payment-qr/{channel}", include_in_schema=False)
def serve_payment_qr(channel: str):
    path = get_qr_file(channel)
    media = "image/png"
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        media = "image/jpeg"
    elif path.suffix.lower() == ".webp":
        media = "image/webp"
    return FileResponse(path, media_type=media)


@router.post("/orders", response_model=PaymentOrderOut)
async def create_order(
    payload: PaymentOrderCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_required),
):
    try:
        order = create_payment_order(db, user, payload.plan, payload.pay_channel)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    return _order_out(order, await _payment_payload(order))


@router.get("/orders/current", response_model=PaymentOrderOut | None)
async def current_order(
    db: Session = Depends(get_db),
    user=Depends(get_current_user_required),
):
    order = get_current_order(db, user.id)
    if not order:
        return None
    return _order_out(order, await _payment_payload(order))


@router.post("/orders/{order_id}/cancel")
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_required),
):
    order = db.query(PaymentOrder).filter(PaymentOrder.id == order_id, PaymentOrder.user_id == user.id).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    try:
        cancel_payment_order(db, order)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "message": "订单已取消"}


@router.post("/orders/{order_id}/mock-pay")
def mock_pay_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_required),
):
    if settings.payment_mode != "mock" or not settings.payment_mock:
        raise HTTPException(403, "生产环境已关闭模拟支付")

    order = db.query(PaymentOrder).filter(PaymentOrder.id == order_id, PaymentOrder.user_id == user.id).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    try:
        mark_order_paid(
            db,
            order,
            confirmation_source="mock",
            allowed_statuses=("pending",),
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return MembershipStatusOut(**get_membership_status(db, user))


@router.post("/orders/{order_id}/user-paid")
def user_mark_paid(
    order_id: int,
    payload: PaymentClaimIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_required),
):
    order = db.query(PaymentOrder).filter(PaymentOrder.id == order_id, PaymentOrder.user_id == user.id).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    try:
        submit_payment_claim(db, order, payload.payer_remark)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {
        "ok": True,
        "message": "已提交付款信息，请等待管理员确认后自动开通会员",
        "out_trade_no": order.out_trade_no,
    }


@router.post("/admin/confirm-order/{order_id}")
def admin_confirm_order(
    order_id: int,
    db: Session = Depends(get_db),
    x_license_admin_secret: str = Header(default=""),
):
    verify_admin_secret(x_license_admin_secret)
    order = db.query(PaymentOrder).filter(PaymentOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    try:
        mark_order_paid(
            db,
            order,
            confirmation_source="admin_manual",
            allowed_statuses=("user_paid",),
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    user = db.query(User).filter(User.id == order.user_id).first()
    return {
        "ok": True,
        "out_trade_no": order.out_trade_no,
        "user_id": order.user_id,
        "nickname": user.nickname if user else "",
        "membership": get_membership_status(db, user),
    }


@router.post("/admin/reject-order/{order_id}")
def admin_reject_order(
    order_id: int,
    payload: AdminOrderRejectIn,
    db: Session = Depends(get_db),
    x_license_admin_secret: str = Header(default=""),
):
    verify_admin_secret(x_license_admin_secret)
    order = db.query(PaymentOrder).filter(PaymentOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    try:
        reject_payment_claim(db, order, payload.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "out_trade_no": order.out_trade_no, "message": "付款申报已驳回"}


@router.post("/admin/grant", response_model=MembershipStatusOut)
def admin_grant_membership(
    payload: MembershipAdminGrantRequest,
    db: Session = Depends(get_db),
    x_license_admin_secret: str = Header(default=""),
):
    verify_admin_secret(x_license_admin_secret)
    expire_stale_orders(db)

    user: User | None = None
    if payload.user_id:
        user = db.query(User).filter(User.id == payload.user_id).first()
    elif payload.nickname.strip():
        user = db.query(User).filter(User.nickname == payload.nickname.strip()).first()
    if not user:
        raise HTTPException(404, "用户不存在，请提供 user_id 或 nickname")

    grant_membership(
        db,
        user.id,
        payload.plan,
        source="admin_grant",
        days=payload.days,
    )
    db.commit()
    return MembershipStatusOut(**get_membership_status(db, user))


@router.post("/admin/upload-qr")
async def admin_upload_qr(
    channel: str,
    file: UploadFile = File(...),
    x_license_admin_secret: str = Header(default=""),
):
    verify_admin_secret(x_license_admin_secret)
    url = await save_qr_file(channel, file)
    return {"ok": True, "channel": channel, "qr_url": url}


@router.get("/admin/qr-status")
def admin_qr_status(x_license_admin_secret: str = Header(default="")):
    verify_admin_secret(x_license_admin_secret)
    return {
        "personal_qr_enabled": personal_qr_enabled(),
        "wechat": qr_public_url("wechat"),
        "alipay": qr_public_url("alipay"),
    }


@router.get("/admin/orders", response_model=list[AdminOrderOut])
def admin_list_orders(
    status: str = "",
    db: Session = Depends(get_db),
    x_license_admin_secret: str = Header(default=""),
):
    verify_admin_secret(x_license_admin_secret)
    query = db.query(PaymentOrder).order_by(PaymentOrder.id.desc())
    if status:
        query = query.filter(PaymentOrder.status == status)
    else:
        query = query.filter(PaymentOrder.status.in_(("pending", "user_paid")))
    rows = query.limit(100).all()
    items: list[AdminOrderOut] = []
    for order in rows:
        user = db.query(User).filter(User.id == order.user_id).first()
        items.append(
            AdminOrderOut(
                order_id=order.id,
                out_trade_no=order.out_trade_no,
                user_id=order.user_id,
                nickname=user.nickname if user else "",
                plan=order.plan,
                plan_label=PLAN_LABELS.get(order.plan, order.plan),
                amount_cents=order.amount_cents,
                pay_channel=order.pay_channel,
                status=order.status,
                payer_remark=order.payer_remark or "",
                admin_note=order.admin_note or "",
                created_at=order.created_at.isoformat() if order.created_at else None,
                expires_at=order.expires_at.isoformat() if order.expires_at else None,
                submitted_at=order.submitted_at.isoformat() if order.submitted_at else None,
            )
        )
    return items


@router.get("/admin/users", response_model=list[AdminUserOut])
def admin_list_users(
    db: Session = Depends(get_db),
    x_license_admin_secret: str = Header(default=""),
):
    verify_admin_secret(x_license_admin_secret)
    users = db.query(User).order_by(User.id.desc()).limit(100).all()
    items: list[AdminUserOut] = []
    for user in users:
        membership = get_membership_status(db, user)
        items.append(
            AdminUserOut(
                id=user.id,
                nickname=user.nickname,
                membership_active=bool(membership["active"]),
                plan_label=str(membership.get("plan_label") or ""),
                created_at=user.created_at.isoformat() if user.created_at else None,
            )
        )
    return items
