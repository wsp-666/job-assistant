import { Link, Outlet, useLocation } from "react-router-dom";

const nav = [
  { to: "/", label: "仪表盘" },
  { to: "/job-library", label: "岗位信息库" },
  { to: "/jobs", label: "BOSS直聘岗位" },
  { to: "/applications", label: "投递工作台" },
  { to: "/resume", label: "简历管理" },
  { to: "/target-positions", label: "目标岗位" },
  { to: "/settings", label: "设置" },
  // 本地阶段暂时隐藏账号登录入口；恢复云端会员时再加入 /login。
  { to: "/quick-start", label: "快速上手" },
];

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  if (to === "/jobs") {
    return pathname === "/jobs" || pathname.startsWith("/jobs/");
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function Layout() {
  const location = useLocation();
  const fullWidth =
    location.pathname === "/" ||
    location.pathname.startsWith("/job-library") ||
    location.pathname.startsWith("/applications") ||
    location.pathname.startsWith("/target-positions") ||
    location.pathname.startsWith("/quick-start");
  const mainClass = fullWidth ? "w-full max-w-none" : "mx-auto w-full max-w-6xl";

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-5">
          <h1 className="text-lg font-bold text-slate-900">求职助手</h1>
          <p className="mt-0.5 text-xs text-slate-500">岗位信息库 · 投递进度 · 自动填写</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map((item) => {
            const active = isActive(location.pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-500">本机模式 · 无需登录</p>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <main className={`min-w-0 flex-1 px-6 py-6 xl:px-10 ${mainClass}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
