import { ensureAuthToken, formatApiError } from "./authToken";

export const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) || "http://127.0.0.1:8000";

/** 安装版管理台（FastAPI 托管静态页）；开发时 Vite 为 5173 */
export const ADMIN_BASE = API_BASE;

export interface JobData {
  platform: string;
  job_title: string;
  company: string;
  salary: string;
  city: string;
  jd_text: string;
  job_url: string;
  hr_name: string;
  hr_title: string;
  company_size?: string;
  company_industry?: string;
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

export interface JobRecord {
  id: number;
  match_score: number;
  role_match_score?: number;
  benefits_match_score?: number;
  company_match_score?: number;
  status: string;
}

export type ApplicationProfile = {
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
  effective_custom_fields?: Record<string, string>;
  answer_sets?: Array<{
    id: string;
    name: string;
    job_category: string;
    resume_id: number | null;
    description: string;
    answers: Record<string, string>;
  }>;
  active_answer_set_id?: string;
  resume_name?: string;
  has_uploadable_resume?: boolean;
  resume_file_url?: string | null;
};

export type QueueJob = {
  id: number;
  platform: string;
  job_title: string;
  company: string;
  job_url: string;
  priority: number;
  status: string;
};

export type ApplicationTask = {
  id: number;
  queue_id: number;
  job_id: number;
  sequence: number;
  priority: number;
  status: string;
  page_url: string;
  last_error: string;
  result_message: string;
  job: QueueJob | null;
};

export type ApplicationQueue = {
  id: number;
  name: string;
  status: string;
  auto_submit: boolean;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  tasks: ApplicationTask[];
};

export type ApplicationNextTask = {
  queue: ApplicationQueue;
  task: ApplicationTask | null;
  profile: ApplicationProfile | null;
};

export async function apiRequest<T>(path: string, options?: RequestInit, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const token = await ensureAuthToken();
  const headers = new Headers(options?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(formatApiError(text) || `请求失败: ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("请求超时，请确认本地 API 已启动（http://127.0.0.1:8000）");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const data = await apiRequest<{ status: string }>("/health");
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function getApplicationProfile() {
  return apiRequest<ApplicationProfile>("/api/applications/profile");
}

export async function saveApplicationProfile(profile: ApplicationProfile) {
  return apiRequest<ApplicationProfile>("/api/applications/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export async function saveJob(job: JobData) {
  return apiRequest<JobRecord>(
    "/api/jobs",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    },
    90000,
  );
}

export async function generateGreeting(jobData: JobData, style?: string, modifyInstruction?: string) {
  return apiRequest<Greeting>(
    "/api/greetings/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_data: jobData,
        style,
        modify_instruction: modifyInstruction || undefined,
      }),
    },
    90000,
  );
}

export async function generateGreetingByJobId(
  jobId: number,
  style?: string,
  modifyInstruction?: string,
  jobData?: JobData,
) {
  return apiRequest<Greeting>(
    "/api/greetings/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        job_data: jobData,
        style,
        modify_instruction: modifyInstruction || undefined,
      }),
    },
    90000,
  );
}

export async function deleteGreeting(greetingId: number) {
  return apiRequest<void>(`/api/greetings/${greetingId}`, { method: "DELETE" });
}

export async function markGreetingSent(greetingId: number, content: string) {
  return apiRequest<Greeting>(`/api/greetings/${greetingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, is_sent: true }),
  });
}

export async function getSettings() {
  return apiRequest<{ daily_limit: number; greeting_style: string }>("/api/settings");
}

export async function updateJobStatus(jobId: number, status: string) {
  return apiRequest<{ id: number; status: string }>(`/api/jobs/${jobId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function getCurrentApplicationQueue() {
  return apiRequest<ApplicationQueue | null>("/api/applications/queues/current");
}

export async function getApplicationQueue(queueId: number) {
  return apiRequest<ApplicationQueue>(`/api/applications/queues/${queueId}`);
}

export async function claimNextApplicationTask(queueId: number) {
  return apiRequest<ApplicationNextTask>(`/api/applications/queues/${queueId}/next`, {
    method: "POST",
  });
}

export async function updateApplicationTask(
  taskId: number,
  status: string,
  message = "",
  pageUrl = "",
) {
  return apiRequest<ApplicationQueue>(`/api/applications/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, message, page_url: pageUrl }),
  });
}

export async function controlApplicationQueue(queueId: number, action: "pause" | "resume" | "cancel") {
  return apiRequest<ApplicationQueue>(`/api/applications/queues/${queueId}/${action}`, {
    method: "POST",
  });
}
