import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Job } from "../api/client";
import Pagination from "../components/Pagination";
import { jobDetailPath } from "../utils/jobRoutes";

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-amber-100 text-amber-800" },
  greeted: { label: "已沟通", color: "bg-green-100 text-green-800" },
  skipped: { label: "已跳过", color: "bg-slate-100 text-slate-600" },
  applied: { label: "已投递", color: "bg-blue-100 text-blue-800" },
};

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState("");
  const [minScore, setMinScore] = useState("");
  const [sort, setSort] = useState("match_score");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const filterParams = () => ({
    status: status || undefined,
    platform: "boss" as const,
    min_score: minScore ? Number(minScore) : undefined,
    sort,
    order: "desc" as const,
  });

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await api.getJobs({
        ...filterParams(),
        page,
        page_size: pageSize,
      });
      setJobs(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setJobs([]);
      setTotal(0);
      setLoadError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status, minScore, sort, page, pageSize]);

  const handleGenerate = async (jobId: number) => {
    setGeneratingId(jobId);
    try {
      await api.generateGreeting(jobId);
      alert("话术已生成，请在岗位详情中查看");
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGeneratingId(null);
    }
  };

  const handleDelete = async (jobId: number, jobTitle: string) => {
    if (!confirm(`确定删除岗位「${jobTitle}」？相关话术记录也会一并删除。`)) return;
    setDeletingId(jobId);
    try {
      await api.deleteJob(jobId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async () => {
    if (total === 0) {
      alert("当前筛选条件下没有可导出的岗位");
      return;
    }
    setExporting(true);
    try {
      await api.exportJobsExcel(filterParams());
      alert(`已导出当前筛选的 ${total} 条岗位`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">BOSS直聘岗位列表</h2>
          <p className="text-slate-500">
            仅显示插件在 BOSS 直聘采集的岗位。官网抓取岗位请见侧边栏「官网岗位」。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            className="btn-secondary"
            onClick={handleExport}
            disabled={exporting || loading || total === 0}
            title="导出当前筛选条件下的全部岗位"
          >
            {exporting ? "导出中…" : `导出筛选结果${total > 0 ? ` (${total})` : ""}`}
          </button>
          <button className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="card border-red-200 bg-red-50 text-sm text-red-700">{loadError}</div>
      )}

      <div className="card flex flex-wrap gap-4">
        <div>
          <label className="label">状态</label>
          <select
            className="input w-40"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部</option>
            <option value="pending">待处理</option>
            <option value="greeted">已沟通</option>
            <option value="skipped">已跳过</option>
          </select>
        </div>
        <div>
          <label className="label">最低匹配分</label>
          <input
            className="input w-32"
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => {
              setMinScore(e.target.value);
              setPage(1);
            }}
            placeholder="如 70"
          />
        </div>
        <div>
          <label className="label">排序</label>
          <select
            className="input w-44"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="match_score">综合匹配分</option>
            <option value="role_match_score">职责匹配分</option>
            <option value="benefits_match_score">待遇匹配分</option>
            <option value="company_match_score">公司匹配分</option>
            <option value="created_at">采集时间</option>
          </select>
        </div>
      </div>

      {!loading && total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      {loading ? (
        <p className="text-slate-500">加载中...</p>
      ) : jobs.length === 0 ? (
        <div className="card text-center text-slate-500">
          暂无 BOSS 岗位。请用插件在 BOSS 直聘浏览岗位后刷新。
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const st = statusMap[job.status] || statusMap.pending;
            return (
              <div key={job.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{job.job_title}</h3>
                    <span className={`badge ${st.color}`}>{st.label}</span>
                    <span className="badge bg-violet-100 text-violet-800">综合 {Math.round(job.match_score ?? 0)}</span>
                    <span className="badge bg-blue-100 text-blue-800">职责 {job.role_match_score ?? 0}</span>
                    <span className="badge bg-emerald-100 text-emerald-800">待遇 {job.benefits_match_score ?? 0}</span>
                    <span className="badge bg-amber-100 text-amber-800">公司 {job.company_match_score ?? 0}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {job.company} · {job.city} · {job.salary || "薪资面议"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link to={jobDetailPath(job)} className="btn-secondary">
                    查看岗位详情
                  </Link>
                  <button
                    className="btn-primary"
                    disabled={generatingId === job.id}
                    onClick={() => handleGenerate(job.id)}
                  >
                    {generatingId === job.id ? "生成中..." : "生成话术"}
                  </button>
                  <a className="btn-secondary" href={job.job_url} target="_blank" rel="noreferrer">
                    打开岗位
                  </a>
                  <button
                    className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    disabled={deletingId === job.id}
                    onClick={() => handleDelete(job.id, job.job_title)}
                  >
                    {deletingId === job.id ? "删除中..." : "删除"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
