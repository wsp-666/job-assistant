import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import AuthShell from "../components/auth/AuthShell";
import { useCountdown } from "../components/auth/useCountdown";
import { useAuthPage } from "../components/auth/useAuthPage";
import { useAuth } from "../contexts/AuthContext";
import { clearAuthToken } from "../utils/authStorage";

export default function RegisterPage() {
  const { loginWithToken } = useAuth();
  const { error, setError, hint, setHint, loading, setLoading, providersLoaded, emailEnabled, navigate } =
    useAuthPage();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const countdown = useCountdown();

  const sendCode = async () => {
    setError("");
    setHint("");
    if (!email.trim()) {
      setError("请输入邮箱");
      return;
    }
    setLoading(true);
    try {
      const res = await api.sendEmailCode(email.trim(), "register");
      countdown.start(60);
      setHint(res.message || "验证码已发送，请查收邮箱");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !code.trim() || !password) {
      setError("请填写完整信息");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }
    setLoading(true);
    try {
      const { token } = await api.emailRegister(email.trim(), code.trim(), password);
      await loginWithToken(token);
      navigate("/", { replace: true });
    } catch (e) {
      clearAuthToken();
      setError(e instanceof Error ? e.message : "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="创建账号"
      subtitle="使用邮箱注册，开启智能求职之旅"
      footer={
        <>
          已有账号？{" "}
          <Link to="/login" className="font-medium text-blue-600 hover:underline">
            返回登录
          </Link>
        </>
      }
    >
      {!emailEnabled && providersLoaded ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          邮箱注册未启用，请确认云端已配置 SMTP 发信。
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <label className="label" htmlFor="reg-email">
              邮箱
            </label>
            <input
              id="reg-email"
              type="email"
              className="input"
              placeholder="name@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="label" htmlFor="reg-code">
              验证码
            </label>
            <div className="flex gap-2">
              <input
                id="reg-code"
                type="text"
                className="input"
                placeholder="6 位数字"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={loading}
              />
              <button
                type="button"
                className="btn-secondary shrink-0 whitespace-nowrap px-4"
                disabled={loading || countdown.seconds > 0}
                onClick={() => void sendCode()}
              >
                {countdown.seconds > 0 ? `${countdown.seconds}s` : "获取验证码"}
              </button>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="reg-password">
              设置密码
            </label>
            <input
              id="reg-password"
              type="password"
              className="input"
              placeholder="至少 6 位"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="label" htmlFor="reg-confirm">
              确认密码
            </label>
            <input
              id="reg-confirm"
              type="password"
              className="input"
              placeholder="再次输入密码"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {hint && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{hint}</p>
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button type="submit" className="btn-primary w-full py-2.5" disabled={loading || !providersLoaded}>
            {loading ? "注册中…" : "完成注册"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
