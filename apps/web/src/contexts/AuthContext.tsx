import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, AuthSession } from "../api/client";
import { clearAuthToken, getAuthToken, setAuthToken } from "../utils/authStorage";

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  refresh: () => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.getAuthSession();
    setSession(data);
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, [refresh]);

  const loginWithToken = useCallback(
    async (token: string) => {
      setAuthToken(token);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    clearAuthToken();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, loading, refresh, loginWithToken, logout }),
    [session, loading, refresh, loginWithToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthTokenPresent() {
  return Boolean(getAuthToken());
}
