import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, DashboardStats, Job } from "../api/client";
import { jobDetailPath } from "../utils/jobRoutes";

type KpiItem = {
  label: string;
  value: string | number;
  hint?: string;
  accent: string;
  ring: string;
};

function KpiCard({ item }: { item: KpiItem }) {
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${item.ring}`}>
      <p className="text-sm font-medium text-slate-500">{item.label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${item.accent}`}>{item.value}</p>
      {item.hint && <p className="mt-1 text-xs text-slate-400">{item.hint}</p>}
    </div>
  );
}

function FunnelBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">
          {value} <span className="text-slate-400">({pct}%)</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const quickLinks = [
  {
    to: "/job-library",
    title: "岗位信息库",
    desc: "全部可投与针对个人推荐，直接启动投递",
    color: "border-indigo-200 bg-indigo-50/80 hover:border-indigo-300",
  },
  {
    to: "/applications",
    title: "投递工作台",
    desc: "多维表、看板、日历与面试节点管理",
    color: "border-blue-200 bg-blue-50/80 hover:border-blue-300",
  },
  {
    to: "/jobs",
    title: "BOSS 直聘岗位",
    desc: "插件采集、匹配分排序、生成话术",
    color: "border-violet-200 bg-violet-50/80 hover:border-violet-300",
  },
  {
    to: "/resume",
    title: "简历管理",
    desc: "上传、在线编辑与 AI 优化",
    color: "border-emerald-200 bg-emerald-50/80 hover:border-emerald-300",
  },
  {
    to: "/target-positions",
    title: "目标岗位",
    desc: "意向职位与筛选条件",
    color: "border-amber-200 bg-amber-50/80 hover:border-amber-300",
  },
  {
    to: "/settings",
    title: "系统设置",
    desc: "本地模式、API 与投递偏好",
    color: "border-slate-200 bg-slate-50 hover:border-slate-300",
  },
];

const statusLabel: Record<string, string> = {
  pending: "待评估",
  preparing: "准备材料",
  ready: "待投递",
  greeted: "已沟通",
  applied: "已投递",
  written_test: "笔试",
  interview: "面试中",
  final_interview: "终面",
  offer: "已获 Offer",
  hired: "已入职",
  rejected: "未通过",
  withdrawn: "已撤回",
  closed: "岗位关闭",
  skipped: "不考虑",
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [apiOk, setApiOk] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await api.health();
      setApiOk(true);
      const [dashboard, jobs] = await Promise.all([
        api.getDashboard(),
        api.getJobs({ page: 1, page_size: 8, sort: "created_at", order: "desc" }),
      ]);
      setStats(dashboard);
      setRecentJobs(jobs.items ?? []);
    } catch (e) {
      setApiOk(false);
      setStats(null);
      setRecentJobs([]);
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis: KpiItem[] = stats
    ? [
        {
          label: "岗位总数",
          value: stats.total_jobs,
          accent: "text-slate-900",
          ring: "border-slate-200",
        },
        {
          label: "今日新增",
          value: stats.today_jobs,
          accent: "text-blue-600",
          ring: "border-blue-100",
        },
        {
          label: "待处理",
          value: stats.pending_jobs,
          accent: "text-amber-600",
          ring: "border-amber-100",
        },
        {
          label: "已沟通",
          value: stats.greeted_jobs,
          accent: "text-emerald-600",
          ring: "border-emerald-100",
        },
        {
          label: "已跳过",
          value: stats.skipped_jobs,
          accent: "text-slate-600",
          ring: "border-slate-200",
        },
        {
          label: "平均匹配分",
          value: stats.avg_match_score,
          hint: "0 – 100",
          accent: "text-violet-600",
          ring: "border-violet-100",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">仪表盘</h2>
          <p className="mt-1 text-slate-500">岗位采集、匹配与投递进展一览</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
              apiOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${apiOk ? "bg-emerald-500" : "bg-amber-500"}`} />
            {apiOk ? "API 已连接" : error || "API 未连接"}
          </span>
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "刷新中…" : "刷新数据"}
          </button>
          <Link to="/quick-start" className="btn-primary">
            快速上手
          </Link>
        </div>
      </div>

      {!apiOk && error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          请确认本地服务已启动（端口 8000），或从启动器点击「一键启动」后再刷新本页。
        </div>
      )}

      {stats && (
        <>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            {kpis.map((item) => (
              <KpiCard key={item.label} item={item} />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-12">
            <section className="card xl:col-span-5">
              <h3 className="text-base font-semibold text-slate-900">岗位状态分布</h3>
              <p className="mt-1 text-sm text-slate-500">基于当前库内全部岗位的占比</p>
              <div className="mt-6 space-y-5">
                <FunnelBar
                  label="待处理"
                  value={stats.pending_jobs}
                  total={stats.total_jobs}
                  color="bg-amber-500"
                />
                <FunnelBar
                  label="已沟通"
                  value={stats.greeted_jobs}
                  total={stats.total_jobs}
                  color="bg-emerald-500"
                />
                <FunnelBar
                  label="已跳过"
                  value={stats.skipped_jobs}
                  total={stats.total_jobs}
                  color="bg-slate-400"
                />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-amber-600">{stats.pending_jobs}</p>
                  <p className="text-xs text-slate-500">待跟进</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600">{stats.greeted_jobs}</p>
                  <p className="text-xs text-slate-500">已沟通</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{stats.today_jobs}</p>
                  <p className="text-xs text-slate-500">今日新增</p>
                </div>
              </div>
            </section>

            <section className="card xl:col-span-7">
              <h3 className="text-base font-semibold text-slate-900">快捷入口</h3>
              <p className="mt-1 text-sm text-slate-500">常用功能，适合宽屏一键跳转</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quickLinks.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`rounded-xl border p-4 transition ${item.color}`}
                  >
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.desc}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <section className="card overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">最近加入的岗位</h3>
                <p className="text-sm text-slate-500">按更新时间倒序，最多显示 8 条</p>
              </div>
              <div className="flex gap-2">
                <Link to="/jobs" className="btn-secondary">
                  BOSS 岗位
                </Link>
                <Link to="/job-library" className="btn-secondary">
                  岗位信息库
                </Link>
              </div>
            </div>
            {recentJobs.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                暂无岗位数据。可从「岗位信息库」选择岗位，或用 Edge 插件浏览 BOSS 岗位。
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">岗位</th>
                      <th className="px-5 py-3">公司</th>
                      <th className="px-5 py-3">来源</th>
                      <th className="px-5 py-3">匹配分</th>
                      <th className="px-5 py-3">状态</th>
                      <th className="px-5 py-3">采集时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3">
                          <Link
                            to={jobDetailPath(job)}
                            className="font-medium text-slate-900 hover:text-blue-600"
                          >
                            {job.job_title}
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {job.city || "—"} · {job.salary || "薪资面议"}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{job.company}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`badge ${
                              job.platform === "library"
                                ? "bg-blue-100 text-blue-800"
                                : job.platform.startsWith("career")
                                ? "bg-indigo-100 text-indigo-800"
                                : "bg-violet-100 text-violet-800"
                            }`}
                          >
                            {job.platform === "library" ? "信息库" : job.platform.startsWith("career") ? "官网" : "BOSS"}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-medium text-slate-800">
                          {Math.round(job.match_score ?? 0)}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {statusLabel[job.status] || job.status}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                          {new Date(job.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {loading && !stats && <p className="text-center text-sm text-slate-500">正在加载仪表盘…</p>}
    </div>
  );
}
