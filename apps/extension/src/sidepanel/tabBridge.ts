import type { JobData } from "../shared/api";

export type PageInfo = {
  pageType: string;
  jobCount: number;
  activeIndex: number;
  url: string;
};

type BossResponse<T> = { ok: boolean; data?: T; error?: string; tabId?: number };

async function bossRequest<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  let res: BossResponse<T> | undefined;
  let lastError = "插件后台未响应，请在 edge://extensions 重新加载插件";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await chrome.runtime.sendMessage({
        type: "BOSS_REQUEST",
        action,
        payload,
      });
      if (res) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!res) {
    throw new Error(lastError);
  }
  if (!res.ok) {
    throw new Error(res.error || "无法连接 BOSS 页面脚本");
  }
  return res.data as T;
}

/** 启动全自动前预热连接，成功返回 null，失败返回可读错误 */
export async function ensureBossConnection(): Promise<string | null> {
  let lastError = "无法连接 BOSS 页面";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await chrome.runtime.sendMessage({ type: "ENSURE_BOSS_CONNECTION" });
      if (res?.ok) return null;
      lastError = (res?.error as string) || lastError;
      if (lastError.includes("未找到")) return lastError;
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return lastError;
}

type ScrapeResponse = { job?: JobData | null; error?: string };

export async function refreshCurrentJob(): Promise<{ job: JobData | null; error?: string }> {
  try {
    const response = await bossRequest<ScrapeResponse>("SCRAPE_JOB");
    if (response?.error) return { job: null, error: response.error };
    if (!response?.job) {
      return { job: null, error: "未能读取岗位信息，请在 BOSS 职位列表页（左侧有岗位卡片）点击刷新" };
    }
    return { job: response.job };
  } catch (e) {
    return { job: null, error: e instanceof Error ? e.message : "抓取失败" };
  }
}

export async function scrapeFromActiveTab(): Promise<JobData | null> {
  const result = await refreshCurrentJob();
  return result.job;
}

export async function getPageInfoFromTab(): Promise<PageInfo> {
  const response = await bossRequest<{ info?: PageInfo }>("GET_PAGE_INFO");
  if (!response?.info) {
    throw new Error("无法读取 BOSS 页面信息，请在 BOSS 标签页按 F5 刷新后重试");
  }
  return response.info;
}

export async function clickNextJobOnTab(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await bossRequest<{ success?: boolean; message?: string }>("CLICK_NEXT_JOB");
    const ok = Boolean(response?.success);
    return {
      ok,
      message: response?.message || (ok ? "已切换岗位" : "切换失败"),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "切换失败" };
  }
}

export async function openChatOnTab(): Promise<string> {
  try {
    const response = await bossRequest<{ success?: boolean; message?: string }>("OPEN_CHAT");
    return response?.message || "打开沟通失败";
  } catch (e) {
    return e instanceof Error ? e.message : "打开沟通失败";
  }
}

export async function waitForJobDetailOnTab(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await bossRequest<{ success?: boolean; message?: string }>("WAIT_JOB_DETAIL");
    const ok = Boolean(response?.success);
    return { ok, message: response?.message || (ok ? "岗位详情已加载" : "岗位详情未加载") };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "等待岗位详情失败" };
  }
}

export async function resetJobIndexOnTab(): Promise<void> {
  try {
    await bossRequest("RESET_JOB_INDEX");
  } catch {
    // ignore
  }
}

export async function fillToPage(
  content: string,
  autoSend = false,
  afterDefaultFirst = true,
): Promise<string> {
  try {
    const response = await bossRequest<{ success?: boolean; message?: string }>("FILL_GREETING", {
      content,
      autoSend,
      afterDefaultFirst,
    });
    if (response?.success) return response.message || "填入成功";
    return response?.message || "填入失败";
  } catch (e) {
    return e instanceof Error ? e.message : "填入失败";
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let applicationTabId: number | null = null;

function waitForTabComplete(tabId: number, timeoutMs = 30000): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, tab?: chrome.tabs.Tab) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (error) reject(error);
      else if (tab) resolve(tab);
      else reject(new Error("招聘页面加载失败"));
    };
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (id === tabId && info.status === "complete") finish(undefined, tab);
    };
    const timer = window.setTimeout(() => finish(new Error("招聘页面加载超时，请检查网络或手动刷新")), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish(undefined, tab);
    }).catch(() => undefined);
  });
}

export async function openApplicationPage(url: string): Promise<chrome.tabs.Tab> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("岗位链接无效");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("仅支持 http/https 招聘链接");
  }

  let tab: chrome.tabs.Tab;
  if (applicationTabId != null) {
    try {
      tab = await chrome.tabs.update(applicationTabId, { url, active: true });
    } catch {
      applicationTabId = null;
      tab = await chrome.tabs.create({ url, active: true });
    }
  } else {
    tab = await chrome.tabs.create({ url, active: true });
  }
  if (tab.id == null) throw new Error("无法创建招聘页面标签页");
  applicationTabId = tab.id;
  return waitForTabComplete(tab.id);
}

export async function resumeApplicationPage(fallbackUrl: string): Promise<chrome.tabs.Tab> {
  if (applicationTabId != null) {
    try {
      const tab = await chrome.tabs.get(applicationTabId);
      if (tab.id != null) {
        await chrome.tabs.update(tab.id, { active: true });
        return tab.status === "complete" ? tab : waitForTabComplete(tab.id);
      }
    } catch {
      applicationTabId = null;
    }
  }
  return openApplicationPage(fallbackUrl);
}

export async function sendApplicationPageMessage<T>(
  tabId: number,
  message: Record<string, unknown>,
  timeoutMs = 20000,
  frameId = 0,
): Promise<T> {
  const started = Date.now();
  let lastError = "招聘页面自动填写脚本尚未就绪";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message, { frameId });
      if (response) return response as T;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
    await sleep(500);
  }
  throw new Error(lastError);
}

async function applicationFrameIds(tabId: number): Promise<number[]> {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    return [...new Set((frames || []).map((frame) => frame.frameId))];
  } catch {
    return [0];
  }
}

async function sendToApplicationFrames<T>(tabId: number, message: Record<string, unknown>): Promise<T[]> {
  const ensured = await chrome.runtime.sendMessage({ type: "ENSURE_APPLICATION_FORM", tabId });
  if (!ensured?.ok) {
    throw new Error(ensured?.error || "无法加载招聘页面自动填写脚本");
  }
  await sleep(120);
  const frameIds = await applicationFrameIds(tabId);
  const responses = await Promise.all(frameIds.map((frameId) =>
    sendApplicationPageMessage<T>(tabId, message, 3000, frameId).catch(() => null),
  ));
  return responses.filter((response) => response !== null) as T[];
}

export type ApplicationAnalysis = {
  loginRequired: boolean;
  url: string;
  title: string;
  inputCount: number;
  fields: Array<{ type: string; description: string; matchedLabel: string; hasValue: boolean }>;
};

export type ApplicationFill = {
  loginRequired: boolean;
  filled: number;
  uploaded: boolean;
  filledFields: string[];
  requiredEmpty: string[];
  actionFound: boolean;
  actionText: string;
  advanced: boolean;
  submitted: boolean;
  message: string;
};

export async function analyzeApplicationPage(
  tabId: number,
  profile?: import("../shared/api").ApplicationProfile,
): Promise<ApplicationAnalysis> {
  const results = await sendToApplicationFrames<ApplicationAnalysis>(tabId, { type: "APPLICATION_ANALYZE", profile });
  if (!results.length) throw new Error("招聘页面自动填写脚本尚未就绪，请刷新页面");
  const main = results[0];
  return {
    loginRequired: results.every((result) => result.loginRequired),
    url: main.url,
    title: main.title,
    inputCount: results.reduce((sum, result) => sum + result.inputCount, 0),
    fields: results.flatMap((result) => result.fields || []).slice(0, 60),
  };
}

export async function fillApplicationPage(
  tabId: number,
  profile: import("../shared/api").ApplicationProfile,
  autoSubmit = false,
  overwrite = true,
): Promise<ApplicationFill> {
  const results = await sendToApplicationFrames<ApplicationFill>(tabId, {
    type: "APPLICATION_FILL",
    profile,
    autoSubmit,
    overwrite,
  });
  if (!results.length) throw new Error("招聘页面自动填写脚本尚未就绪，请刷新页面");
  const filled = results.reduce((sum, result) => sum + result.filled, 0);
  const filledFields = [...new Set(results.flatMap((result) => result.filledFields || []))];
  const requiredEmpty = [...new Set(results.flatMap((result) => result.requiredEmpty || []))];
  const actions = [...new Set(results.map((result) => result.actionText).filter(Boolean))];
  const advanced = results.some((result) => result.advanced);
  const submitted = results.some((result) => result.submitted);
  return {
    loginRequired: results.every((result) => result.loginRequired),
    filled,
    uploaded: results.some((result) => result.uploaded),
    filledFields,
    requiredEmpty,
    actionFound: results.some((result) => result.actionFound),
    actionText: actions.join(" / "),
    advanced,
    submitted,
    message: [
      `已填写 ${filled} 个字段`,
      requiredEmpty.length ? `仍有 ${requiredEmpty.length} 个必填项需确认` : "",
      advanced ? "已进入下一步" : "",
      submitted ? "已点击提交" : "",
      actions.length ? "" : "未找到下一步或提交按钮",
    ].filter(Boolean).join("，"),
  };
}

async function activeApplicationTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
    throw new Error("请先打开需要填写的招聘官网页面");
  }
  return tab;
}

export async function analyzeCurrentApplicationPage(
  profile?: import("../shared/api").ApplicationProfile,
) {
  const tab = await activeApplicationTab();
  return analyzeApplicationPage(tab.id!, profile);
}

export async function fillCurrentApplicationPage(
  profile: import("../shared/api").ApplicationProfile,
) {
  const tab = await activeApplicationTab();
  return fillApplicationPage(tab.id!, profile, false, true);
}
