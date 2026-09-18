import {
  clearBossScriptCache,
  ensureBossScript,
  sendBossTabMessage,
} from "../shared/bossScript";
import { setExtensionAuthToken, WEB_TOKEN_KEY } from "../shared/authToken";
import {
  BOSS_TAB_URL_PATTERNS,
  clearLinkedBossTabId,
  isBossUrl,
  loadLinkedBossTabId,
  saveLinkedBossTabId,
} from "../shared/linkedBossTab";

const SIDE_PANEL_PATH = "src/sidepanel/index.html";

function setupSidePanel() {
  // 用 onClicked 手动 open，确保先 enable 再打开（Edge 上比 openPanelOnActionClick 更稳）
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  chrome.sidePanel
    .setOptions({ path: SIDE_PANEL_PATH, enabled: true })
    .catch(() => {});
}

async function enableSidePanelForTab(tabId: number) {
  await chrome.sidePanel.setOptions({
    tabId,
    path: SIDE_PANEL_PATH,
    enabled: true,
  });
}

async function openSidePanelForTab(tabId: number) {
  await enableSidePanelForTab(tabId);
  await chrome.sidePanel.open({ tabId });
}

chrome.runtime.onInstalled.addListener(() => {
  setupSidePanel();
});

setupSidePanel();

let linkedBossTabId: number | null = null;

void loadLinkedBossTabId().then((id) => {
  if (id != null) linkedBossTabId = id;
});

function rememberBossTab(tabId: number, url?: string) {
  if (!isBossUrl(url)) return;
  linkedBossTabId = tabId;
  void saveLinkedBossTabId(tabId);
}

async function findBossTabs(): Promise<chrome.tabs.Tab[]> {
  const seen = new Set<number>();
  const found: chrome.tabs.Tab[] = [];

  for (const pattern of BOSS_TAB_URL_PATTERNS) {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      if (tab.id != null && !seen.has(tab.id)) {
        seen.add(tab.id);
        found.push(tab);
      }
    }
  }

  if (found.length > 0) return found;

  const all = await chrome.tabs.query({});
  return all.filter((tab) => isBossUrl(tab.url));
}

async function resolveBossTabId(preferredTabId?: number): Promise<number | null> {
  if (preferredTabId) {
    try {
      const tab = await chrome.tabs.get(preferredTabId);
      if (tab.id && isBossUrl(tab.url)) {
        rememberBossTab(tab.id, tab.url);
        return tab.id;
      }
    } catch {
      // fall through
    }
  }

  if (linkedBossTabId) {
    try {
      const tab = await chrome.tabs.get(linkedBossTabId);
      if (tab.id && isBossUrl(tab.url)) return tab.id;
    } catch {
      linkedBossTabId = null;
      void clearLinkedBossTabId();
    }
  }

  const storedId = await loadLinkedBossTabId();
  if (storedId != null) {
    try {
      const tab = await chrome.tabs.get(storedId);
      if (tab.id && isBossUrl(tab.url)) {
        linkedBossTabId = tab.id;
        return tab.id;
      }
    } catch {
      void clearLinkedBossTabId();
    }
  }

  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id && isBossUrl(active.url)) {
    rememberBossTab(active.id, active.url);
    return active.id;
  }

  const bossTabs = await findBossTabs();
  if (bossTabs.length > 0) {
    const tab = bossTabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
    if (tab.id) {
      rememberBossTab(tab.id, tab.url);
      return tab.id;
    }
  }

  return null;
}

async function ensureBossConnection(preferredTabId?: number) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const tabId = await resolveBossTabId(preferredTabId);
    if (!tabId) {
      return {
        ok: false,
        error:
          "未找到 BOSS 直聘标签页。请打开 www.zhipin.com 职位列表页，选中该标签后再点「全自动投递」",
      };
    }

    try {
      await ensureBossScript(tabId);
      await sendBossTabMessage(tabId, { type: "PING" });
      return { ok: true, tabId };
    } catch (e) {
      clearBossScriptCache(tabId);
      if (attempt === 1) {
        return {
          ok: false,
          error:
            e instanceof Error
              ? e.message
              : "BOSS 页面脚本未就绪，请在 BOSS 标签页按 F5 刷新后重试",
        };
      }
    }
  }

  return { ok: false, error: "连接 BOSS 页面失败" };
}

const LOCAL_WEB_TAB_PATTERNS = ["http://127.0.0.1:8000/*", "http://localhost:8000/*"];

async function pullAuthFromWebTabs(): Promise<string> {
  for (const pattern of LOCAL_WEB_TAB_PATTERNS) {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (key: string) => localStorage.getItem(key) || "",
          args: [WEB_TOKEN_KEY],
        });
        const token = results?.[0]?.result;
        if (typeof token === "string" && token.trim()) {
          await setExtensionAuthToken(token.trim());
          return token.trim();
        }
      } catch {
        // 标签页可能尚未就绪
      }
    }
  }
  return "";
}

function applicationContentScriptFiles(): string[] {
  const scripts = chrome.runtime.getManifest().content_scripts || [];
  const entry = scripts.find((item) =>
    (item.js || []).some((file) => file.includes("application-form")),
  );
  return entry?.js || [];
}

async function ensureApplicationFormScript(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^https?:\/\//i.test(tab.url)) {
    throw new Error("当前页面不是可填写的招聘网页");
  }
  const files = applicationContentScriptFiles();
  if (!files.length) throw new Error("未找到招聘表单填写脚本");
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files,
  });
  return { ok: true, tabId };
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => rememberBossTab(tabId, tab.url)).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const url = info.url || tab.url;
  if (info.status === "loading" && isBossUrl(url)) {
    clearBossScriptCache(tabId);
  }
  if (isBossUrl(url)) {
    rememberBossTab(tabId, url);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === "complete" && isBossUrl(tab.url)) {
    ensureBossScript(tabId).catch(() => {});
    enableSidePanelForTab(tabId).catch(() => {});
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  openSidePanelForTab(tab.id).catch(() => {});
});

async function handleBossRequest(
  action: string,
  payload?: Record<string, unknown>,
  preferredTabId?: number,
) {
  const tabId = await resolveBossTabId(preferredTabId);
  if (!tabId) {
    return {
      ok: false,
      error:
        "未找到 BOSS 直聘标签页。请打开 www.zhipin.com 职位列表页，选中该标签后再操作",
    };
  }

  try {
    const message = { type: action, ...payload };
    const data = await sendBossTabMessage(tabId, message);
    return { ok: true, data, tabId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "连接 BOSS 页面失败" };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ENSURE_APPLICATION_FORM" && message.tabId) {
    ensureApplicationFormScript(Number(message.tabId))
      .then(sendResponse)
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "无法加载招聘表单填写脚本",
      }));
    return true;
  }

  if (message.type === "START_APPLICATION_QUEUE" || message.type === "RESUME_APPLICATION_QUEUE") {
    const queueId = Number(message.queueId);
    if (!Number.isFinite(queueId) || queueId <= 0) {
      sendResponse({ ok: false, error: "投递任务编号无效" });
      return false;
    }
    chrome.storage.local
      .set({ activeApplicationQueueId: queueId })
      .then(async () => {
        if (sender.tab?.id) {
          await openSidePanelForTab(sender.tab.id).catch(() => undefined);
        }
        sendResponse({ ok: true, queueId });
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: "APPLICATION_QUEUE_WAKE", queueId }).catch(() => undefined);
        }, 300);
      })
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "无法启动投递任务" }));
    return true;
  }

  if (message.type === "GET_LINKED_BOSS_TAB") {
    resolveBossTabId().then((tabId) => sendResponse({ tabId }));
    return true;
  }

  if (message.type === "LINK_BOSS_TAB" && message.tabId) {
    chrome.tabs
      .get(message.tabId as number)
      .then((tab) => {
        if (tab.id && isBossUrl(tab.url)) {
          rememberBossTab(tab.id, tab.url);
          sendResponse({ ok: true, tabId: tab.id });
        } else {
          sendResponse({ ok: false, error: "当前标签不是 BOSS 直聘页面" });
        }
      })
      .catch(() => sendResponse({ ok: false, error: "无法读取当前标签" }));
    return true;
  }

  if (message.type === "ENSURE_BOSS_CONNECTION") {
    ensureBossConnection(message.tabId).then(sendResponse);
    return true;
  }

  if (message.type === "BOSS_TAB_READY" && sender.tab?.id) {
    rememberBossTab(sender.tab.id, sender.tab.url);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "PAGE_JOB_DETECTED" && sender.tab?.id) {
    rememberBossTab(sender.tab.id, sender.tab.url);
    return false;
  }

  if (message.type === "BOSS_REQUEST" && message.action) {
    handleBossRequest(message.action, message.payload, message.tabId).then(sendResponse);
    return true;
  }

  if (message.type === "OPEN_SIDE_PANEL" && sender.tab?.id) {
    rememberBossTab(sender.tab.id, sender.tab.url);
    openSidePanelForTab(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch((e) =>
        sendResponse({ ok: false, error: e instanceof Error ? e.message : "无法打开侧边栏" }),
      );
    return true;
  }

  if (message.type === "SYNC_AUTH_TOKEN") {
    const token = typeof message.token === "string" ? message.token.trim() : "";
    setExtensionAuthToken(token)
      .then(() => sendResponse({ ok: true, token }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "PULL_AUTH_FROM_WEB") {
    pullAuthFromWebTabs().then((token) => sendResponse({ ok: true, token }));
    return true;
  }

  return false;
});
