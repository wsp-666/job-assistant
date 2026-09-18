const STORAGE_KEY = "linkedBossTabId";

export const BOSS_TAB_URL_PATTERNS = [
  "*://www.zhipin.com/*",
  "*://*.zhipin.com/*",
  "*://zhipin.com/*",
] as const;

export function isBossUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "zhipin.com" || host.endsWith(".zhipin.com");
  } catch {
    return url.includes("zhipin.com");
  }
}

export async function loadLinkedBossTabId(): Promise<number | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const id = stored[STORAGE_KEY];
  return typeof id === "number" ? id : null;
}

export async function saveLinkedBossTabId(tabId: number): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: tabId });
}

export async function clearLinkedBossTabId(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
