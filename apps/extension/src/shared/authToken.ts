export const WEB_TOKEN_KEY = "job_assistant_token";

const STORAGE_KEY = "auth_token";

export async function getExtensionAuthToken(): Promise<string> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return typeof data[STORAGE_KEY] === "string" ? data[STORAGE_KEY] : "";
  } catch {
    return "";
  }
}

export async function setExtensionAuthToken(token: string): Promise<void> {
  const value = token.trim();
  if (value) await chrome.storage.local.set({ [STORAGE_KEY]: value });
  else await chrome.storage.local.remove(STORAGE_KEY);
}

export function requestPullAuthFromWebTabs(): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "PULL_AUTH_FROM_WEB" }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve("");
        return;
      }
      resolve(typeof resp?.token === "string" ? resp.token : "");
    });
  });
}

/** 优先用已缓存 token；没有则从本机 Web 标签页读取 localStorage。 */
export async function ensureAuthToken(): Promise<string> {
  const cached = await getExtensionAuthToken();
  if (cached) return cached;
  return requestPullAuthFromWebTabs();
}

export function formatApiError(text: string): string {
  try {
    const data = JSON.parse(text) as { detail?: string };
    if (data.detail === "请先登录") {
      return "未登录：请打开 http://127.0.0.1:8000 登录，登录后回到 BOSS 页面重试";
    }
    if (data.detail) return data.detail;
  } catch {
    /* ignore */
  }
  return text || "请求失败";
}
