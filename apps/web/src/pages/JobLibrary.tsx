import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { api, JobLibraryItem, JobLibraryList } from "../api/client";
import Pagination from "../components/Pagination";

type Scope = "progress" | "all";

type JobLibraryColumnId =
  | "company"
  | "recommendation"
  | "targetDirection"
  | "otherDirections"
  | "jobTitle"
  | "companyType"
  | "industry"
  | "city"
  | "cohort"
  | "education"
  | "updatedDate"
  | "matchBasis"
  | "recommendedResume"
  | "riskNote"
  | "announcement"
  | "application"
  | "sourceStatus"
  | "personalNote"
  | "workspaceRecord"
  | "actions";

type JobLibraryColumnDefinition = {
  id: JobLibraryColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
};

const JOB_LIBRARY_COLUMNS: readonly JobLibraryColumnDefinition[] = [
  { id: "company", label: "公司名称", defaultWidth: 220, minWidth: 120 },
  { id: "recommendation", label: "分类", defaultWidth: 150, minWidth: 100 },
  { id: "targetDirection", label: "目标方向", defaultWidth: 190, minWidth: 120 },
  { id: "otherDirections", label: "其他匹配方向", defaultWidth: 220, minWidth: 140 },
  { id: "jobTitle", label: "岗位", defaultWidth: 260, minWidth: 140 },
  { id: "companyType", label: "企业性质", defaultWidth: 130, minWidth: 100 },
  { id: "industry", label: "行业分类", defaultWidth: 180, minWidth: 110 },
  { id: "city", label: "工作地点", defaultWidth: 180, minWidth: 110 },
  { id: "cohort", label: "届次", defaultWidth: 110, minWidth: 88 },
  { id: "education", label: "学历要求", defaultWidth: 120, minWidth: 96 },
  { id: "updatedDate", label: "更新时间", defaultWidth: 130, minWidth: 110 },
  { id: "matchBasis", label: "匹配依据", defaultWidth: 280, minWidth: 160 },
  { id: "recommendedResume", label: "建议简历", defaultWidth: 240, minWidth: 140 },
  { id: "riskNote", label: "风险提醒", defaultWidth: 260, minWidth: 150 },
  { id: "announcement", label: "公告", defaultWidth: 110, minWidth: 88 },
  { id: "application", label: "投递页", defaultWidth: 120, minWidth: 96 },
  { id: "sourceStatus", label: "原状态", defaultWidth: 170, minWidth: 110 },
  { id: "personalNote", label: "个人备注", defaultWidth: 260, minWidth: 150 },
  { id: "workspaceRecord", label: "工作台记录", defaultWidth: 230, minWidth: 150 },
  { id: "actions", label: "操作", defaultWidth: 180, minWidth: 150 },
];

const JOB_LIBRARY_COLUMN_BY_ID = Object.fromEntries(
  JOB_LIBRARY_COLUMNS.map((column) => [column.id, column]),
) as Record<JobLibraryColumnId, JobLibraryColumnDefinition>;
const DEFAULT_JOB_LIBRARY_COLUMN_WIDTHS = Object.fromEntries(
  JOB_LIBRARY_COLUMNS.map((column) => [column.id, column.defaultWidth]),
) as Record<JobLibraryColumnId, number>;
const JOB_LIBRARY_TABLE_SETTINGS_KEY = "job-assistant:job-library:table-settings:v1";
const SELECT_COLUMN_WIDTH = 48;

function readColumnWidths(): Record<JobLibraryColumnId, number> {
  const widths = { ...DEFAULT_JOB_LIBRARY_COLUMN_WIDTHS };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(JOB_LIBRARY_TABLE_SETTINGS_KEY) || "{}") as {
      widths?: Record<string, unknown>;
    };
    for (const column of JOB_LIBRARY_COLUMNS) {
      const savedWidth = parsed.widths?.[column.id];
      if (typeof savedWidth === "number" && Number.isFinite(savedWidth)) {
        widths[column.id] = Math.max(column.minWidth, Math.min(640, Math.round(savedWidth)));
      }
    }
  } catch {
    // 存储内容损坏或浏览器禁用本地存储时使用默认列宽。
  }
  return widths;
}

type SavedJobLibraryState = {
  scope?: Scope;
  keyword?: string;
  direction?: string;
  company?: string;
  hideApplied?: boolean;
  hideSoe?: boolean;
  showHidden?: boolean;
  selected?: string[];
  page?: number;
};

const JOB_LIBRARY_STATE_KEY = "job-assistant:job-library:view-state:v1";

function readSavedState(): SavedJobLibraryState {
  try {
    const raw = window.localStorage.getItem(JOB_LIBRARY_STATE_KEY);
    return raw ? JSON.parse(raw) as SavedJobLibraryState : {};
  } catch {
    return {};
  }
}

const LEVEL_STYLE: Record<string, string> = {
  核心推荐: "bg-emerald-100 text-emerald-800",
  可投递: "bg-blue-100 text-blue-800",
  总库: "bg-slate-100 text-slate-700",
};

const WORKSPACE_STATUS_LABEL: Record<string, string> = {
  ready: "待投递",
  applied: "已投递",
  written_test: "笔试中",
  interview: "面试中",
  final_interview: "终面",
  offer: "已录取",
  hired: "已录取",
  rejected: "未通过",
};

export default function JobLibraryPage() {
  const savedStateRef = useRef(readSavedState());
  const savedState = savedStateRef.current;
  const [scope, setScope] = useState<Scope>(savedState.scope === "all" ? "all" : "progress");
  const [data, setData] = useState<JobLibraryList | null>(null);
  const [keyword, setKeyword] = useState(savedState.keyword || "");
  const [direction, setDirection] = useState(savedState.direction || "");
  const [company, setCompany] = useState(savedState.company || "");
  const [hideApplied, setHideApplied] = useState(Boolean(savedState.hideApplied));
  const [hideSoe, setHideSoe] = useState(Boolean(savedState.hideSoe));
  const [showHidden, setShowHidden] = useState(Boolean(savedState.showHidden));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(Array.isArray(savedState.selected) ? savedState.selected : []));
  const [bulkWorking, setBulkWorking] = useState(false);
  const [page, setPage] = useState(Number.isInteger(savedState.page) && Number(savedState.page) > 0 ? Number(savedState.page) : 1);
  const pageSize = 5;
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingApply, setPendingApply] = useState<JobLibraryItem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const openedAtRef = useRef(0);
  const requestSeqRef = useRef(0);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<Record<JobLibraryColumnId, number>>(readColumnWidths);

  const load = async () => {
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const next = await api.getJobLibrary({ scope, keyword, direction, company, hide_applied: hideApplied, hide_soe: hideSoe, show_hidden: showHidden, page, page_size: pageSize });
      if (requestSeq === requestSeqRef.current) setData(next);
    } catch (e) {
      if (requestSeq === requestSeqRef.current) setError(e instanceof Error ? e.message : "加载岗位信息库失败");
    } finally {
      if (requestSeq === requestSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(load, 300);
    return () => window.clearTimeout(timer);
  }, [scope, keyword, direction, company, hideApplied, hideSoe, showHidden, page]);

  useEffect(() => {
    try {
      window.localStorage.setItem(JOB_LIBRARY_STATE_KEY, JSON.stringify({
        scope,
        keyword,
        direction,
        company,
        hideApplied,
        hideSoe,
        showHidden,
        selected: Array.from(selected),
        page,
      } satisfies SavedJobLibraryState));
    } catch {
      // 浏览器禁用本地存储时仍允许正常使用页面。
    }
  }, [scope, keyword, direction, company, hideApplied, hideSoe, showHidden, selected, page]);

  useEffect(() => {
    try {
      window.localStorage.setItem(JOB_LIBRARY_TABLE_SETTINGS_KEY, JSON.stringify({ widths: columnWidths }));
    } catch {
      // 浏览器禁用本地存储时，当前页面内仍可正常调整。
    }
  }, [columnWidths]);

  const changeScope = (next: Scope) => {
    setScope(next);
    setDirection("");
    setCompany("");
    setPage(1);
    setNotice("");
  };

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelected((current) => {
      const pageIds = rows.map((item) => item.id);
      const allSelected = pageIds.length > 0 && pageIds.every((id) => current.has(id));
      const next = new Set(current);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const applyBulkHidden = async (hidden: boolean) => {
    if (selected.size === 0 || bulkWorking) return;
    const sourceKeys = Array.from(selected);
    setBulkWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await api.bulkSetJobLibraryHidden(sourceKeys, hidden);
      setNotice(
        hidden
          ? `已隐藏 ${result.updated} 个岗位（共请求 ${result.requested} 个）。`
          : `已取消隐藏 ${result.updated} 个岗位（共请求 ${result.requested} 个）。`,
      );
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量更新隐藏标记失败");
    } finally {
      setBulkWorking(false);
    }
  };

  const addToWorkspace = async (item: JobLibraryItem, markApplied = false): Promise<boolean> => {
    setWorkingId(item.id);
    setError("");
    setNotice("");
    try {
      await api.trackJobLibraryItem(scope, item.id, markApplied);
      setNotice(
        markApplied
          ? `已将「${item.company} / ${item.job_title}」加入投递工作台并标记为已投递，该公司的岗位已从信息库主列表隐藏。`
          : `已将「${item.company} / ${item.job_title}」加入投递工作台，可在那里维护投递、笔试和面试进度。`,
      );
      if (markApplied) {
        setSelected((current) => {
          if (!current.has(item.id)) return current;
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "加入投递工作台失败");
      return false;
    } finally {
      setWorkingId("");
    }
  };

  const openApplyPage = (item: JobLibraryItem) => {
    const url = item.application_url || item.announcement_url;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    openedAtRef.current = Date.now();
    setPendingApply(item);
    setConfirming(false);
  };

  const confirmDelivery = async (markApplied: boolean) => {
    if (!pendingApply) return;
    const ok = await addToWorkspace(pendingApply, markApplied);
    if (ok) {
      setPendingApply(null);
      setConfirming(false);
    }
  };

  const dismissDelivery = () => {
    setPendingApply(null);
    setConfirming(false);
  };

  const resizeColumn = (event: ReactMouseEvent<HTMLButtonElement>, columnId: JobLibraryColumnId) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[columnId];
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: globalThis.MouseEvent) => {
      const definition = JOB_LIBRARY_COLUMN_BY_ID[columnId];
      const nextWidth = Math.max(definition.minWidth, Math.min(640, Math.round(startWidth + moveEvent.clientX - startX)));
      setColumnWidths((current) => current[columnId] === nextWidth ? current : { ...current, [columnId]: nextWidth });
    };
    const onUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const resetColumnWidth = (columnId: JobLibraryColumnId) => {
    setColumnWidths((current) => ({
      ...current,
      [columnId]: JOB_LIBRARY_COLUMN_BY_ID[columnId].defaultWidth,
    }));
  };

  useEffect(() => {
    if (!pendingApply) return;
    const handleReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - openedAtRef.current < 600) return;
      setConfirming(true);
    };
    window.addEventListener("focus", handleReturn);
    document.addEventListener("visibilitychange", handleReturn);
    return () => {
      window.removeEventListener("focus", handleReturn);
      document.removeEventListener("visibilitychange", handleReturn);
    };
  }, [pendingApply]);

  const rows = data?.items ?? [];
  const tableWidth = SELECT_COLUMN_WIDTH + JOB_LIBRARY_COLUMNS.reduce(
    (total, column) => total + columnWidths[column.id],
    0,
  );
  const syncScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
  };

  const renderCell = (item: JobLibraryItem, columnId: JobLibraryColumnId): ReactNode => {
    const url = item.application_url || item.announcement_url;
    switch (columnId) {
      case "company":
        return item.company;
      case "recommendation":
        return <><span className={`badge ${LEVEL_STYLE[item.recommendation_level] || "bg-slate-100 text-slate-700"}`}>{item.recommendation_level || "可投"}</span>{item.hidden && <span className="ml-2 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">已隐藏</span>}</>;
      case "targetDirection":
        return <span className="badge bg-indigo-50 text-indigo-700">{item.target_direction || "未分类"}</span>;
      case "otherDirections":
        return item.other_directions || "—";
      case "jobTitle":
        return item.job_title;
      case "companyType":
        return item.company_type || "—";
      case "industry":
        return item.industry || "—";
      case "city":
        return item.city || "—";
      case "cohort":
        return item.cohort || "—";
      case "education":
        return item.education || "—";
      case "updatedDate":
        return item.updated_date || "—";
      case "matchBasis":
        return item.match_basis || "—";
      case "recommendedResume":
        return item.recommended_resume || "—";
      case "riskNote":
        return item.risk_note || "—";
      case "announcement":
        return item.announcement_url ? <a className="whitespace-nowrap text-blue-600 hover:underline" href={item.announcement_url} target="_blank" rel="noreferrer">打开公告</a> : "—";
      case "application":
        return item.application_url ? <button type="button" className="whitespace-nowrap text-blue-600 hover:underline" onClick={() => openApplyPage(item)}>打开投递页</button> : "—";
      case "sourceStatus":
        return item.source_status || "—";
      case "personalNote":
        return item.personal_note || "—";
      case "workspaceRecord":
        return <><p className="text-xs text-slate-500">该公司已记录 {item.company_tracked_count} 个岗位</p>{item.tracked_job_id && <span className="mt-2 inline-flex rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">已进工作台 · {WORKSPACE_STATUS_LABEL[item.tracked_status || ""] || item.tracked_status}</span>}</>;
      case "actions":
        return <div className="flex flex-col gap-2"><button className="btn-primary" disabled={!url || workingId === item.id || Boolean(item.tracked_job_id)} onClick={() => addToWorkspace(item)}>{workingId === item.id ? "处理中…" : item.tracked_job_id ? "已加入工作台" : "加入投递工作台"}</button>{url && <button type="button" className="btn-secondary text-center" onClick={() => openApplyPage(item)}>打开招聘页</button>}</div>;
    }
  };

  const cellClassName = (columnId: JobLibraryColumnId, hidden: boolean) => {
    const base = "overflow-hidden break-words px-3 py-4";
    switch (columnId) {
      case "company":
        return `${base} font-semibold text-slate-900`;
      case "recommendation":
        return `${base} px-4`;
      case "targetDirection":
        return base;
      case "otherDirections":
      case "matchBasis":
      case "personalNote":
        return `${base} text-xs leading-5 text-slate-600`;
      case "jobTitle":
      case "industry":
      case "city":
      case "sourceStatus":
        return `${base} text-slate-600`;
      case "companyType":
      case "cohort":
      case "education":
      case "updatedDate":
        return `${base} whitespace-nowrap text-slate-600`;
      case "recommendedResume":
        return `${base} text-xs font-medium leading-5 text-blue-700`;
      case "riskNote":
        return `${base} text-xs leading-5 text-amber-700`;
      case "actions":
        return `${base} sticky right-0 whitespace-nowrap ${hidden ? "bg-slate-100" : "bg-white"} shadow-[-4px_0_8px_rgba(15,23,42,0.06)]`;
      default:
        return base;
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold text-slate-900">岗位信息库</h2>
        <p className="mt-1 text-slate-500">推进岗位用于重点筛选和跟进；全部岗位保留校招总表。选中岗位后手动打开招聘页，并加入工作台管理进度。</p>
      </header>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex w-fit rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button className={`rounded-md px-4 py-2 text-sm ${scope === "progress" ? "bg-white font-semibold text-blue-600 shadow-sm" : "text-slate-600"}`} onClick={() => changeScope("progress")}>推进岗位（核心推荐 + 可投递）</button>
            <button className={`rounded-md px-4 py-2 text-sm ${scope === "all" ? "bg-white font-semibold text-blue-600 shadow-sm" : "text-slate-600"}`} onClick={() => changeScope("all")}>全部岗位</button>
          </div>
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-sm transition ${hideApplied ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}
            onClick={() => { setHideApplied((value) => !value); setPage(1); }}
          >
            {hideApplied ? "✓ 已隐藏已投递" : "隐藏已投递"}
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-sm transition ${hideSoe ? "border-amber-300 bg-amber-50 font-medium text-amber-700" : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"}`}
            onClick={() => { setHideSoe((value) => !value); setPage(1); }}
            title="企业性质包含「央企/央国企/国企/国资」的岗位会被隐藏"
          >
            {hideSoe ? "✓ 已隐藏央国企" : "隐藏央国企"}
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-sm transition ${showHidden ? "border-slate-500 bg-slate-100 font-medium text-slate-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}
            onClick={() => { setShowHidden((value) => !value); setPage(1); }}
            title="默认不显示已手动隐藏的岗位，开启后可查看并取消隐藏"
          >
            {showHidden ? "✓ 显示中（已隐藏岗位）" : "显示隐藏"}
          </button>
        </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label><span className="label">搜索</span><input className="input" value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1); }} placeholder="公司、岗位、方向、城市" /></label>
          <label><span className="label">方向</span><select className="input" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }}><option value="">全部方向</option>{data?.directions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="label">公司</span><input className="input" value={company} onChange={(e) => { setCompany(e.target.value); setPage(1); }} placeholder="输入公司名称，支持模糊搜索" /></label>
        </div>
      </section>

      {error && <div className="card border-red-200 bg-red-50 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="card border-green-200 bg-green-50 py-3 text-sm text-green-800">{notice}</div>}
      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-slate-300 bg-slate-50 py-3">
          <p className="text-sm text-slate-700">
            已选中 <span className="font-semibold text-slate-900">{selected.size}</span> 个岗位
            <span className="ml-2 text-xs text-slate-500">（选择会跨筛选、分页和页面切换保留）</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={bulkWorking}
              onClick={() => setSelected(new Set())}
            >
              取消选择
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={bulkWorking}
              onClick={() => applyBulkHidden(true)}
            >
              {bulkWorking ? "处理中…" : "标记隐藏"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-500 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={bulkWorking}
              onClick={() => applyBulkHidden(false)}
              title="需要先在右上角打开「显示隐藏」才能看到已隐藏岗位"
            >
              {bulkWorking ? "处理中…" : "取消隐藏"}
            </button>
          </div>
        </div>
      )}
      {pendingApply && !confirming && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-blue-200 bg-blue-50 py-3">
          <p className="text-sm text-blue-900">
            已打开「{pendingApply.company} / {pendingApply.job_title}」的招聘页，投递完成后回来确认结果。
          </p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => setConfirming(true)}>确认投递结果</button>
            <button className="btn-secondary" onClick={dismissDelivery}>忽略</button>
          </div>
        </div>
      )}
      {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} />}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <span>当前共 {data?.total ?? 0} 条，每页固定显示 5 条</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-blue-600">拖动表头分隔线调整列宽，双击分隔线恢复单列</span>
            <button type="button" className="font-medium text-slate-600 hover:text-blue-600" onClick={() => setColumnWidths({ ...DEFAULT_JOB_LIBRARY_COLUMN_WIDTHS })}>恢复默认列宽</button>
          </div>
        </div>
        <div ref={topScrollRef} className="overflow-x-auto border-b border-slate-200 bg-slate-100" onScroll={(event) => syncScroll(event.currentTarget, tableScrollRef.current)}><div className="h-4" style={{ width: tableWidth }} /></div>
        <div ref={tableScrollRef} className="overflow-x-auto" onScroll={(event) => syncScroll(event.currentTarget, topScrollRef.current)}>
          <table className="table-fixed text-left text-sm" style={{ width: tableWidth }}>
            <colgroup>
              <col style={{ width: SELECT_COLUMN_WIDTH }} />
              {JOB_LIBRARY_COLUMNS.map((column) => <col key={column.id} style={{ width: columnWidths[column.id] }} />)}
            </colgroup>
            <thead className="sticky top-0 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-3 py-3"><input type="checkbox" aria-label="选择本页全部岗位" className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed" disabled={rows.length === 0} ref={(el) => { if (el) { const ids = rows.map((item) => item.id); el.checked = ids.length > 0 && ids.every((id) => selected.has(id)); el.indeterminate = !el.checked && ids.some((id) => selected.has(id)); } }} onChange={toggleSelectPage} /></th>
                {JOB_LIBRARY_COLUMNS.map((column) => (
                  <th
                    key={column.id}
                    className={`relative overflow-hidden px-3 py-3 pr-5 ${column.id === "actions" ? "sticky right-0 bg-slate-50 shadow-[-4px_0_8px_rgba(15,23,42,0.06)]" : ""}`}
                  >
                    <span className="block truncate">{column.label}</span>
                    <button
                      type="button"
                      aria-label={`调整${column.label}列宽`}
                      title={`拖动调整${column.label}列宽，双击恢复默认宽度`}
                      className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize border-r border-transparent hover:border-blue-400 focus:border-blue-500 focus:outline-none"
                      onMouseDown={(event) => resizeColumn(event, column.id)}
                      onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); resetColumnWidth(column.id); }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((item) => {
                const isHidden = item.hidden;
                return <tr key={item.id} className={`align-top hover:bg-blue-50/30 ${isHidden ? "bg-slate-100/70 text-slate-500" : ""}`}>
                  <td className="px-3 py-4"><input type="checkbox" aria-label={`选择 ${item.company} ${item.job_title}`} className="h-4 w-4 cursor-pointer" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} /></td>
                  {JOB_LIBRARY_COLUMNS.map((column) => (
                    <td key={column.id} className={cellClassName(column.id, isHidden)}>{renderCell(item, column.id)}</td>
                  ))}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && <p className="py-14 text-center text-sm text-slate-500">当前筛选条件下没有岗位</p>}
        {loading && <p className="py-14 text-center text-sm text-slate-500">正在加载岗位信息库…</p>}
      </section>

      {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} />}

      {pendingApply && confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">投递结果确认</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              你刚刚打开了「<span className="font-medium text-slate-900">{pendingApply.company} / {pendingApply.job_title}</span>」的招聘页，是否已经完成投递？
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button className="btn-primary" disabled={workingId === pendingApply.id} onClick={() => confirmDelivery(true)}>
                {workingId === pendingApply.id ? "处理中…" : "已投递，加入工作台"}
              </button>
              <button className="btn-secondary" disabled={workingId === pendingApply.id} onClick={() => confirmDelivery(false)}>
                还没投，先记入工作台（待投递）
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                onClick={dismissDelivery}
              >
                不投了，忽略
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
