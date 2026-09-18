import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import AuthShell from "../components/auth/AuthShell";
import { useAuthPage } from "../components/auth/useAuthPage";
import { useAuth } from "../contexts/AuthContext";
import { clearAuthToken } from "../utils/authStorage";

export default function LoginPage() {
  const { loginWithToken } = useAuth();
  const { error, setError, loading, setLoading, providersLoaded, emailEnabled, navigate } =
    useAuthPage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    setLoading(true);
    try {
      const { token } = await api.emailLogin(email.trim(), password);
      await loginWithToken(token);
      navigate("/", { replace: true });
    } catch (e) {
      clearAuthToken();
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="欢迎回来"
      subtitle="登录求职助手，管理岗位与简历"
      footer={
        <>
          还没有账号？{" "}
          <Link to="/register" className="font-medium text-blue-600 hover:underline">
            立即注册
          </Link>
          <span className="mx-2 text-slate-300">|</span>
          <Link to="/forgot-password" className="font-medium text-blue-600 hover:underline">
            忘记密码
          </Link>
        </>
      }
    >
      {!emailEnabled && providersLoaded ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          邮箱登录未启用，请检查云端配置。
        </p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <label className="label" htmlFor="login-email">
              邮箱
            </label>
            <input
              id="login-email"
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
            <label className="label" htmlFor="login-password">
              密码
            </label>
            <input
              id="login-password"
              type="password"
              className="input"
              placeholder="请输入密码"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button type="submit" className="btn-primary w-full py-2.5" disabled={loading || !providersLoaded}>
            {loading ? "登录中…" : "登 录"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
