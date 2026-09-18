import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Job } from "../api/client";
import Pagination from "../components/Pagination";
import { jobDetailPath } from "../utils/jobRoutes";

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-amber-100 text-amber-800" },
  skipped: { label: "已跳过", color: "bg-slate-100 text-slate-600" },
  applied: { label: "已投递", color: "bg-blue-100 text-blue-800" },
};

const quickKeywords = ["实习", "校招", "社招", "产品", "运营", "开发", "算法"];

export default function CareerJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [companies, setCompanies] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [company, setCompany] = useState("");
  const [city, setCity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("created_at");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filterParams = () => ({
    platform: "career" as const,
    company: company || undefined,
    city: city || undefined,
    keyword: keyword || undefined,
    status: status || undefined,
    sort,
    order: "desc" as const,
  });

  const loadMeta = async () => {
    const meta = await api.getCareerJobMeta();
    setCompanies(meta.companies);
    setCities(meta.cities);
  };

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
    loadMeta().catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [company, city, keyword, status, sort, page, pageSize]);

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

  const handleDelete = async (jobId: number, jobTitle: string) => {
    if (!confirm(`确定删除岗位「${jobTitle}」？`)) return;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">官网招聘岗位</h2>
          <p className="text-slate-500">
            来自各公司招聘官网抓取的岗位，可按公司、城市、关键词筛选并导出 Excel
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to="/career-sites" className="btn-secondary">
            管理招聘源
          </Link>
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

      <div className="card space-y-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="label">公司</label>
            <select
              className="input w-44"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setPage(1);
              }}
            >
              <option value="">全部公司</option>
              {companies.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">城市</label>
            <select
              className="input w-36"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setPage(1);
              }}
            >
              <option value="">全部城市</option>
              {cities.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">状态</label>
            <select
              className="input w-32"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">全部</option>
              <option value="pending">待处理</option>
              <option value="skipped">已跳过</option>
              <option value="applied">已投递</option>
            </select>
          </div>
          <div>
            <label className="label">排序</label>
            <select
              className="input w-40"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="created_at">采集时间</option>
              <option value="company">公司名称</option>
              <option value="job_title">岗位名称</option>
              <option value="match_score">匹配分</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">关键词（岗位名 / 公司 / JD）</label>
          <input
            className="input max-w-xl"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            placeholder="如：实习、Java、产品经理"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {quickKeywords.map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-full px-3 py-1 text-xs ${
                  keyword === item
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => {
                  setKeyword(keyword === item ? "" : item);
                  setPage(1);
                }}
              >
                {item}
              </button>
            ))}
          </div>
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
          暂无官网岗位。请先到
          <Link to="/career-sites" className="text-blue-600 hover:underline">
            官网招聘源
          </Link>
          导入大厂并抓取。
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const st = statusMap[job.status] || statusMap.pending;
            const preview = job.jd_text?.slice(0, 120).replace(/\s+/g, " ");
            return (
              <div key={job.id} className="card flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{job.job_title}</h3>
                      <span className={`badge ${st.color}`}>{st.label}</span>
                      <span className="badge bg-indigo-100 text-indigo-800">
                        {job.platform.replace("career:", "") || "官网"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {job.company} · {job.city || "城市未知"} · {job.salary || "薪资面议"}
                    </p>
                    {preview && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-500">{preview}…</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link to={jobDetailPath(job)} className="btn-secondary">
                      详情
                    </Link>
                    <a className="btn-primary" href={job.job_url} target="_blank" rel="noreferrer">
                      官网投递
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
