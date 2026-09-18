import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, CareerSiteConfig, CareerSiteSource } from "../api/client";
import ScrapeLogPanel from "../components/ScrapeLogPanel";

function newSource(partial?: Partial<CareerSiteSource>): CareerSiteSource {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return {
    id,
    company: "",
    list_url: "",
    adapter: "auto",
    enabled: true,
    keywords: [],
    scrape_interval_hours: 24,
    last_scraped_at: null,
    last_scrape_status: "",
    last_scrape_count: 0,
    last_adapter_used: "",
    origin: "manual",
    ...partial,
  };
}

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function matchesSourceSearch(source: CareerSiteSource, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    source.company.toLowerCase().includes(q) ||
    source.list_url.toLowerCase().includes(q) ||
    source.keywords.some((item) => item.toLowerCase().includes(q))
  );
}

function parseKeywords(text: string) {
  return text
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const EMPTY_DRAFT = { company: "", list_url: "", keywords: "" };

export default function CareerSitesPage() {
  const [config, setConfig] = useState<CareerSiteConfig | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const wasScrapeRunning = useRef(false);
  const configDirtyRef = useRef(false);
  const manageListRef = useRef<HTMLDivElement>(null);

  const appendLog = (line: string) => {
    setLogs((prev) => [...prev, `[${nowLabel()}] ${line}`]);
  };

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await api.getCareerSites();
      setConfig({
        ...data,
        sources: data.sources ?? [],
      });
      configDirtyRef.current = false;
    } catch (e) {
      setConfig(null);
      setLoadError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const syncBackground = async () => {
      try {
        const status = await api.getBackgroundCareerScrapeStatus();
        if (status.logs.length > 0) {
          setLogs(status.logs);
        }
        if (status.running) {
          wasScrapeRunning.current = true;
          setScraping(true);
        } else {
          if (wasScrapeRunning.current && status.summary && !configDirtyRef.current) {
            setMessage(status.summary);
            await load();
          } else if (wasScrapeRunning.current && status.summary) {
            setMessage(status.summary);
          }
          wasScrapeRunning.current = false;
          setScraping(false);
        }
      } catch {
        // ignore
      }
    };
    syncBackground();
    const timer = window.setInterval(syncBackground, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const persistConfig = async (next: CareerSiteConfig, successMessage: string) => {
    const saved = await api.updateCareerSites(next);
    setConfig(saved);
    configDirtyRef.current = false;
    setMessage(successMessage);
    return saved;
  };

  const updateSource = (id: string, patch: Partial<CareerSiteSource>) => {
    if (!config) return;
    configDirtyRef.current = true;
    setConfig({
      ...config,
      sources: config.sources.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMessage("");
    try {
      await persistConfig(config, "保存成功");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const runScrapeBatch = async (sources: CareerSiteSource[], sourceId?: string) => {
    const targets = sourceId
      ? sources.filter((item) => item.id === sourceId)
      : sources.filter((item) => item.enabled);

    if (targets.length === 0) {
      appendLog("没有可抓取的招聘源");
      return;
    }

    const status = await api.getBackgroundCareerScrapeStatus();
    if (status.running) {
      appendLog("已有后台抓取任务进行中，请稍候");
      setScraping(true);
      setLogs(status.logs);
      return;
    }

    appendLog(`提交后台抓取 ${targets.length} 家公司（可自由切换页面）`);
    const started = await api.startBackgroundCareerScrape({
      source_id: sourceId,
      max_jobs: 30,
    });
    setScraping(started.running);
    setLogs(started.logs);
    setMessage("抓取已在后台运行，顶部蓝条可查看进度");
  };

  const handleSubmitNew = async () => {
    if (!config) return;
    const company = draft.company.trim();
    const listUrl = draft.list_url.trim();
    if (!company || !listUrl) {
      setMessage("请填写公司名和招聘页 URL");
      return;
    }

    const source = newSource({
      company,
      list_url: listUrl,
      keywords: parseKeywords(draft.keywords),
    });

    const nextConfig = {
      ...config,
      sources: [source, ...config.sources],
    };

    setAdding(true);
    setMessage("");
    try {
      await persistConfig(nextConfig, `已添加：${company}`);
      setDraft(EMPTY_DRAFT);
      setExpandedSourceId(source.id);
      setSourceSearch("");
      window.setTimeout(() => {
        manageListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById(`source-${source.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 80);
    } catch (e) {
      configDirtyRef.current = true;
      setConfig(nextConfig);
      setMessage(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!config) return;
    const target = config.sources.find((item) => item.id === sourceId);
    if (!target) return;
    if (!window.confirm(`确定删除「${target.company || "未命名"}」？`)) return;

    const nextConfig = {
      ...config,
      sources: config.sources.filter((item) => item.id !== sourceId),
    };

    setSaving(true);
    try {
      await persistConfig(nextConfig, "已删除");
      if (expandedSourceId === sourceId) {
        setExpandedSourceId(null);
      }
    } catch (e) {
      configDirtyRef.current = true;
      setConfig(nextConfig);
      setMessage(e instanceof Error ? e.message : "删除失败，请点保存设置重试");
    } finally {
      setSaving(false);
    }
  };

  const handleScrapeOnly = async () => {
    if (!config) return;
    setMessage("");
    try {
      if (config.sources.length === 0) {
        appendLog("请先手动添加招聘页 URL");
        setMessage("暂无招聘源，请先在上方表单添加");
        return;
      }
      await runScrapeBatch(config.sources);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "抓取失败";
      appendLog(msg);
      setMessage(msg);
    }
  };

  const filteredSources = useMemo(() => {
    if (!config) return [];
    return config.sources.filter((item) => matchesSourceSearch(item, sourceSearch));
  }, [config, sourceSearch]);

  const toggleExpanded = (sourceId: string) => {
    setExpandedSourceId((current) => (current === sourceId ? null : sourceId));
  };

  const renderSourceItem = (source: CareerSiteSource) => {
    const expanded = expandedSourceId === source.id;

    return (
      <div
        key={source.id}
        id={`source-${source.id}`}
        className={`rounded-lg border transition ${
          expanded ? "border-blue-300 bg-blue-50/30" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 p-3">
          <input
            type="checkbox"
            checked={source.enabled}
            onChange={(e) => updateSource(source.id, { enabled: e.target.checked })}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => toggleExpanded(source.id)}
          >
            <div className="font-medium text-slate-900">{source.company || "未命名"}</div>
            <div className="truncate text-xs text-slate-500">
              {source.list_url || "未填写招聘页 URL"}
            </div>
            {source.last_scrape_status && !expanded && (
              <div className="mt-1 text-xs text-slate-400">
                {source.last_scrape_status}
                {source.last_scrape_count > 0 ? ` · ${source.last_scrape_count} 条` : ""}
              </div>
            )}
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="text-xs text-blue-600"
              onClick={() => config && runScrapeBatch(config.sources, source.id)}
              disabled={scraping}
            >
              抓取
            </button>
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={() => handleDeleteSource(source.id)}
              disabled={saving}
            >
              删除
            </button>
            <button
              type="button"
              className="text-xs text-slate-500"
              onClick={() => toggleExpanded(source.id)}
            >
              {expanded ? "收起" : "编辑"}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-2 border-t border-slate-200 px-3 pb-3 pt-2">
            <input
              className="input"
              value={source.company}
              onChange={(e) => updateSource(source.id, { company: e.target.value })}
              placeholder="公司名"
            />
            <input
              className="input"
              value={source.list_url}
              onChange={(e) => updateSource(source.id, { list_url: e.target.value })}
              placeholder="校招列表 URL，如 https://xxx.zhiye.com/campus"
            />
            <input
              className="input"
              value={source.keywords.join("，")}
              onChange={(e) =>
                updateSource(source.id, {
                  keywords: parseKeywords(e.target.value),
                })
              }
              placeholder="关键词过滤（可选）：实习，产品"
            />
            {source.last_scrape_status && (
              <p className="text-xs text-slate-500">
                上次：{source.last_scrape_status}
                {source.last_scrape_count > 0 ? ` · ${source.last_scrape_count} 条` : ""}
              </p>
            )}
            <p className="text-xs text-amber-600">修改后请点击页面上方「保存设置」</p>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <p className="text-slate-500">加载中...</p>;
  }

  if (loadError || !config) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">官网招聘源</h2>
        <div className="card border-red-200 bg-red-50 text-sm text-red-700">
          {loadError || "页面加载失败"}
        </div>
        <button type="button" className="btn-secondary" onClick={load}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">官网招聘源</h2>
        <p className="mt-1 text-slate-500">手动添加公司校招页 URL，仅抓取标题含校招/实习/管培的岗位</p>
      </div>

      <ScrapeLogPanel lines={logs} scraping={scraping} onClear={() => setLogs([])} />

      <div className="card flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={handleScrapeOnly}
          disabled={scraping || saving || adding}
        >
          仅抓取
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleSave}
          disabled={saving || scraping || adding}
        >
          保存设置
        </button>
        <span className="text-sm text-slate-500">已有 {config.sources.length} 家</span>
      </div>

      {message && <div className="text-sm text-slate-600">{message}</div>}

      <div className="card space-y-3 border-blue-100 bg-blue-50/20">
        <h3 className="font-semibold text-slate-900">手动添加新源</h3>
        <p className="text-sm text-slate-500">
          填写新公司信息后点「添加」；添加成功后会出现在下方「管理已有源」列表中。
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">公司名</label>
            <input
              className="input"
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              placeholder="例如：三一重工"
            />
          </div>
          <div>
            <label className="label">校招列表 URL</label>
            <input
              className="input"
              value={draft.list_url}
              onChange={(e) => setDraft({ ...draft, list_url: e.target.value })}
              placeholder="https://xxx.zhiye.com/campus"
            />
          </div>
        </div>
        <div>
          <label className="label">关键词过滤（可选）</label>
          <input
            className="input"
            value={draft.keywords}
            onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
            placeholder="实习，产品"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmitNew}
            disabled={adding || saving}
          >
            {adding ? "添加中…" : "添加"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setDraft(EMPTY_DRAFT)}
            disabled={adding}
          >
            清空
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div ref={manageListRef} className="card space-y-3 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">管理已有源</h3>
            <span className="text-sm text-slate-500">
              {sourceSearch.trim()
                ? `显示 ${filteredSources.length} / ${config.sources.length} 家`
                : `共 ${config.sources.length} 家`}
            </span>
          </div>

          <input
            className="input"
            value={sourceSearch}
            onChange={(e) => setSourceSearch(e.target.value)}
            placeholder="搜索公司名、URL 或关键词…"
          />

          {config.sources.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              暂无招聘源。请在上方「手动添加新源」中填写并添加。
            </p>
          ) : filteredSources.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              没有匹配的招聘源，请换个关键词试试。
            </p>
          ) : (
            <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {filteredSources.map(renderSourceItem)}
            </div>
          )}

          <p className="text-xs text-slate-400">
            列表默认折叠，点「编辑」可修改单条；修改后需点「保存设置」。
          </p>
        </div>

        <div className="card space-y-3">
          <h3 className="font-semibold text-slate-900">定时策略</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.auto_scrape_enabled}
              onChange={(e) => {
                configDirtyRef.current = true;
                setConfig({ ...config, auto_scrape_enabled: e.target.checked });
              }}
            />
            开启定时自动抓取（每小时检查）
          </label>
          <div>
            <label className="label">默认间隔（小时）</label>
            <input
              className="input w-28"
              type="number"
              min={1}
              max={168}
              value={config.default_interval_hours}
              onChange={(e) => {
                configDirtyRef.current = true;
                setConfig({ ...config, default_interval_hours: Number(e.target.value) || 24 });
              }}
            />
          </div>
          <p className="text-sm text-slate-500">
            结果在{" "}
            <Link to="/career-jobs" className="text-blue-600 hover:underline">
              官网岗位
            </Link>{" "}
            筛选导出
          </p>
        </div>
      </div>
    </div>
  );
};
