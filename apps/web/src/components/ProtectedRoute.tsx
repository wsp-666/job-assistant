import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p className="text-slate-500">加载中...</p>;
  }

  if (session?.auth_enabled !== false && !session?.logged_in) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
