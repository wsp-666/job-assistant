import { WEB_TOKEN_KEY } from "../shared/authToken";

/** 将本机 Web 登录 token 同步到插件 storage，供侧栏/BOSS 脚本调用 API。 */
function readWebToken(): string {
  try {
    return localStorage.getItem(WEB_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function isExtensionContextValid(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

let syncIntervalId: number | undefined;

function stopAuthSync(): void {
  if (syncIntervalId !== undefined) {
    window.clearInterval(syncIntervalId);
    syncIntervalId = undefined;
  }
}

function pushTokenToExtension(): void {
  if (!isExtensionContextValid()) {
    stopAuthSync();
    return;
  }

  const token = readWebToken();
  try {
    chrome.runtime.sendMessage({ type: "SYNC_AUTH_TOKEN", token }).catch(() => {
      stopAuthSync();
    });
  } catch {
    stopAuthSync();
  }
}

function bridgeApplicationQueue(event: MessageEvent): void {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data as { source?: string; type?: string; queueId?: number } | null;
  if (!data || data.source !== "job-assistant-web") return;
  if (!["START_APPLICATION_QUEUE", "RESUME_APPLICATION_QUEUE"].includes(data.type || "")) return;
  chrome.runtime
    .sendMessage({ type: data.type, queueId: Number(data.queueId) })
    .then((response) => {
      window.postMessage(
        { source: "job-assistant-extension", type: "APPLICATION_QUEUE_ACK", ok: Boolean(response?.ok) },
        window.location.origin,
      );
    })
    .catch(() => undefined);
}

pushTokenToExtension();
window.addEventListener("message", bridgeApplicationQueue);
window.addEventListener("job-assistant-auth-changed", pushTokenToExtension);
window.addEventListener("storage", (event) => {
  if (event.key === WEB_TOKEN_KEY) pushTokenToExtension();
});
syncIntervalId = window.setInterval(pushTokenToExtension, 2000);
