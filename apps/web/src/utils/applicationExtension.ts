export function wakeApplicationExtension(
  type: "START_APPLICATION_QUEUE" | "RESUME_APPLICATION_QUEUE",
  queueId: number,
) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", listener);
      resolve(value);
    };
    const listener = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; ok?: boolean } | null;
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (data?.source === "job-assistant-extension" && data.type === "APPLICATION_QUEUE_ACK") {
        finish(Boolean(data.ok));
      }
    };
    const timer = window.setTimeout(() => finish(false), 1800);
    window.addEventListener("message", listener);
    window.postMessage({ source: "job-assistant-web", type, queueId }, window.location.origin);
  });
}
