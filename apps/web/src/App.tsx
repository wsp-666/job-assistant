import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider } from "./contexts/AuthContext";
import WspPage from "./pages/WspPage";
import Dashboard from "./pages/Dashboard";
import JobDetail from "./pages/JobDetail";
import Jobs from "./pages/Jobs";
import ResumePage from "./pages/Resume";
import QuickStartPage from "./pages/QuickStart";
import SettingsPage from "./pages/Settings";
import TargetPositionsPage from "./pages/TargetPositions";
import ApplicationsPage from "./pages/Applications";
import JobLibraryPage from "./pages/JobLibrary";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 本地开发阶段暂时关闭账号登录；保留登录页面源码，恢复云端模式时重新挂载。 */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="/forgot-password" element={<Navigate to="/" replace />} />
          <Route path="/wsp" element={<WspPage />} />
          {/* ProtectedRoute 暂停使用：本机管理台直接进入，招聘网站登录检测仍由扩展处理。 */}
          <Route element={<Layout />}>
            <Route path="/quick-start" element={<QuickStartPage />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/job-library" element={<JobLibraryPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/resume" element={<ResumePage />} />
            <Route path="/target-positions" element={<TargetPositionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
