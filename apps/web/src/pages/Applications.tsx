import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

import {
  api,
  ApplicationStageId,
  ApplicationWorkspace,
  Job,
  JobPipelineUpdate,
  ManualJobCreate,
} from "../api/client";

const PROGRESS_OPTIONS: Array<{ value: ApplicationStageId; label: string; tone: string }> = [
  { value: "pending", label: "投递筛选中", tone: "bg-sky-50 text-sky-700" },
  { value: "written_test", label: "笔试中", tone: "bg-amber-50 text-amber-700" },
  { value: "interview", label: "面试中", tone: "bg-violet-50 text-violet-700" },
  { value: "final_interview", label: "评估中", tone: "bg-indigo-50 text-indigo-700" },
  { value: "closed", label: "结果已公布", tone: "bg-emerald-50 text-emerald-700" },
  { value: "skipped", label: "已结束", tone: "bg-slate-100 text-slate-600" },
  { value: "withdrawn", label: "已终止", tone: "bg-rose-50 text-rose-700" },
];

const RESULT_OPTIONS = [
  { value: "", label: "—" },
  { value: "received", label: "已录取 OC" },
  { value: "rejected", label: "未录取" },
  { value: "pending", label: "待定" },
];

const WRITTEN_TEST_OPTIONS = ["", "是", "否"];
const ASSESSMENT_OPTIONS = ["", "无需测评", "需测评", "已测评"];
const INTERVIEW_OPTIONS = ["", "否", "待安排", "一面", "二面", "三面", "AI面", "群面", "HR面", "终面"];
const ALL_FILTER = "__all__";
const EMPTY_FILTER = "__empty__";

type ColumnId =
  | "applicationNumber"
  | "company"
  | "link"
  | "jobCategory"
  | "progress"
  | "result"
  | "appliedAt"
  | "city"
  | "writtenTest"
  | "assessment"
  | "interview"
  | "notes";

type ColumnDefinition = {
  id: ColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
};

const COLUMN_DEFINITIONS: readonly ColumnDefinition[] = [
  { id: "applicationNumber", label: "投递编号", defaultWidth: 112, minWidth: 88 },
  { id: "company", label: "公司", defaultWidth: 192, minWidth: 100 },
  { id: "link", label: "链接", defaultWidth: 320, minWidth: 150 },
  { id: "jobCategory", label: "岗位类型", defaultWidth: 176, minWidth: 110 },
  { id: "progress", label: "进展", defaultWidth: 160, minWidth: 120 },
  { id: "result", label: "结果", defaultWidth: 144, minWidth: 100 },
  { id: "appliedAt", label: "投递日期", defaultWidth: 160, minWidth: 130 },
  { id: "city", label: "base 地", defaultWidth: 160, minWidth: 100 },
  { id: "writtenTest", label: "是否需要笔试", defaultWidth: 160, minWidth: 120 },
  { id: "assessment", label: "测评状态", defaultWidth: 160, minWidth: 120 },
  { id: "interview", label: "是否面试", defaultWidth: 144, minWidth: 110 },
  { id: "notes", label: "备注", defaultWidth: 288, minWidth: 140 },
];

const COLUMN_BY_ID = Object.fromEntries(
  COLUMN_DEFINITIONS.map((column) => [column.id, column]),
) as Record<ColumnId, ColumnDefinition>;
const DEFAULT_COLUMN_ORDER = COLUMN_DEFINITIONS.map((column) => column.id);
const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(
  COLUMN_DEFINITIONS.map((column) => [column.id, column.defaultWidth]),
) as Record<ColumnId, number>;
const TABLE_SETTINGS_KEY = "job-assistant:applications:table-settings:v1";

function readTableSettings() {
  const fallback = {
    order: [...DEFAULT_COLUMN_ORDER],
    widths: { ...DEFAULT_COLUMN_WIDTHS },
  };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TABLE_SETTINGS_KEY) || "{}") as {
      order?: unknown;
      widths?: Record<string, unknown>;
    };
    const validIds = new Set(DEFAULT_COLUMN_ORDER);
    const savedOrder = Array.isArray(parsed.order)
      ? parsed.order.filter((id): id is ColumnId => typeof id === "string" && validIds.has(id as ColumnId))
      : [];
    const order = Array.from(new Set([...savedOrder, ...DEFAULT_COLUMN_ORDER]));
    const widths = { ...DEFAULT_COLUMN_WIDTHS };
    for (const id of DEFAULT_COLUMN_ORDER) {
      const savedWidth = parsed.widths?.[id];
      if (typeof savedWidth === "number" && Number.isFinite(savedWidth)) {
        widths[id] = Math.max(COLUMN_BY_ID[id].minWidth, Math.min(640, Math.round(savedWidth)));
      }
    }
    return { order, widths };
  } catch {
    return fallback;
  }
}

function matchesFilter(value: string | undefined, filter: string) {
  if (filter === ALL_FILTER) return true;
  if (filter === EMPTY_FILTER) return !value;
  return value === filter;
}

function isRejected(job: Job) {
  return job.status === "rejected" || job.offer_status === "rejected";
}

function progressValue(status: string): ApplicationStageId {
  if (["pending", "preparing", "ready", "greeted", "applied"].includes(status)) return "pending";
  if (status === "written_test") return "written_test";
  if (status === "interview") return "interview";
  if (status === "final_interview") return "final_interview";
  if (["offer", "hired", "rejected", "closed"].includes(status)) return "closed";
  if (status === "withdrawn") return "withdrawn";
  return "skipped";
}

function progressTone(status: string) {
  const value = progressValue(status);
  return PROGRESS_OPTIONS.find((item) => item.value === value)?.tone || PROGRESS_OPTIONS[0].tone;
}

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function InlineText({
  value,
  onSave,
  placeholder = "—",
  required = false,
  multiline = false,
  className = "",
}: {
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value || ""), [value]);

  const commit = async () => {
    const next = draft.trim();
    if (required && !next) {
      setDraft(value || "");
      return;
    }
    if (next === (value || "")) return;
    setSaving(true);
    try {
      await onSave(next);
    } catch {
      setDraft(value || "");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      setDraft(value || "");
      event.currentTarget.blur();
    }
    if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const shared = `w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-slate-800 outline-none transition hover:border-slate-200 hover:bg-white focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 ${saving ? "opacity-60" : ""} ${className}`;
  if (multiline) {
    return (
      <textarea
        className={`${shared} min-h-16 resize-y`}
        value={draft}
        placeholder={placeholder}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    );
  }
  return (
    <input
      className={shared}
      value={draft}
      placeholder={placeholder}
      disabled={saving}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}

function LinkCell({ job, onSave }: { job: Job; onSave: (value: string) => Promise<void> }) {
  const href = /^https?:\/\//i.test(job.job_url || "") ? job.job_url : "";
  return (
    <div className="flex min-w-0 items-center gap-2">
      {href ? (
        <a
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700"
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          打开 ↗
        </a>
      ) : (
        <span className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs text-slate-400">无链接</span>
      )}
      <InlineText
        value={job.job_url || ""}
        placeholder="粘贴投递链接"
        required
        className="font-mono text-xs"
        onSave={async (value) => onSave(normalizeUrl(value))}
      />
    </div>
  );
}

type NewRecordDraft = ManualJobCreate & {
  offer_status: "" | "pending" | "received" | "rejected";
  written_test_status: string;
  assessment_status: string;
  interview_stage: string;
};

const EMPTY_RECORD: NewRecordDraft = {
  company: "",
  job_title: "",
  job_url: "",
  city: "",
  job_category: "",
  application_notes: "",
  status: "pending",
  priority: 3,
  platform: "manual",
  offer_status: "",
  written_test_status: "",
  assessment_status: "",
  interview_stage: "",
};

function NewRecordDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (job: Job) => void;
}) {
  const [draft, setDraft] = useState<NewRecordDraft>({ ...EMPTY_RECORD });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => firstInput.current?.focus(), []);

  const update = (patch: Partial<NewRecordDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.job_url.trim() || !draft.company.trim()) {
      setError("请填写链接和公司。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let job = await api.createApplicationJob({
        company: draft.company.trim(),
        job_title: `${draft.company.trim()}投递`,
        job_url: normalizeUrl(draft.job_url),
        city: draft.city?.trim() || "",
        job_category: draft.job_category || "",
        application_notes: draft.application_notes?.trim() || "",
        interview_stage: draft.interview_stage,
        status: draft.status,
        priority: 3,
        platform: "manual",
        applied_at: draft.applied_at || null,
      });
      if (draft.offer_status || draft.written_test_status || draft.assessment_status) {
        job = await api.updateApplicationJob(job.id, {
          offer_status: draft.offer_status || "none",
          written_test_status: draft.written_test_status,
          assessment_status: draft.assessment_status,
        });
      }
      onCreated(job);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "新增记录失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl" onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs font-medium text-blue-600">投递计划表</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">新增记录</h2>
          </div>
          <button type="button" className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100" onClick={onClose}>关闭</button>
        </div>
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">链接 *</span><input ref={firstInput} className="input" value={draft.job_url} onChange={(event) => update({ job_url: event.target.value })} placeholder="https://..." /></label>
          <label><span className="label">公司 *</span><input className="input" value={draft.company} onChange={(event) => update({ company: event.target.value })} /></label>
          <label><span className="label">岗位类型</span><input className="input" value={draft.job_category} onChange={(event) => update({ job_category: event.target.value })} placeholder="例如：Java 后端、产品经理" /></label>
          <label>
            <span className="label">进展</span>
            <select className="input" value={draft.status} onChange={(event) => update({ status: event.target.value as ApplicationStageId })}>
              {PROGRESS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span className="label">结果</span>
            <select className="input" value={draft.offer_status} onChange={(event) => update({ offer_status: event.target.value as NewRecordDraft["offer_status"] })}>
              {RESULT_OPTIONS.map((item) => <option key={item.value || "empty"} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label><span className="label">投递日期</span><input type="date" className="input" value={dateInputValue(draft.applied_at)} onChange={(event) => update({ applied_at: event.target.value ? `${event.target.value}T00:00:00` : null })} /></label>
          <label><span className="label">base 地</span><input className="input" value={draft.city} onChange={(event) => update({ city: event.target.value })} /></label>
          <label>
            <span className="label">是否需要笔试</span>
            <select className="input" value={draft.written_test_status} onChange={(event) => update({ written_test_status: event.target.value })}>
              {WRITTEN_TEST_OPTIONS.map((item) => <option key={item || "empty"} value={item}>{item || "—"}</option>)}
            </select>
          </label>
          <label>
            <span className="label">测评状态</span>
            <select className="input" value={draft.assessment_status} onChange={(event) => update({ assessment_status: event.target.value })}>
              {ASSESSMENT_OPTIONS.map((item) => <option key={item || "empty"} value={item}>{item || "—"}</option>)}
            </select>
          </label>
          <label>
            <span className="label">是否面试</span>
            <select className="input" value={draft.interview_stage} onChange={(event) => update({ interview_stage: event.target.value })}>
              {INTERVIEW_OPTIONS.map((item) => <option key={item || "empty"} value={item}>{item || "—"}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2"><span className="label">备注</span><textarea className="input min-h-24" value={draft.application_notes} onChange={(event) => update({ application_notes: event.target.value })} /></label>
          {error && <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? "保存中…" : "保存记录"}</button>
        </div>
      </form>
    </div>
  );
}

export default function ApplicationsPage() {
  const [workspace, setWorkspace] = useState<ApplicationWorkspace | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER);
  const [progressFilter, setProgressFilter] = useState(ALL_FILTER);
  const [resultFilter, setResultFilter] = useState(ALL_FILTER);
  const [writtenTestFilter, setWrittenTestFilter] = useState(ALL_FILTER);
  const [assessmentFilter, setAssessmentFilter] = useState(ALL_FILTER);
  const [interviewFilter, setInterviewFilter] = useState(ALL_FILTER);
  const [hideRejected, setHideRejected] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const initialTableSettings = useRef(readTableSettings());
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(initialTableSettings.current.order);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(initialTableSettings.current.widths);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const columnSettingsRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setWorkspace(await api.getApplicationWorkspace());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载投递计划表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const closeContextMenu = () => {
      setContextMenu(null);
    };
    const closeColumnSettingsOutside = (event: globalThis.Event) => {
      const target = event.target;
      if (target instanceof Node && columnSettingsRef.current?.contains(target)) return;
      setColumnSettingsOpen(false);
    };
    const onClick = (event: globalThis.MouseEvent) => {
      closeContextMenu();
      closeColumnSettingsOutside(event);
    };
    const onScroll = (event: globalThis.Event) => {
      closeContextMenu();
      closeColumnSettingsOutside(event);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeContextMenu();
      setColumnSettingsOpen(false);
    };
    window.addEventListener("click", onClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TABLE_SETTINGS_KEY, JSON.stringify({ order: columnOrder, widths: columnWidths }));
    } catch {
      // 本机浏览器禁用存储时，当前页面内仍可正常调整。
    }
  }, [columnOrder, columnWidths]);

  const jobs = workspace?.jobs || [];
  const categoryOptions = useMemo(() => Array.from(new Set(
    jobs.map((job) => job.job_category?.trim()).filter((value): value is string => Boolean(value)),
  )).sort((left, right) => left.localeCompare(right, "zh-CN")), [jobs]);

  const filteredJobs = useMemo(() => {
    const token = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesSearch = !token || [job.company, job.job_category, job.city, job.assessment_status, job.interview_stage, job.application_notes, job.job_url]
        .some((value) => String(value || "").toLowerCase().includes(token));
      const result = job.offer_status === "none" ? "" : job.offer_status || "";
      return matchesSearch
        && (!hideRejected || !isRejected(job))
        && matchesFilter(job.job_category || "", categoryFilter)
        && matchesFilter(progressValue(job.status), progressFilter)
        && matchesFilter(result, resultFilter)
        && matchesFilter(job.written_test_status || "", writtenTestFilter)
        && matchesFilter(job.assessment_status || "", assessmentFilter)
        && matchesFilter(job.interview_stage || "", interviewFilter);
    });
  }, [jobs, query, categoryFilter, progressFilter, resultFilter, writtenTestFilter, assessmentFilter, interviewFilter, hideRejected]);

  const hasFilters = Boolean(query.trim()) || [categoryFilter, progressFilter, resultFilter, writtenTestFilter, assessmentFilter, interviewFilter]
    .some((value) => value !== ALL_FILTER) || hideRejected;
  const rejectedCount = useMemo(() => jobs.filter(isRejected).length, [jobs]);
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const paginatedJobs = useMemo(
    () => filteredJobs.slice((page - 1) * pageSize, page * pageSize),
    [filteredJobs, page, pageSize],
  );
  const pageNumbers = useMemo(() => {
    const count = Math.min(5, totalPages);
    const start = Math.max(1, Math.min(page - 2, totalPages - count + 1));
    return Array.from({ length: count }, (_, index) => start + index);
  }, [page, totalPages]);
  const pageStart = filteredJobs.length ? (page - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(page * pageSize, filteredJobs.length);

  useEffect(() => { setPage(1); }, [query, categoryFilter, progressFilter, resultFilter, writtenTestFilter, assessmentFilter, interviewFilter, hideRejected, pageSize]);
  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);

  const allSelected = paginatedJobs.length > 0 && paginatedJobs.every((job) => selected.has(job.id));

  const replaceJob = (updated: Job) => {
    setWorkspace((current) => current ? {
      ...current,
      jobs: current.jobs.map((job) => job.id === updated.id ? updated : job),
    } : current);
  };

  const patchJob = async (job: Job, patch: JobPipelineUpdate) => {
    setError("");
    setNotice("");
    try {
      replaceJob(await api.updateApplicationJob(job.id, patch));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "保存失败";
      setError(message);
      throw reason;
    }
  };

  const changeJob = (job: Job, patch: JobPipelineUpdate) => {
    void patchJob(job, patch).catch(() => undefined);
  };

  const resizeColumn = (event: ReactMouseEvent<HTMLButtonElement>, columnId: ColumnId) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[columnId];
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.max(
        COLUMN_BY_ID[columnId].minWidth,
        Math.min(640, Math.round(startWidth + moveEvent.clientX - startX)),
      );
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

  const moveColumn = (columnId: ColumnId, offset: -1 | 1) => {
    setColumnOrder((current) => {
      const index = current.indexOf(columnId);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const onRowContextMenu = (event: ReactMouseEvent, jobId: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selected.has(jobId)) setSelected(new Set([jobId]));
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 64),
    });
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    setContextMenu(null);
    if (!ids.length) return;
    if (!window.confirm(`确定删除选中的 ${ids.length} 条投递记录吗？`)) return;
    setDeleting(true);
    setError("");
    try {
      const result = await api.bulkDeleteApplicationJobs(ids);
      const deletedIds = new Set(ids);
      setWorkspace((current) => current ? { ...current, jobs: current.jobs.filter((job) => !deletedIds.has(job.id)) } : current);
      setSelected(new Set());
      setNotice(`已删除 ${result.deleted} 条记录。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const onCreated = (created: Job) => {
    setWorkspace((current) => current ? {
      ...current,
      jobs: [created, ...current.jobs.filter((job) => job.id !== created.id)],
    } : current);
    setPage(1);
    setSelected(new Set([created.id]));
    setNotice("已新增 1 条投递记录。");
  };

  const duplicateJob = async (job: Job) => {
    setDuplicatingId(job.id);
    setError("");
    setNotice("");
    try {
      const copied = await api.duplicateApplicationJob(job.id);
      setWorkspace((current) => current ? {
        ...current,
        jobs: current.jobs.flatMap((item) => item.id === job.id ? [item, copied] : [item]),
      } : current);
      setSelected(new Set([copied.id]));
      setNotice(`已复制「${job.company}」记录；除投递编号外，其余字段与原记录一致。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "复制记录失败");
    } finally {
      setDuplicatingId(null);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setCategoryFilter(ALL_FILTER);
    setProgressFilter(ALL_FILTER);
    setResultFilter(ALL_FILTER);
    setWrittenTestFilter(ALL_FILTER);
    setAssessmentFilter(ALL_FILTER);
    setInterviewFilter(ALL_FILTER);
    setHideRejected(false);
  };

  const tableWidth = 48 + columnOrder.reduce((total, columnId) => total + columnWidths[columnId], 0);

  const renderCell = (job: Job, columnId: ColumnId) => {
    switch (columnId) {
      case "applicationNumber":
        return (
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-slate-500">{String(job.id).padStart(3, "0")}投递</span>
            <button
              type="button"
              aria-label={`复制 ${job.company} 投递记录`}
              title="复制此行"
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-wait disabled:text-slate-400"
              disabled={duplicatingId !== null}
              onClick={() => void duplicateJob(job)}
            >
              {duplicatingId === job.id ? "复制中…" : "复制"}
            </button>
          </div>
        );
      case "company":
        return <InlineText required value={job.company} onSave={(value) => patchJob(job, { company: value })} />;
      case "link":
        return <LinkCell job={job} onSave={(value) => patchJob(job, { job_url: value })} />;
      case "jobCategory":
        return <InlineText value={job.job_category || ""} placeholder="填写岗位类型" onSave={(value) => patchJob(job, { job_category: value })} />;
      case "progress":
        return (
          <select aria-label={`${job.company} 进展`} className={`w-full rounded-full border border-transparent px-3 py-1.5 text-sm font-medium outline-none ${progressTone(job.status)}`} value={progressValue(job.status)} onChange={(event) => changeJob(job, { status: event.target.value as ApplicationStageId })}>
            {PROGRESS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        );
      case "result":
        return (
          <select aria-label={`${job.company} 结果`} className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none hover:border-slate-200 hover:bg-white focus:border-blue-400" value={job.offer_status === "none" ? "" : job.offer_status || ""} onChange={(event) => changeJob(job, { offer_status: (event.target.value || "none") as JobPipelineUpdate["offer_status"] })}>
            {RESULT_OPTIONS.map((item) => <option key={item.value || "empty"} value={item.value}>{item.label}</option>)}
          </select>
        );
      case "appliedAt":
        return <input aria-label={`${job.company} 投递日期`} type="date" className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none hover:border-slate-200 hover:bg-white focus:border-blue-400" value={dateInputValue(job.applied_at)} onChange={(event) => changeJob(job, { applied_at: event.target.value ? `${event.target.value}T00:00:00` : null })} />;
      case "city":
        return <InlineText value={job.city || ""} onSave={(value) => patchJob(job, { city: value })} />;
      case "writtenTest":
        return (
          <select aria-label={`${job.company} 笔试状态`} className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none hover:border-slate-200 hover:bg-white focus:border-blue-400" value={WRITTEN_TEST_OPTIONS.includes(job.written_test_status || "") ? job.written_test_status : ""} onChange={(event) => changeJob(job, { written_test_status: event.target.value })}>
            {WRITTEN_TEST_OPTIONS.map((item) => <option key={item || "empty"} value={item}>{item || "—"}</option>)}
          </select>
        );
      case "assessment":
        return (
          <select aria-label={`${job.company} 测评状态`} className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none hover:border-slate-200 hover:bg-white focus:border-blue-400" value={job.assessment_status || ""} onChange={(event) => changeJob(job, { assessment_status: event.target.value })}>
            {job.assessment_status && !ASSESSMENT_OPTIONS.includes(job.assessment_status) && <option value={job.assessment_status}>{job.assessment_status}</option>}
            {ASSESSMENT_OPTIONS.map((item) => <option key={item || "empty"} value={item}>{item || "—"}</option>)}
          </select>
        );
      case "interview":
        return (
          <select aria-label={`${job.company} 面试状态`} className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none hover:border-slate-200 hover:bg-white focus:border-blue-400" value={INTERVIEW_OPTIONS.includes(job.interview_stage || "") ? job.interview_stage : ""} onChange={(event) => changeJob(job, { interview_stage: event.target.value })}>
            {INTERVIEW_OPTIONS.map((item) => <option key={item || "empty"} value={item}>{item || "—"}</option>)}
          </select>
        );
      case "notes":
        return <InlineText multiline value={job.application_notes || ""} onSave={(value) => patchJob(job, { application_notes: value })} />;
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-[560px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">求职秋招实习投递进度一表通</h1>
          <p className="mt-1 text-sm text-slate-500">单元格可直接编辑；可在投递编号列复制整行，勾选记录后右击删除。</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索公司、岗位类型或城市"
          />
          <button className="btn-primary" onClick={() => setCreating(true)}>＋ 新增记录</button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</div>}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          <span>投递计划表 · {hasFilters ? `筛选出 ${filteredJobs.length} / ${jobs.length}` : filteredJobs.length} 条记录</span>
          <span>{selected.size ? `已选 ${selected.size} 条 · 右击删除` : "勾选记录后可右击"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <select aria-label="按岗位类型筛选" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value={ALL_FILTER}>全部岗位类型</option>
            <option value={EMPTY_FILTER}>岗位类型未填写</option>
            {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label="按进展筛选" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" value={progressFilter} onChange={(event) => setProgressFilter(event.target.value)}>
            <option value={ALL_FILTER}>全部进展</option>
            {PROGRESS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select aria-label="按结果筛选" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
            <option value={ALL_FILTER}>全部结果</option>
            <option value={EMPTY_FILTER}>结果未填写</option>
            {RESULT_OPTIONS.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select aria-label="按笔试筛选" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" value={writtenTestFilter} onChange={(event) => setWrittenTestFilter(event.target.value)}>
            <option value={ALL_FILTER}>全部笔试状态</option>
            <option value={EMPTY_FILTER}>笔试未填写</option>
            {WRITTEN_TEST_OPTIONS.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label="按测评筛选" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" value={assessmentFilter} onChange={(event) => setAssessmentFilter(event.target.value)}>
            <option value={ALL_FILTER}>全部测评状态</option>
            <option value={EMPTY_FILTER}>测评未填写</option>
            {ASSESSMENT_OPTIONS.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label="按面试筛选" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" value={interviewFilter} onChange={(event) => setInterviewFilter(event.target.value)}>
            <option value={ALL_FILTER}>全部面试状态</option>
            <option value={EMPTY_FILTER}>面试未填写</option>
            {INTERVIEW_OPTIONS.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button
            type="button"
            aria-pressed={hideRejected}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${hideRejected ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            onClick={() => setHideRejected((current) => !current)}
          >
            {hideRejected ? "已隐藏未通过" : "隐藏未通过"}{rejectedCount ? ` (${rejectedCount})` : ""}
          </button>
          {hasFilters && <button type="button" className="rounded-lg px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50" onClick={resetFilters}>重置筛选</button>}
          <div ref={columnSettingsRef} className="relative ml-auto" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              aria-expanded={columnSettingsOpen}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${columnSettingsOpen ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              onClick={() => setColumnSettingsOpen((current) => !current)}
            >
              列设置
            </button>
            {columnSettingsOpen && (
              <div className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">调整列顺序</p>
                    <p className="mt-0.5 text-xs text-slate-500">使用上下按钮排列，拖动表头边缘调整列宽。</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                    onClick={() => {
                      setColumnOrder([...DEFAULT_COLUMN_ORDER]);
                      setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
                    }}
                  >
                    恢复默认
                  </button>
                </div>
                <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
                  {columnOrder.map((columnId, index) => (
                    <div key={columnId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                      <span className="text-slate-400">≡</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{COLUMN_BY_ID[columnId].label}</span>
                      <span className="w-12 text-right text-xs text-slate-400">{columnWidths[columnId]}px</span>
                      <button type="button" aria-label={`上移${COLUMN_BY_ID[columnId].label}`} className="rounded px-1.5 py-1 text-slate-500 hover:bg-white disabled:opacity-25" disabled={index === 0} onClick={() => moveColumn(columnId, -1)}>↑</button>
                      <button type="button" aria-label={`下移${COLUMN_BY_ID[columnId].label}`} className="rounded px-1.5 py-1 text-slate-500 hover:bg-white disabled:opacity-25" disabled={index === columnOrder.length - 1} onClick={() => moveColumn(columnId, 1)}>↓</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="table-fixed border-separate border-spacing-0 text-left text-sm" style={{ width: tableWidth, minWidth: "100%" }}>
            <colgroup>
              <col style={{ width: 48 }} />
              {columnOrder.map((columnId) => <col key={columnId} style={{ width: columnWidths[columnId] }} />)}
            </colgroup>
            <thead className="sticky top-0 z-20 bg-slate-100 text-xs font-semibold text-slate-600 shadow-[0_1px_0_rgba(148,163,184,0.45)]">
              <tr>
                <th className="sticky left-0 z-30 w-12 border-r border-slate-200 bg-slate-100 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => setSelected((current) => {
                      const next = new Set(current);
                      paginatedJobs.forEach((job) => event.target.checked ? next.add(job.id) : next.delete(job.id));
                      return next;
                    })}
                    aria-label="全选记录"
                  />
                </th>
                {columnOrder.map((columnId, index) => (
                  <th
                    key={columnId}
                    className={`group relative px-3 py-3 ${index < columnOrder.length - 1 ? "border-r border-slate-200" : ""}`}
                    style={{ width: columnWidths[columnId] }}
                  >
                    <span className="block truncate pr-2">{COLUMN_BY_ID[columnId].label}</span>
                    <button
                      type="button"
                      aria-label={`调整${COLUMN_BY_ID[columnId].label}列宽`}
                      className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none"
                      onMouseDown={(event) => resizeColumn(event, columnId)}
                    >
                      <span className="mx-auto block h-full w-px bg-slate-300 transition group-hover:bg-blue-500" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedJobs.map((job) => {
                const isSelected = selected.has(job.id);
                return (
                  <tr
                    key={job.id}
                    className={`${isSelected ? "bg-blue-50" : "bg-white hover:bg-slate-50"} transition-colors`}
                    onContextMenu={(event) => onRowContextMenu(event, job.id)}
                  >
                    <td className={`sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-2 text-center ${isSelected ? "bg-blue-50" : "bg-white"}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => setSelected((current) => {
                          const next = new Set(current);
                          event.target.checked ? next.add(job.id) : next.delete(job.id);
                          return next;
                        })}
                        aria-label={`选择 ${job.company}`}
                      />
                    </td>
                    {columnOrder.map((columnId, index) => (
                      <td
                        key={columnId}
                        className={`border-b border-slate-200 px-2 py-1 align-middle ${index < columnOrder.length - 1 ? "border-r" : ""}`}
                        style={{ width: columnWidths[columnId] }}
                      >
                        {renderCell(job, columnId)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filteredJobs.length === 0 && (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-sm text-slate-500">
              <p>{hasFilters ? "没有匹配的投递记录" : "投递计划表还是空的"}</p>
              {!hasFilters && <button className="btn-primary" onClick={() => setCreating(true)}>新增第一条记录</button>}
            </div>
          )}
          {loading && <div className="flex min-h-72 items-center justify-center text-sm text-slate-500">正在加载投递计划表…</div>}
        </div>
        {!loading && filteredJobs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span>显示第 {pageStart}–{pageEnd} 条，共 {filteredJobs.length} 条</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2">
                <span>每页</span>
                <select aria-label="每页显示条数" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 outline-none focus:border-blue-500" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                  {[6, 10, 20, 50].map((size) => <option key={size} value={size}>{size} 条</option>)}
                </select>
              </label>
              <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>上一页</button>
              {pageNumbers.map((pageNumber) => (
                <button key={pageNumber} type="button" aria-label={`第 ${pageNumber} 页`} aria-current={pageNumber === page ? "page" : undefined} className={`min-w-8 rounded-md border px-2.5 py-1.5 ${pageNumber === page ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white hover:bg-slate-100"}`} onClick={() => setPage(pageNumber)}>{pageNumber}</button>
              ))}
              <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>下一页</button>
            </div>
          </div>
        )}
      </section>

      {contextMenu && (
        <div
          className="fixed z-50 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={deleting} onClick={() => void deleteSelected()}>
            <span>{deleting ? "删除中…" : "删除选中记录"}</span>
            <span className="text-xs text-red-400">{selected.size}</span>
          </button>
        </div>
      )}

      {creating && <NewRecordDialog onClose={() => setCreating(false)} onCreated={onCreated} />}
    </div>
  );
}
