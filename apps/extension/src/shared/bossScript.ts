/** 确保 BOSS 页 content script 可用 */

const injectedTabs = new Set<number>();

export function clearBossScriptCache(tabId?: number) {
  if (tabId != null) injectedTabs.delete(tabId);
  else injectedTabs.clear();
}

function getBossLoaderFile(): string {
  const manifest = chrome.runtime.getManifest();
  const file = manifest.content_scripts
    ?.flatMap((cs) => cs.js ?? [])
    .find((f) => f.includes("boss.ts-loader") || f.includes("boss.ts"));
  if (!file) {
    throw new Error("无法定位 BOSS 脚本，请在 edge://extensions 重新加载插件");
  }
  return file;
}

function pingBossTab(tabId: number, timeoutMs = 4000): Promise<"ok" | "missing" | "busy"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("busy"), timeoutMs);
    chrome.tabs.sendMessage(tabId, { type: "PING" }, () => {
      clearTimeout(timer);
      const err = chrome.runtime.lastError?.message ?? "";
      if (!err) {
        resolve("ok");
        return;
      }
      if (
        err.includes("Receiving end does not exist") ||
        err.includes("Could not establish connection") ||
        err.includes("message port closed")
      ) {
        resolve("missing");
        return;
      }
      resolve("busy");
    });
  });
}

async function injectBossTab(tabId: number): Promise<void> {
  const loader = getBossLoaderFile();
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [loader] });
    injectedTabs.add(tabId);
    await new Promise((r) => setTimeout(r, 1000));
  } catch (e) {
    injectedTabs.delete(tabId);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Cannot access contents") || msg.includes("extensions gallery")) {
      throw new Error("无法在此页面注入脚本，请确认打开的是 BOSS 直聘官网页面");
    }
    if (msg.includes("Could not load file")) {
      throw new Error(
        "插件脚本文件已过期：请在 edge://extensions 重新加载插件，然后刷新 BOSS 页面（F5）",
      );
    }
    throw new Error(`脚本注入失败：${msg}`);
  }
}

export async function ensureBossScript(tabId: number): Promise<void> {
  if ((await pingBossTab(tabId, 2500)) === "ok") return;

  for (let attempt = 0; attempt < 2; attempt++) {
    injectedTabs.delete(tabId);
    try {
      await injectBossTab(tabId);
    } catch (e) {
      if (attempt === 1) throw e;
    }

    for (let i = 0; i < 6; i++) {
      if ((await pingBossTab(tabId, 3500)) === "ok") return;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  throw new Error(
    "BOSS 页面脚本未就绪。请确认已打开 zhipin.com 岗位页，并按 F5 刷新该页面后重试",
  );
}

export async function sendBossTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  await ensureBossScript(tabId);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("连接 BOSS 页面超时，请刷新 BOSS 标签页（F5）后重试"));
    }, 12000);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      const err = chrome.runtime.lastError?.message ?? "";
      if (err) {
        if (
          err.includes("Receiving end does not exist") ||
          err.includes("Could not establish connection")
        ) {
          clearBossScriptCache(tabId);
          reject(new Error("BOSS 页面脚本已失效，请刷新 BOSS 标签页（F5）后重试"));
          return;
        }
        reject(new Error(err));
        return;
      }
      resolve(response as T);
    });
  });
}
