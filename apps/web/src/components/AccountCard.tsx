import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function AccountCard() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  if (!session?.logged_in) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">登录后可购买会员并使用 AI 功能。</p>
        <button type="button" className="btn-secondary" onClick={() => navigate("/login")}>
          去登录
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <p className="font-medium text-slate-900">{session.user?.nickname || "已登录用户"}</p>
        <p className="mt-1 text-slate-600">用户 ID：{session.user?.id}</p>
        <p className="mt-1 text-slate-600">
          {session.membership.active
            ? `会员：${session.membership.plan_label}`
            : session.membership.message || "未开通会员"}
        </p>
      </div>
      <button type="button" className="btn-secondary" onClick={handleLogout}>
        退出登录
      </button>
    </div>
  );
}
