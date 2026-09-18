import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

export function useAuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithToken, session } = useAuth();
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);

  useEffect(() => {
    api
      .getAuthProviders()
      .then((data) => setEmailEnabled(data.auth_enabled && data.email))
      .catch(() => setError("无法连接服务器，请先打开启动器并点击「一键启动」"))
      .finally(() => setProvidersLoaded(true));
  }, []);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) return;
    loginWithToken(token)
      .then(() => navigate("/", { replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : "登录失败"));
  }, [searchParams, loginWithToken, navigate]);

  useEffect(() => {
    if (session?.logged_in) navigate("/", { replace: true });
  }, [session, navigate]);

  return {
    error,
    setError,
    hint,
    setHint,
    loading,
    setLoading,
    providersLoaded,
    emailEnabled,
    navigate,
  };
}
