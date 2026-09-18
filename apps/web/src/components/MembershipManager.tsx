import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, MembershipPlan, MembershipStatus, PaymentOrder } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { adminApiUrl } from "../utils/apiUrl";

function formatPrice(cents: number) {
  return `¥${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function MembershipManager() {
  const { session, refresh } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pendingOrder, setPendingOrder] = useState<PaymentOrder | null>(null);
  const [payerRemark, setPayerRemark] = useState("");

  const membership = status || session?.membership;
  const expiresAt = membership?.expires_at ? new Date(membership.expires_at).getTime() : null;
  const renewalAvailable = Boolean(
    membership?.active && expiresAt && expiresAt - Date.now() <= 7 * 24 * 60 * 60 * 1000,
  );
  const canPurchase = (!membership?.active || renewalAvailable) && !pendingOrder;

  const load = async () => {
    try {
      const p = await api.getMembershipPlans();
      setPlans(p);
      if (session?.logged_in) {
        const [nextStatus, currentOrder] = await Promise.all([
          api.getMembershipStatus(),
          api.getCurrentMembershipOrder(),
        ]);
        setStatus(nextStatus);
        setPendingOrder(currentOrder);
        setPayerRemark(currentOrder?.payer_remark || "");
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
  }, [session?.logged_in]);

  const buy = async (plan: string, payChannel: "wechat" | "alipay") => {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const order = await api.createMembershipOrder(plan, payChannel);
      setPendingOrder(order);
      setPayerRemark("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建订单失败");
    } finally {
      setLoading(false);
    }
  };

  const mockPay = async () => {
    if (!pendingOrder) return;
    setLoading(true);
    setError("");
    try {
      const next = await api.mockPayOrder(pendingOrder.order_id);
      setStatus(next);
      setPendingOrder(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "支付失败");
    } finally {
      setLoading(false);
    }
  };

  const userPaid = async () => {
    if (!pendingOrder) return;
    if (payerRemark.trim().length < 2) {
      setError("请填写付款昵称或手机号后四位，便于管理员核对到账");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.userMarkOrderPaid(pendingOrder.order_id, payerRemark.trim());
      setInfo(res.message);
      setPendingOrder({
        ...pendingOrder,
        status: "user_paid",
        payer_remark: payerRemark.trim(),
        can_cancel: false,
        submitted_at: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  const cancelOrder = async () => {
    if (!pendingOrder || !confirm(`确定取消订单 ${pendingOrder.out_trade_no}？`)) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.cancelMembershipOrder(pendingOrder.order_id);
      setPendingOrder(null);
      setPayerRemark("");
      setInfo(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消失败");
    } finally {
      setLoading(false);
    }
  };

  if (!session?.logged_in) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">登录后可购买会员。</p>
        <Link to="/login" className="btn-primary inline-block">
          去登录
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">会员</h3>
        <p className="mt-1 text-sm text-slate-500">购买后解锁 AI 打分、话术、简历改写等功能</p>
      </div>

      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          membership?.active
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {membership?.active ? (
          <>
            <p className="font-medium">已开通：{membership.plan_label}</p>
            {membership.expires_at ? (
              <p className="mt-1">
                到期：{new Date(membership.expires_at).toLocaleString()}
                {renewalAvailable ? "（已进入续费期）" : ""}
              </p>
            ) : (
              <p className="mt-1">有效期：永久</p>
            )}
          </>
        ) : (
          <p>{membership?.message || "未开通会员"}</p>
        )}
      </div>

      {pendingOrder && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">您有待处理订单，请先完成支付或等待管理员确认，无需重复下单。</p>
        </div>
      )}

      {canPurchase && (
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.plan} className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="font-semibold">{plan.label}</h4>
              <p className="mt-1 text-2xl font-bold text-blue-600">{formatPrice(plan.price_cents)}</p>
              <p className="mt-2 min-h-[40px] text-xs text-slate-500">{plan.description}</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  className="btn-primary text-sm"
                  disabled={loading}
                  onClick={() => buy(plan.plan, "wechat")}
                >
                  微信支付
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  disabled={loading}
                  onClick={() => buy(plan.plan, "alipay")}
                >
                  支付宝支付
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!canPurchase && !membership?.active && !pendingOrder && plans.length > 0 && (
        <p className="text-sm text-slate-500">正在加载会员信息…</p>
      )}

      {pendingOrder && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
          <p className="font-medium text-blue-900">
            {pendingOrder.status === "user_paid" ? "付款信息已提交" : "订单已创建"}：{pendingOrder.out_trade_no}
          </p>
          <p className="mt-1 text-blue-800">
            {pendingOrder.plan_label} · {formatPrice(pendingOrder.amount_cents)}
          </p>
          <p className="mt-2 text-blue-700">{pendingOrder.message}</p>
          {pendingOrder.expires_at && pendingOrder.status === "pending" && (
            <p className="mt-1 text-xs text-blue-700">
              请在 {new Date(pendingOrder.expires_at).toLocaleString()} 前完成付款，超时自动关闭。
            </p>
          )}

          {pendingOrder.qr_url && pendingOrder.status === "pending" && (
            <div className="mt-4 flex flex-col items-start gap-2">
              <img
                src={`${adminApiUrl(pendingOrder.qr_url)}?t=${pendingOrder.order_id}`}
                alt="收款码"
                className="max-h-56 rounded border border-white bg-white p-2"
              />
              <p className="text-xs text-blue-700">付款备注请填写订单号：{pendingOrder.out_trade_no}</p>
            </div>
          )}

          {pendingOrder.mock && pendingOrder.status === "pending" && (
            <button type="button" className="btn-secondary mt-3" disabled={loading} onClick={mockPay}>
              模拟支付成功（内测跳过扫码）
            </button>
          )}

          {!pendingOrder.mock && pendingOrder.qr_url && pendingOrder.status === "pending" && (
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-medium text-blue-900">付款昵称或手机号后四位</label>
              <input
                className="input bg-white"
                value={payerRemark}
                maxLength={200}
                onChange={(event) => setPayerRemark(event.target.value)}
                placeholder="例如：微信昵称小林 / 手机尾号 1234"
              />
              <button type="button" className="btn-primary" disabled={loading} onClick={userPaid}>
                我已付款，提交核验
              </button>
            </div>
          )}

          {pendingOrder.status === "user_paid" && (
            <p className="mt-3 rounded bg-white/70 px-3 py-2 text-blue-900">
              管理员正在按“{pendingOrder.payer_remark || payerRemark}”核验到账，请勿重复付款。
            </p>
          )}

          {pendingOrder.can_cancel && (
            <button type="button" className="ml-2 mt-3 text-sm text-slate-500 hover:underline" disabled={loading} onClick={cancelOrder}>
              取消订单
            </button>
          )}
        </div>
      )}

      {info && <p className="text-sm text-green-700">{info}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
