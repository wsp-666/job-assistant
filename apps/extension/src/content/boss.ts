import type { JobData } from "../shared/api";
import {
  extractCleanElementText,
  extractJobIdFromPage,
  fetchBossJobDetail,
  isGarbledSalary,
  mergePlainJobFields,
  parseEmbeddedBossJob,
  sanitizeJdText,
} from "./boss-extract";
import {
  clickNextJob,
  clickSendButton,
  clickStartChat,
  findChatInputElement,
  findJobCards,
  findJobDetailRoot,
  getActiveJobCard,
  getPageInfo,
  guessCompanyFromText,
  readChatInputValue,
  resetJobIndex,
  scrapeActiveListJob,
  waitForChatInput,
  waitForChatInputCleared,
  waitForJobDetailReady,
  writeChatInputContent,
  type PageInfo,
} from "./boss-automation";

export type BossMessage =
  | { type: "PING" }
  | { type: "SCRAPE_JOB" }
  | { type: "FILL_GREETING"; content: string; autoSend?: boolean; afterDefaultFirst?: boolean }
  | { type: "WAIT_JOB_DETAIL" }
  | { type: "GET_PAGE_INFO" }
  | { type: "CLICK_NEXT_JOB" }
  | { type: "OPEN_CHAT" }
  | { type: "SEND_GREETING" }
  | { type: "RESET_JOB_INDEX" }
  | { type: "JOB_SCRAPED"; job: JobData | null; error?: string }
  | { type: "FILL_RESULT"; success: boolean; message?: string }
  | { type: "PAGE_INFO"; info: PageInfo }
  | { type: "ACTION_RESULT"; success: boolean; message: string; index?: number; total?: number };

function textOf(el: Element | null | undefined): string {
  return el?.textContent?.trim() || "";
}

function pickIn(root: ParentNode, ...selectors: string[]): string {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    const t = textOf(el);
    if (t) return t;
  }
  return "";
}

export function scrapeDetailPanelJob(): Partial<JobData> & { jd_text?: string } {
  const url = window.location.href;
  const root = findJobDetailRoot() || document.body;

  const job_title = pickIn(
    root,
    ".job-name",
    ".job-title",
    "h1.name",
    "[class*='job-title']",
    "h1",
  );

  let company = pickIn(
    root,
    ".company-name a",
    ".company-name",
    ".company-info a",
    ".company-info .name",
    ".info-company a",
    ".info-company",
    ".sider-company .company-info h3",
    "[class*='company-name']",
  );
  if (!company) {
    company = guessCompanyFromText(textOf(root));
  }

  const salaryRaw = pickIn(root, ".salary", ".job-primary .red", "[class*='salary']");
  const salary = isGarbledSalary(salaryRaw) ? "" : salaryRaw;

  const city = pickIn(
    root,
    ".text-city",
    ".job-primary .text-address",
    ".location-address",
    ".job-location",
    ".job-area",
  );

  let jd_text = "";
  const jdSelectors = [
    ".job-sec-text",
    ".job-detail-section .text",
    ".detail-content",
    ".job-detail-body",
    ".job-detail-section",
  ];
  for (const sel of jdSelectors) {
    const nodes = root.querySelectorAll(sel);
    if (nodes.length) {
      jd_text = Array.from(nodes)
        .map((n) => extractCleanElementText(n))
        .filter(Boolean)
        .join("\n\n");
      if (jd_text.length > 50) break;
    }
  }
  if (!jd_text && root !== document.body) {
    jd_text = sanitizeJdText(textOf(root));
  }

  const hr_name = pickIn(
    root,
    ".boss-info-attr .name",
    ".boss-name",
    ".job-boss-info .name",
    ".boss-info .name",
  );

  const hr_title = pickIn(
    root,
    ".boss-info-attr .title",
    ".boss-title",
    ".job-boss-info .title",
  );

  let company_size = pickIn(
    root,
    ".company-scale",
    ".company-info .scale",
    "[class*='company-scale']",
    ".info-company .scale",
  );
  if (!company_size) {
    const bodyText = textOf(root).slice(0, 6000);
    const sizeMatch = bodyText.match(/(\d+\s*[-~至]\s*\d+\s*人|\d+\s*人\s*以上|\d{3,}\s*人)/);
    company_size = sizeMatch?.[1]?.replace(/\s+/g, "") || "";
  }

  let company_industry = pickIn(
    root,
    ".company-industry",
    ".industry-name",
    ".info-company .industry",
    "[class*='industry-name']",
    ".company-info .industry",
  );
  if (!company_industry) {
    const bodyText = textOf(root).slice(0, 6000);
    const indMatch = bodyText.match(/(?:行业[：:]\s*|所属行业[：:]\s*)([^\n，,；;]{2,20})/);
    company_industry = indMatch?.[1]?.trim() || "";
  }

  const onDetailUrl = url.includes("/job_detail/") || url.includes("/job/");
  const job_url = onDetailUrl ? url.split("?")[0] : "";

  return {
    job_title,
    company,
    salary,
    city,
    jd_text,
    job_url,
    hr_name,
    hr_title,
    company_size,
    company_industry,
  };
}

function mergeJobData(
  listJob: JobData | null,
  detail: ReturnType<typeof scrapeDetailPanelJob>,
  plain?: ReturnType<typeof mergePlainJobFields>,
): JobData | null {
  const job_title = plain?.job_title || detail.job_title || listJob?.job_title || "";
  let company = plain?.company || detail.company || listJob?.company || "";
  const jdCandidates = [plain?.jd_text, detail.jd_text, listJob?.jd_text].filter(Boolean) as string[];
  const bestJd = jdCandidates.sort((a, b) => b.length - a.length)[0] || "";

  if (!company && bestJd) {
    company = guessCompanyFromText(bestJd);
  }
  if (!company && listJob?.jd_text) {
    company = guessCompanyFromText(listJob.jd_text);
  }
  if (!job_title) return null;
  if (!company) company = "未知公司";

  const salaryCandidates = [plain?.salary, detail.salary, listJob?.salary].filter(Boolean) as string[];
  const salary = salaryCandidates.find((s) => !isGarbledSalary(s)) || "";

  const job_url =
    listJob?.job_url ||
    detail.job_url ||
    window.location.href.split("?")[0];

  return {
    platform: "boss",
    job_title,
    company,
    salary,
    city: plain?.city || detail.city || listJob?.city || "",
    jd_text: sanitizeJdText(bestJd).slice(0, 8000),
    job_url,
    hr_name: plain?.hr_name || detail.hr_name || listJob?.hr_name || "",
    hr_title: plain?.hr_title || detail.hr_title || listJob?.hr_title || "",
    company_size: plain?.company_size || detail.company_size || listJob?.company_size || "",
    company_industry:
      plain?.company_industry || detail.company_industry || listJob?.company_industry || "",
  };
}

export async function scrapeCurrentJob(): Promise<JobData | null> {
  const url = window.location.href;
  const hasDetailDom = Boolean(
    document.querySelector(
      ".job-detail, .job-detail-section, .job-sec-text, .job-detail-box, .job-detail-wrapper, [class*='job-detail'], [class*='JobDetail']",
    ),
  );
  const hasList = findJobCards().length > 0;
  const isJobPage =
    url.includes("/job_detail/") ||
    url.includes("/job/") ||
    url.includes("/geek/jobs") ||
    url.includes("ka=job") ||
    hasDetailDom ||
    hasList;

  if (!isJobPage) return null;

  const listJob = scrapeActiveListJob();
  const detail = scrapeDetailPanelJob();
  const embedded = parseEmbeddedBossJob();
  const ids = extractJobIdFromPage(getActiveJobCard());
  const apiJob = ids ? await fetchBossJobDetail(ids.jobId, ids.securityId) : null;
  const plain = mergePlainJobFields(apiJob, embedded);
  return mergeJobData(listJob, detail, plain);
}

export function fillGreetingInput(content: string): { success: boolean; message: string } {
  const el = findChatInputElement();
  if (!el) {
    return {
      success: false,
      message: "未找到沟通输入框，请先点击「立即沟通」打开聊天窗口",
    };
  }

  if (!writeChatInputContent(content)) {
    return { success: false, message: "写入输入框失败" };
  }

  const written = readChatInputValue();
  const snippet = content.slice(0, Math.min(24, content.length));
  if (snippet && !written.includes(snippet)) {
    writeChatInputContent(content);
  }

  const afterRetry = readChatInputValue();
  if (snippet && !afterRetry.includes(snippet)) {
    return {
      success: false,
      message: "话术未能写入输入框（可能被页面默认文案覆盖），请手动粘贴后发送",
    };
  }

  return { success: true, message: "已填入输入框" };
}

async function sendPrefilledGreetingIfAny(): Promise<{
  success: boolean;
  message: string;
  sent: boolean;
  previousText?: string;
}> {
  const previousText = readChatInputValue();
  if (!previousText || previousText.length < 4) {
    return { success: true, message: "输入框无预填内容", sent: false };
  }
  await new Promise((r) => setTimeout(r, 400));
  const sent = clickSendButton();
  if (!sent.success) {
    return { success: false, message: `默认打招呼发送失败：${sent.message}`, sent: false };
  }
  return { success: true, message: "已发送 BOSS 默认打招呼", sent: true, previousText };
}

async function fillAndMaybeSend(
  content: string,
  autoSend?: boolean,
  afterDefaultFirst = true,
): Promise<{ success: boolean; message: string }> {
  const ready = await waitForChatInput(10000);
  if (!ready) {
    return { success: false, message: "沟通输入框未出现，请稍后重试" };
  }
  await new Promise((r) => setTimeout(r, 600));

  if (afterDefaultFirst) {
    const pre = await sendPrefilledGreetingIfAny();
    if (!pre.success) return pre;

    if (pre.sent) {
      await new Promise((r) => setTimeout(r, 1200));
      await waitForChatInputCleared(10000, pre.previousText);
      await new Promise((r) => setTimeout(r, 500));
    }

    const fill = fillGreetingInput(content);
    if (!fill.success) return fill;

    if (!autoSend) {
      return {
        success: true,
        message: pre.sent
          ? "已发送默认打招呼，定制话术已填入（请手动确认发送）"
          : "定制话术已填入（请手动确认发送）",
      };
    }

    await new Promise((r) => setTimeout(r, 800));
    const sent = clickSendButton();
    if (!sent.success) {
      return { success: true, message: `定制话术已填入，但自动发送失败：${sent.message}` };
    }
    return {
      success: true,
      message: pre.sent ? "已发送默认打招呼，并发送定制话术" : "已发送定制话术",
    };
  }

  const fill = fillGreetingInput(content);
  if (!fill.success) return fill;

  if (!autoSend) {
    return { success: true, message: "已填入输入框（请手动确认发送）" };
  }
  await new Promise((r) => setTimeout(r, 800));
  const sent = clickSendButton();
  if (!sent.success) {
    return { success: true, message: `${fill.message}，但自动发送失败：${sent.message}` };
  }
  return { success: true, message: "已填入并点击发送" };
}

const BOSS_INIT_KEY = "__jobAssistantBossInit";

if (!(window as unknown as Record<string, boolean>)[BOSS_INIT_KEY]) {
  (window as unknown as Record<string, boolean>)[BOSS_INIT_KEY] = true;

chrome.runtime.onMessage.addListener((message: BossMessage, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SCRAPE_JOB") {
    scrapeCurrentJob()
      .then((job) => {
        sendResponse({ type: "JOB_SCRAPED", job } satisfies BossMessage);
      })
      .catch((e) => {
        sendResponse({
          type: "JOB_SCRAPED",
          job: null,
          error: e instanceof Error ? e.message : "抓取失败",
        } satisfies BossMessage);
      });
    return true;
  }

  if (message.type === "WAIT_JOB_DETAIL") {
    waitForJobDetailReady(12000).then((ok) => {
      sendResponse({
        type: "ACTION_RESULT",
        success: ok,
        message: ok ? "岗位信息已就绪" : "岗位信息未就绪，将尝试从列表卡片读取",
      } satisfies BossMessage);
    });
    return true;
  }

  if (message.type === "GET_PAGE_INFO") {
    sendResponse({ type: "PAGE_INFO", info: getPageInfo() } satisfies BossMessage);
    return true;
  }

  if (message.type === "RESET_JOB_INDEX") {
    resetJobIndex();
    sendResponse({ type: "ACTION_RESULT", success: true, message: "已重置岗位索引" } satisfies BossMessage);
    return true;
  }

  if (message.type === "CLICK_NEXT_JOB") {
    clickNextJob().then((result) => {
      sendResponse({ type: "ACTION_RESULT", ...result } satisfies BossMessage);
    });
    return true;
  }

  if (message.type === "OPEN_CHAT") {
    const chat = clickStartChat();
    if (!chat.success) {
      sendResponse({ type: "ACTION_RESULT", ...chat } satisfies BossMessage);
      return true;
    }
    waitForChatInput().then((ok) => {
      sendResponse({
        type: "ACTION_RESULT",
        success: ok,
        message: ok ? "沟通窗口已打开" : "已点击沟通，但输入框未出现，请稍后重试",
      } satisfies BossMessage);
    });
    return true;
  }

  if (message.type === "SEND_GREETING") {
    const result = clickSendButton();
    sendResponse({ type: "ACTION_RESULT", ...result } satisfies BossMessage);
    return true;
  }

  if (message.type === "FILL_GREETING") {
    fillAndMaybeSend(message.content, message.autoSend, message.afterDefaultFirst ?? true).then((result) => {
      sendResponse({ type: "FILL_RESULT", ...result } satisfies BossMessage);
    });
    return true;
  }

  return false;
});

function notifyJobDetected() {
  scrapeCurrentJob().then((job) => {
    if (job) {
      chrome.runtime.sendMessage({ type: "PAGE_JOB_DETECTED", job }).catch(() => {});
    }
  });
}

setTimeout(notifyJobDetected, 1500);

chrome.runtime.sendMessage({ type: "BOSS_TAB_READY" }).catch(() => {});

const observer = new MutationObserver(() => {
  clearTimeout((window as unknown as { __bossNotifyTimer?: number }).__bossNotifyTimer);
  (window as unknown as { __bossNotifyTimer?: number }).__bossNotifyTimer = window.setTimeout(
    notifyJobDetected,
    1200,
  );
});
observer.observe(document.body, { childList: true, subtree: true });

}
