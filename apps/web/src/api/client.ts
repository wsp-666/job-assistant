import { clearAuthToken, getAuthToken } from "../utils/authStorage";
import { API_BASE, CLOUD_API_BASE } from "../utils/apiUrl";

function adminApiBase() {
  return (CLOUD_API_BASE || API_BASE).replace(/\/$/, "");
}

async function adminRequest<T>(path: string, options?: RequestInit, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${adminApiBase()}${path}`, { ...options, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `请求失败: ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("运营后台请求超时，请确认云端服务已启动并可访问");
    }
    if (e instanceof TypeError && /fetch/i.test(e.message)) {
      throw new Error("无法连接运营后台，请检查云端地址或网络");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, options?: RequestInit, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const token = getAuthToken();
  const headers = new Headers(options?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
    if (res.status === 401) {
      clearAuthToken();
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `请求失败: ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("请求超时，请确认本地 API 已启动");
    }
    if (e instanceof TypeError && /fetch/i.test(e.message)) {
      throw new Error("无法连接本地服务，请先打开启动器并点击「一键启动」");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface DashboardStats {
  total_jobs: number;
  pending_jobs: number;
  greeted_jobs: number;
  skipped_jobs: number;
  today_jobs: number;
  avg_match_score: number;
}

export interface Job {
  id: number;
  platform: string;
  job_title: string;
  company: string;
  salary: string;
  city: string;
  jd_text: string;
  job_url: string;
  hr_name: string;
  hr_title: string;
  match_score: number;
  role_match_score?: number;
  benefits_match_score?: number;
  company_match_score?: number;
  company_size?: string;
  company_industry?: string;
  status: string;
  has_greeted?: boolean;
  has_applied_resume?: boolean;
  interview_round?: number;
  offer_status?: "none" | "pending" | "received" | "rejected";
  priority: number;
  job_category: string;
  application_channel: string;
  contact_name: string;
  contact_info: string;
  application_notes: string;
  application_tags: string[];
  written_test_status: string;
  interview_stage: string;
  assessment_status: string;
  screening_status: string;
  first_interview_status: string;
  second_interview_status: string;
  third_interview_status: string;
  final_interview_status: string;
  applied_at: string | null;
  next_action_at: string | null;
  interview_at: string | null;
  last_follow_up_at: string | null;
  status_updated_at: string | null;
  tailored_resume?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Resume {
  id: number;
  name: string;
  file_path: string;
  parsed_json: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
}

export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
}

export interface ResumeContent {
  full_name?: string;
  phone?: string;
  email?: string;
  summary?: string;
  education?: string;
  experience?: string;
  projects?: string;
  skills?: string[];
  template_id?: string;
}

export interface JobListResponse {
  items: Job[];
  total: number;
  page: number;
  page_size: number;
}

function normalizeJobListResponse(
  data: JobListResponse | Job[],
  params?: { page?: number; page_size?: number },
): JobListResponse {
  if (!Array.isArray(data)) {
    return {
      items: data.items ?? [],
      total: data.total ?? data.items?.length ?? 0,
      page: data.page ?? params?.page ?? 1,
      page_size: data.page_size ?? params?.page_size ?? 10,
    };
  }
  const page = params?.page ?? 1;
  const pageSize = params?.page_size ?? 10;
  const start = (page - 1) * pageSize;
  return {
    items: data.slice(start, start + pageSize),
    total: data.length,
    page,
    page_size: pageSize,
  };
}

export interface JobPipelineUpdate {
  company?: string;
  job_title?: string;
  job_url?: string;
  city?: string;
  status?: ApplicationStageId;
  priority?: number;
  job_category?: string;
  has_greeted?: boolean;
  has_applied_resume?: boolean;
  interview_round?: number;
  offer_status?: "none" | "pending" | "received" | "rejected";
  application_channel?: string;
  contact_name?: string;
  contact_info?: string;
  application_notes?: string;
  application_tags?: string[];
  written_test_status?: string;
  interview_stage?: string;
  assessment_status?: string;
  screening_status?: string;
  first_interview_status?: string;
  second_interview_status?: string;
  third_interview_status?: string;
  final_interview_status?: string;
  applied_at?: string | null;
  next_action_at?: string | null;
  interview_at?: string | null;
  last_follow_up_at?: string | null;
  event_note?: string;
}

export interface ManualJobCreate {
  company: string;
  job_title: string;
  job_url: string;
  salary?: string;
  city?: string;
  job_category?: string;
  application_channel?: string;
  application_notes?: string;
  interview_stage?: string;
  application_tags?: string[];
  contact_name?: string;
  contact_info?: string;
  status?: ApplicationStageId;
  priority?: number;
  applied_at?: string | null;
  next_action_at?: string | null;
  platform?: string;
}

export type ApplicationStageId =
  | "pending"
  | "preparing"
  | "ready"
  | "greeted"
  | "applied"
  | "written_test"
  | "interview"
  | "final_interview"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn"
  | "closed"
  | "skipped";

export interface ApplicationStage {
  id: ApplicationStageId;
  label: string;
  group: "todo" | "active" | "success" | "stopped" | string;
  rank: number;
  terminal: boolean;
}

export interface ApplicationPriority {
  value: number;
  label: string;
  short_label: string;
}

export interface ApplicationSummary {
  total: number;
  active: number;
  applied: number;
  interviews: number;
  offers: number;
  overdue_actions: number;
  due_today: number;
  conversion_rate: number;
  stage_counts: Record<string, number>;
}

export interface ApplicationWorkspace {
  stages: ApplicationStage[];
  priorities: ApplicationPriority[];
  summary: ApplicationSummary;
  jobs: Job[];
}

export interface ApplicationImportIssue {
  row: number;
  level: "warning" | "error";
  message: string;
}

export interface ApplicationImportResult {
  filename: string;
  total_rows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  issues: ApplicationImportIssue[];
}

export interface JobLibraryItem {
  id: string;
  scope: "all" | "progress";
  recommendation_level: string;
  target_direction: string;
  other_directions: string;
  company: string;
  job_title: string;
  company_type: string;
  industry: string;
  city: string;
  cohort: string;
  education: string;
  updated_date: string;
  match_basis: string;
  recommended_resume: string;
  risk_note: string;
  announcement_url: string;
  application_url: string;
  source_status: string;
  personal_note: string;
  source_row: number;
  hidden: boolean;
  tracked_job_id: number | null;
  tracked_status: string;
  company_tracked_count: number;
}

export interface JobLibraryList {
  items: JobLibraryItem[];
  total: number;
  page: number;
  page_size: number;
  companies: string[];
  directions: string[];
}

export interface ApplicationEvent {
  id: number;
  job_id: number;
  event_type: string;
  from_status: string;
  to_status: string;
  note: string;
  actor: string;
  created_at: string;
}

export interface ApplicationAnswerSet {
  id: string;
  name: string;
  job_category: string;
  resume_id: number | null;
  description: string;
  answers: Record<string, string>;
}

export interface ApplicationAnswerTemplate extends ApplicationAnswerSet {
  resume_hint: string;
}

export interface ApplicationProfile {
  full_name: string;
  phone: string;
  email: string;
  gender: string;
  birth_date: string;
  current_city: string;
  target_city: string;
  native_place: string;
  school: string;
  major: string;
  discipline_category: string;
  degree: string;
  graduation_date: string;
  work_years: string;
  expected_salary: string;
  recruitment_source: string;
  portfolio_url: string;
  github_url: string;
  linkedin_url: string;
  summary: string;
  education: string;
  experience: string;
  projects: string;
  awards: string;
  language_ability: string;
  certificates: string;
  campus_experience: string;
  skills: string[];
  resume_id: number | null;
  custom_fields: Record<string, string>;
  answer_sets: ApplicationAnswerSet[];
  active_answer_set_id: string;
  effective_custom_fields?: Record<string, string>;
  resume_name?: string;
  has_uploadable_resume?: boolean;
  resume_file_url?: string | null;
}

export type ApplicationTaskStatus =
  | "queued"
  | "opening"
  | "waiting_login"
  | "filling"
  | "ready_to_submit"
  | "submitting"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";

export interface ApplicationTask {
  id: number;
  queue_id: number;
  job_id: number;
  sequence: number;
  priority: number;
  status: ApplicationTaskStatus;
  attempt_count: number;
  last_error: string;
  result_message: string;
  page_url: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  job: Job | null;
}

export interface ApplicationQueue {
  id: number;
  name: string;
  status: string;
  auto_submit: boolean;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  tasks: ApplicationTask[];
}

export interface JobTailoredResumeResult {
  job_id: number;
  tailored_resume: Record<string, unknown>;
}

export interface JobRecommendations {
  chat_tips: string[];
  focus_skills: string[];
  pros: string[];
  cons: string[];
}

export interface Greeting {
  id: number;
  job_id: number;
  content: string;
  template_id: string;
  is_sent: boolean;
  sent_at: string | null;
  created_at: string;
}

export interface TargetPosition {
  id: string;
  title: string;
  title_aliases: string[];
  summary: string;
  details: string;
  keywords: string[];
  cities: string[];
  min_salary: number;
  max_salary: number;
  min_salary_unlimited: boolean;
  max_salary_unlimited: boolean;
  include_keywords: string[];
  exclude_keywords: string[];
  greeting_style: string;
  daily_limit: number;
  salary_type_monthly: boolean;
  salary_type_daily: boolean;
  min_daily_salary: number;
  max_daily_salary: number;
  min_daily_salary_unlimited: boolean;
  max_daily_salary_unlimited: boolean;
  job_types: string[];
  weekend_rest: "any" | "double_rest";
  require_social_insurance: boolean;
  want_year_end_bonus: boolean;
  want_commission: boolean;
  want_meal_allowance: boolean;
  want_accommodation: boolean;
  preferred_company_sizes: string[];
  preferred_industries: string[];
  outlook_industries: string[];
  cities_unlimited: boolean;
  company_sizes_unlimited: boolean;
}

export interface Settings {
  target_titles: string[];
  target_positions: TargetPosition[];
  cities: string[];
  min_salary: number;
  max_salary: number;
  min_salary_unlimited: boolean;
  max_salary_unlimited: boolean;
  include_keywords: string[];
  exclude_keywords: string[];
  greeting_style: string;
  daily_limit: number;
}

export interface ApiProfile {
  id: string;
  name: string;
  category: "vision" | "analysis";
  provider: string;
  api_key: string;
  secret_key: string;
  base_url: string;
  model: string;
  options: Record<string, string>;
}

export interface ApiProfiles {
  profiles: ApiProfile[];
  active_vision_id: string;
  active_analysis_id: string;
}

export interface UserProfile {
  id: number;
  nickname: string;
  avatar_url: string;
  created_at: string | null;
}

export interface MembershipStatus {
  active: boolean;
  plan: string;
  plan_label: string;
  expires_at: string | null;
  source: string;
  message: string;
}

export interface AuthSession {
  logged_in: boolean;
  user: UserProfile | null;
  membership: MembershipStatus;
  auth_enabled: boolean;
}

export interface AuthProviders {
  auth_enabled: boolean;
  email: boolean;
  wechat: boolean;
  alipay: boolean;
  payment_mock: boolean;
  dev_login: boolean;
  personal_qr: boolean;
}

export interface MembershipPlan {
  plan: string;
  label: string;
  price_cents: number;
  description: string;
}

export interface PaymentOrder {
  order_id: number;
  out_trade_no: string;
  plan: string;
  plan_label: string;
  amount_cents: number;
  pay_channel: string;
  status: string;
  pay_url?: string | null;
  code_url?: string | null;
  qr_url?: string | null;
  mock: boolean;
  message: string;
  payer_remark: string;
  created_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  can_cancel: boolean;
}

export interface AdminOrder {
  order_id: number;
  out_trade_no: string;
  user_id: number;
  nickname: string;
  plan: string;
  plan_label: string;
  amount_cents: number;
  pay_channel: string;
  status: string;
  payer_remark: string;
  admin_note: string;
  created_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
}

export interface AdminUser {
  id: number;
  nickname: string;
  membership_active: boolean;
  plan_label: string;
  created_at: string | null;
}

export interface CareerSiteSource {
  id: string;
  company: string;
  list_url: string;
  adapter: "auto" | "moka" | "generic";
  enabled: boolean;
  keywords: string[];
  scrape_interval_hours: number;
  last_scraped_at: string | null;
  last_scrape_status: string;
  last_scrape_count: number;
  last_adapter_used: string;
  origin?: "preset" | "manual" | "legacy";
}

export interface CareerSiteConfig {
  sources: CareerSiteSource[];
  auto_scrape_enabled: boolean;
  default_interval_hours: number;
}

export interface CareerScrapeItemResult {
  source_id: string;
  company: string;
  adapter_used: string;
  fetched: number;
  created: number;
  updated: number;
  message: string;
  logs: string[];
}

export interface CareerBackgroundScrapeStatus {
  running: boolean;
  task_id: string;
  started_at: string | null;
  finished_at: string | null;
  total: number;
  completed: number;
  current_company: string;
  logs: string[];
  summary: string;
  total_created: number;
  total_updated: number;
  total_fetched: number;
  error: string;
}

export interface CareerSitePreset {
  id: string;
  company: string;
  list_url: string;
  adapter: "auto" | "moka" | "generic";
  category: string;
  keywords: string[];
  note: string;
  already_imported: boolean;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  getSetupPaths: () => request<{ install_dir: string; extension_dir: string }>("/api/setup/paths"),
  getDashboard: () => request<DashboardStats>("/api/stats/dashboard"),
  getJobs: async (params?: {
    status?: string;
    min_score?: number;
    sort?: string;
    order?: "asc" | "desc";
    platform?: string;
    company?: string;
    city?: string;
    keyword?: string;
    page?: number;
    page_size?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.min_score != null) q.set("min_score", String(params.min_score));
    if (params?.sort) q.set("sort", params.sort);
    if (params?.order) q.set("order", params.order);
    if (params?.platform) q.set("platform", params.platform);
    if (params?.company) q.set("company", params.company);
    if (params?.city) q.set("city", params.city);
    if (params?.keyword) q.set("keyword", params.keyword);
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const qs = q.toString();
    const data = await request<JobListResponse | Job[]>(`/api/jobs${qs ? `?${qs}` : ""}`);
    return normalizeJobListResponse(data, params);
  },
  exportJobsExcel: async (params?: {
    status?: string;
    min_score?: number;
    platform?: string;
    company?: string;
    city?: string;
    keyword?: string;
    sort?: string;
    order?: "asc" | "desc";
  }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.min_score != null) q.set("min_score", String(params.min_score));
    if (params?.platform) q.set("platform", params.platform);
    if (params?.company) q.set("company", params.company);
    if (params?.city) q.set("city", params.city);
    if (params?.keyword) q.set("keyword", params.keyword);
    if (params?.sort) q.set("sort", params.sort);
    if (params?.order) q.set("order", params.order);
    const qs = q.toString();
    const res = await fetch(`${API_BASE}/api/jobs/export/excel${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `导出失败: ${res.status}`);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const plainMatch = /filename="?([^";]+)"?/i.exec(cd);
    const filename = utf8Match
      ? decodeURIComponent(utf8Match[1])
      : plainMatch?.[1] || `岗位采集_${Date.now()}.xlsx`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  },
  getJob: (id: number) => request<Job>(`/api/jobs/${id}`),
  getCareerJobMeta: () =>
    request<{ companies: string[]; cities: string[] }>("/api/jobs/meta/career"),
  updateJobStatus: (id: number, status: string) =>
    request<Job>(`/api/jobs/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
  updateJobPipeline: (id: number, data: JobPipelineUpdate) =>
    request<Job>(`/api/jobs/${id}/pipeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getApplicationWorkspace: (params?: { status?: string; keyword?: string; priority?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.keyword) q.set("keyword", params.keyword);
    if (params?.priority) q.set("priority", String(params.priority));
    const qs = q.toString();
    return request<ApplicationWorkspace>(`/api/applications/workspace${qs ? `?${qs}` : ""}`);
  },
  bulkDeleteApplicationJobs: (jobIds: number[]) =>
    request<{ requested: number; deleted: number }>("/api/applications/jobs/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_ids: jobIds }),
    }),
  getJobLibrary: (params?: {
    scope?: "all" | "progress";
    keyword?: string;
    direction?: string;
    company?: string;
    hide_applied?: boolean;
    hide_soe?: boolean;
    show_hidden?: boolean;
    page?: number;
    page_size?: number;
  }) => {
    const q = new URLSearchParams();
    q.set("scope", params?.scope || "progress");
    if (params?.keyword) q.set("keyword", params.keyword);
    if (params?.direction) q.set("direction", params.direction);
    if (params?.company) q.set("company", params.company);
    if (params?.hide_applied) q.set("hide_applied", "true");
    if (params?.hide_soe) q.set("hide_soe", "true");
    if (params?.show_hidden) q.set("show_hidden", "true");
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    return request<JobLibraryList>(`/api/job-library?${q.toString()}`);
  },
  bulkSetJobLibraryHidden: (sourceKeys: string[], hidden: boolean) =>
    request<{ requested: number; updated: number }>("/api/job-library/bulk-hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_keys: sourceKeys, hidden }),
    }),
  trackJobLibraryItem: (scope: "all" | "progress", id: string, markApplied = false) =>
    request<Job>(`/api/job-library/${scope}/${encodeURIComponent(id)}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_applied: markApplied }),
    }),
  importApplicationProgress: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ApplicationImportResult>("/api/applications/import", {
      method: "POST",
      body: form,
    }, 120000);
  },
  downloadApplicationImportTemplate: async () => {
    const headers = new Headers();
    const token = getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}/api/applications/import-template`, { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `模板下载失败: ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "求职进度导入模板.xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  updateApplicationJob: (id: number, data: JobPipelineUpdate) =>
    request<Job>(`/api/applications/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  createApplicationJob: (data: ManualJobCreate) =>
    request<Job>(`/api/applications/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  duplicateApplicationJob: (id: number) =>
    request<Job>(`/api/applications/jobs/${id}/duplicate`, { method: "POST" }),
  getApplicationEvents: (id: number) =>
    request<ApplicationEvent[]>(`/api/applications/jobs/${id}/events`),
  getApplicationProfile: () => request<ApplicationProfile>("/api/applications/profile"),
  getApplicationAnswerTemplates: () =>
    request<ApplicationAnswerTemplate[]>("/api/applications/profile/answer-templates"),
  saveApplicationProfile: (data: ApplicationProfile) =>
    request<ApplicationProfile>("/api/applications/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  createApplicationQueue: (data: {
    job_ids?: number[];
    name?: string;
    auto_submit?: boolean;
    max_count?: number;
    max_priority?: number;
    min_match_score?: number;
  }) =>
    request<ApplicationQueue>("/api/applications/queues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getApplicationQueues: () => request<ApplicationQueue[]>("/api/applications/queues"),
  getCurrentApplicationQueue: () =>
    request<ApplicationQueue | null>("/api/applications/queues/current"),
  getApplicationQueue: (queueId: number) =>
    request<ApplicationQueue>(`/api/applications/queues/${queueId}`),
  controlApplicationQueue: (queueId: number, action: "pause" | "resume" | "cancel") =>
    request<ApplicationQueue>(`/api/applications/queues/${queueId}/${action}`, { method: "POST" }),
  tailorResumeForJob: (id: number) =>
    request<JobTailoredResumeResult>(`/api/jobs/${id}/tailor-resume`, { method: "POST" }, 120000),
  rematchJob: (id: number) =>
    request<Job>(`/api/jobs/${id}/match`, { method: "POST" }, 90000),
  deleteJob: (id: number) =>
    request<{ ok: boolean }>(`/api/jobs/${id}`, { method: "DELETE" }),
  getJobRecommendations: (id: number) =>
    request<JobRecommendations>(`/api/jobs/${id}/recommendations`, { method: "POST" }),
  getGreetings: (jobId?: number) => {
    const qs = jobId ? `?job_id=${jobId}` : "";
    return request<Greeting[]>(`/api/greetings${qs}`);
  },
  generateGreeting: (
    jobId: number,
    options?: {
      style?: string;
      template_id?: string;
      modify_instruction?: string;
      base_greeting_id?: number;
    },
  ) =>
    request<Greeting>(
      "/api/greetings/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          style: options?.style,
          template_id: options?.template_id ?? "default",
          modify_instruction: options?.modify_instruction,
          base_greeting_id: options?.base_greeting_id,
        }),
      },
      90000,
    ),
  deleteGreeting: (id: number) =>
    request<void>(`/api/greetings/${id}`, { method: "DELETE" }),
  updateGreeting: (id: number, content: string, isSent?: boolean) =>
    request<Greeting>(`/api/greetings/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, is_sent: isSent }),
    }),
  getResume: () => request<Resume | null>("/api/resume"),
  listResumes: () => request<Resume[]>("/api/resume/list"),
  getResumeById: (id: number) => request<Resume>(`/api/resume/${id}`),
  listResumeTemplates: () => request<ResumeTemplate[]>("/api/resume/templates"),
  createResumeFromTemplate: (data: { template_id: string; name?: string }) =>
    request<Resume>("/api/resume/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateResumeContent: (id: number, content: ResumeContent) =>
    request<Resume>(`/api/resume/${id}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    }),
  optimizeResume: (id: number) =>
    request<Resume>(`/api/resume/${id}/optimize`, { method: "POST" }, 90000),
  uploadResume: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Resume>("/api/resume/upload", { method: "POST", body: form });
  },
  setDefaultResume: (id: number) =>
    request<Resume>(`/api/resume/${id}/default`, { method: "PUT" }),
  deleteResume: (id: number) =>
    request<{ ok: boolean }>(`/api/resume/${id}`, { method: "DELETE" }),
  getSettings: () => request<Settings>("/api/settings"),
  updateSettings: (data: Settings) =>
    request<Settings>("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  suggestPositionKeywords: (payload: {
    titles: string[];
    summary?: string;
    details?: string;
  }) =>
    request<{ title_aliases: string[]; keywords: string[] }>(
      "/api/settings/suggest-position-keywords",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
  getApiProfiles: () => request<ApiProfiles>("/api/api-profiles"),
  updateApiProfiles: (data: ApiProfiles) =>
    request<ApiProfiles>("/api/api-profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getAuthProviders: () => request<AuthProviders>("/api/auth/providers"),
  getAuthSession: () => request<AuthSession>("/api/auth/me"),
  sendEmailCode: (email: string, purpose: "register" | "reset" = "register") =>
    request<{ ok: boolean; message: string }>("/api/auth/email/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, purpose }),
    }),
  emailRegister: (email: string, code: string, password: string) =>
    request<{ token: string }>("/api/auth/email/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    }),
  emailResetPassword: (email: string, code: string, password: string) =>
    request<{ token: string }>("/api/auth/email/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    }),
  emailLogin: (email: string, password: string) =>
    request<{ token: string }>("/api/auth/email/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  getWechatAuthUrl: () => request<{ url: string }>("/api/auth/wechat/url"),
  getAlipayAuthUrl: () => request<{ url: string }>("/api/auth/alipay/url"),
  devLogin: () => request<{ token: string }>("/api/auth/dev-login", { method: "POST" }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  getMembershipPlans: () => request<MembershipPlan[]>("/api/membership/plans"),
  getMembershipStatus: () => request<MembershipStatus>("/api/membership/status"),
  createMembershipOrder: (plan: string, pay_channel: "wechat" | "alipay") =>
    request<PaymentOrder>("/api/membership/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, pay_channel }),
    }),
  getCurrentMembershipOrder: () => request<PaymentOrder | null>("/api/membership/orders/current"),
  cancelMembershipOrder: (orderId: number) =>
    request<{ ok: boolean; message: string }>(`/api/membership/orders/${orderId}/cancel`, {
      method: "POST",
    }),
  mockPayOrder: (orderId: number) =>
    request<MembershipStatus>(`/api/membership/orders/${orderId}/mock-pay`, { method: "POST" }),
  userMarkOrderPaid: (orderId: number, payerRemark: string) =>
    request<{ ok: boolean; message: string; out_trade_no: string }>(
      `/api/membership/orders/${orderId}/user-paid`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payer_remark: payerRemark }),
      },
    ),
  getAdminQrStatus: (adminSecret: string) =>
    adminRequest<{ personal_qr_enabled: boolean; wechat: string | null; alipay: string | null }>(
      "/api/membership/admin/qr-status",
      { headers: { "X-License-Admin-Secret": adminSecret } },
    ),
  uploadPaymentQr: async (adminSecret: string, channel: "wechat" | "alipay", file: File) => {
    const form = new FormData();
    form.append("file", file);
    return adminRequest<{ ok: boolean; channel: string; qr_url: string }>(
      `/api/membership/admin/upload-qr?channel=${channel}`,
      {
        method: "POST",
        headers: { "X-License-Admin-Secret": adminSecret },
        body: form,
      },
      60000,
    );
  },
  getAdminOrders: (adminSecret: string, status = "") => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return adminRequest<AdminOrder[]>(`/api/membership/admin/orders${qs}`, {
      headers: { "X-License-Admin-Secret": adminSecret },
    });
  },
  getAdminUsers: (adminSecret: string) =>
    adminRequest<AdminUser[]>("/api/membership/admin/users", {
      headers: { "X-License-Admin-Secret": adminSecret },
    }),
  adminConfirmOrder: (adminSecret: string, orderId: number) =>
    adminRequest<{ ok: boolean; out_trade_no: string; nickname: string }>(
      `/api/membership/admin/confirm-order/${orderId}`,
      {
        method: "POST",
        headers: { "X-License-Admin-Secret": adminSecret },
      },
    ),
  adminRejectOrder: (adminSecret: string, orderId: number, note: string) =>
    adminRequest<{ ok: boolean; out_trade_no: string; message: string }>(
      `/api/membership/admin/reject-order/${orderId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-License-Admin-Secret": adminSecret },
        body: JSON.stringify({ note }),
      },
    ),
  adminGrantMembership: (
    adminSecret: string,
    payload: { user_id?: number; nickname?: string; plan: string; days?: number },
  ) =>
    adminRequest<MembershipStatus>("/api/membership/admin/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-License-Admin-Secret": adminSecret },
      body: JSON.stringify(payload),
    }),
  getCareerSites: () => request<CareerSiteConfig>("/api/career-sites"),
  getCareerPresets: (category?: string) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    return request<CareerSitePreset[]>(`/api/career-sites/presets${qs}`);
  },
  getCareerPresetCategories: () => request<string[]>("/api/career-sites/presets/categories"),
  importCareerPresets: (payload: {
    preset_ids?: string[];
    import_all?: boolean;
    enable_auto_scrape?: boolean;
    sync_mode?: "add" | "replace";
  }) =>
    request<{ added: number; skipped: number; removed: number; message: string }>("/api/career-sites/import-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  pruneCareerSourcesToCurated: () =>
    request<{ added: number; skipped: number; removed: number; message: string }>(
      "/api/career-sites/prune-to-curated",
      { method: "POST" }
    ),
  updateCareerSites: (data: CareerSiteConfig) =>
    request<CareerSiteConfig>("/api/career-sites", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  scrapeCareerSites: (payload?: { source_id?: string; max_jobs?: number }) =>
    request<{ results: CareerScrapeItemResult[] }>(
      "/api/career-sites/scrape",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      },
      120000,
    ),
  startBackgroundCareerScrape: (payload?: { source_id?: string; max_jobs?: number }) =>
    request<CareerBackgroundScrapeStatus>("/api/career-sites/scrape/background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    }),
  getBackgroundCareerScrapeStatus: () =>
    request<CareerBackgroundScrapeStatus>("/api/career-sites/scrape/background"),
};
