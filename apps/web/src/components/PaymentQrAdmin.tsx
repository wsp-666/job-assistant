import { useEffect, useState } from "react";

import { AdminOrder, AdminUser, api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { adminApiUrl } from "../utils/apiUrl";

const WSP_SECRET_KEY = "ja_wsp_secret";

function formatPrice(cents: number) {
  return `¥${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function statusLabel(status: string) {
  if (status === "pending") return "待付款";
  if (status === "user_paid") return "待核验";
  if (status === "paid") return "已完成";
  if (status === "expired") return "已过期";
  if (status === "cancelled") return "已取消";
  if (status === "rejected") return "已驳回";
  return status;
}

type PaymentQrAdminProps = {
  initialSecret?: string;
  onSecretChange?: (secret: string) => void;
};

export default function PaymentQrAdmin({ initialSecret = "", onSecretChange }: PaymentQrAdminProps) {
  const { refresh } = useAuth();
  const [secret, setSecret] = useState(() => initialSecret || sessionStorage.getItem(WSP_SECRET_KEY) || "");
  const [status, setStatus] = useState<{ wechat?: string | null; alipay?: string | null } | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialSecret) setSecret(initialSecret);
  }, [initialSecret]);

  useEffect(() => {
    if (secret.trim()) {
      sessionStorage.setItem(WSP_SECRET_KEY, secret.trim());
      onSecretChange?.(secret.trim());
    }
  }, [secret, onSecretChange]);

  useEffect(() => {
    if (!secret.trim()) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withSecret = async (fn: () => Promise<void>) => {
    if (!secret.trim()) {
      setMessage("请先填写管理员密钥（.env 里的 LICENSE_ADMIN_SECRET）");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  const loadAll = async () => {
    await withSecret(async () => {
      const [qr, orderRows, userRows] = await Promise.all([
        api.getAdminQrStatus(secret.trim()),
        api.getAdminOrders(secret.trim()),
        api.getAdminUsers(secret.trim()),
      ]);
      setStatus(qr);
      setOrders(orderRows);
      setUsers(userRows);
      setMessage(`已刷新：${orderRows.length} 笔待处理订单，${userRows.length} 个用户`);
    });
  };

  const upload = async (channel: "wechat" | "alipay", file: File | null) => {
    if (!file) return;
    await withSecret(async () => {
      const data = await api.uploadPaymentQr(secret.trim(), channel, file);
      setStatus((prev) => ({ ...prev, [channel]: data.qr_url }));
      setMessage(`${channel === "wechat" ? "微信" : "支付宝"}收款码上传成功，可到「会员」区测试购买`);
    });
  };

  const confirmOrder = async (orderId: number) => {
    const order = orders.find((item) => item.order_id === orderId);
    if (!order || order.status !== "user_paid") {
      setMessage("用户尚未提交付款信息，不能确认收款");
      return;
    }
    if (!confirm(`请先核对实际到账。确定订单 ${order.out_trade_no} 已到账并开通会员？`)) return;
    await withSecret(async () => {
      const res = await api.adminConfirmOrder(secret.trim(), orderId);
      setMessage(`已确认订单 ${res.out_trade_no}，用户 ${res.nickname} 会员已开通`);
      const orderRows = await api.getAdminOrders(secret.trim());
      setOrders(orderRows);
      await refresh();
    });
  };

  const rejectOrder = async (orderId: number) => {
    const order = orders.find((item) => item.order_id === orderId);
    if (!order || order.status !== "user_paid") return;
    const note = prompt(`请输入驳回订单 ${order.out_trade_no} 的原因：`, "未查询到对应到账记录");
    if (!note?.trim()) return;
    await withSecret(async () => {
      const res = await api.adminRejectOrder(secret.trim(), orderId, note.trim());
      setMessage(res.message);
      setOrders(await api.getAdminOrders(secret.trim()));
    });
  };

  const grantMembershipForUser = async (userId: number, plan: string, nickname: string) => {
    await withSecret(async () => {
      const res = await api.adminGrantMembership(secret.trim(), { user_id: userId, plan });
      setMessage(`已为「${nickname}」（ID ${userId}）开通：${res.plan_label}`);
      const userRows = await api.getAdminUsers(secret.trim());
      setUsers(userRows);
      await refresh();
    });
  };

  const planActions = [
    { plan: "friend", label: "亲友版" },
    { plan: "monthly", label: "月度" },
    { plan: "yearly", label: "年度" },
    { plan: "lifetime", label: "终身" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-900">管理员工具</h3>
        <p className="mt-1 text-sm text-slate-500">
          上传收款码后，用户下单扫码并提交付款识别信息；你核对真实到账后再确认开通。
        </p>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="font-medium">运营流程</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>上传微信/支付宝收款码</li>
          <li>用户在「设置 → 会员」下单并扫码付款</li>
          <li>用户点「我已付款」后，在此刷新并确认收款</li>
          <li>仅当云端显式启用 mock 模式时，开发环境才显示模拟支付</li>
        </ol>
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={loading} onClick={loadAll}>
          刷新数据
        </button>
      </div>

      <div>
        <h4 className="font-medium text-slate-900">收款码</h4>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(["wechat", "alipay"] as const).map((channel) => (
            <div key={channel} className="rounded-lg border border-slate-200 p-4">
              <p className="font-medium">{channel === "wechat" ? "微信收款码" : "支付宝收款码"}</p>
              {status?.[channel] ? (
                <img
                  src={`${adminApiUrl(status[channel] || "")}?t=${Date.now()}`}
                  alt={channel}
                  className="mt-3 max-h-48 rounded border border-slate-100"
                />
              ) : (
                <p className="mt-2 text-xs text-slate-500">尚未上传</p>
              )}
              <label className="btn-secondary mt-3 inline-block cursor-pointer text-sm">
                上传图片
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={loading}
                  onChange={(e) => upload(channel, e.target.files?.[0] || null)}
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-medium text-slate-900">待处理订单</h4>
        {orders.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">暂无待付款/待确认订单</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-3">订单号</th>
                  <th className="py-2 pr-3">用户</th>
                  <th className="py-2 pr-3">套餐</th>
                  <th className="py-2 pr-3">金额</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2 pr-3">付款识别信息</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.order_id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">{order.out_trade_no}</td>
                    <td className="py-2 pr-3">
                      {order.nickname}
                      <span className="text-slate-400"> #{order.user_id}</span>
                    </td>
                    <td className="py-2 pr-3">{order.plan_label}</td>
                    <td className="py-2 pr-3">{formatPrice(order.amount_cents)}</td>
                    <td className="py-2 pr-3">{statusLabel(order.status)}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      {order.payer_remark || "尚未提交"}
                      {order.submitted_at && (
                        <span className="block text-slate-400">{new Date(order.submitted_at).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-blue-600 hover:underline disabled:text-slate-400"
                          disabled={loading || order.status !== "user_paid"}
                          onClick={() => confirmOrder(order.order_id)}
                        >
                          核对到账并开通
                        </button>
                        {order.status === "user_paid" && (
                          <button
                            type="button"
                            className="text-red-600 hover:underline disabled:text-slate-400"
                            disabled={loading}
                            onClick={() => rejectOrder(order.order_id)}
                          >
                            驳回
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h4 className="font-medium text-slate-900">用户与手动开通会员</h4>
        <p className="mt-1 text-sm text-slate-500">用户 ID 由系统在登录时自动分配，直接在对应用户行点击套餐即可开通。</p>

        {users.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">暂无用户，请先让用户登录一次</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">昵称</th>
                  <th className="py-2 pr-3">会员状态</th>
                  <th className="py-2">一键开通</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono">{user.id}</td>
                    <td className="py-2 pr-3">{user.nickname}</td>
                    <td className="py-2 pr-3">
                      {user.membership_active ? user.plan_label || "已开通" : "未开通"}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {planActions.map((item) => (
                          <button
                            key={item.plan}
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                            disabled={loading}
                            onClick={() => grantMembershipForUser(user.id, item.plan, user.nickname)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}
