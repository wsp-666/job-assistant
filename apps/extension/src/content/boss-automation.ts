/** BOSS 列表页自动切换岗位、打开沟通、发送话术 */

import type { JobData } from "../shared/api";
import { extractCleanElementText, isGarbledSalary, sanitizeJdText } from "./boss-extract";

export type PageType = "list" | "detail" | "chat" | "unknown";

export interface PageInfo {
  pageType: PageType;
  jobCount: number;
  activeIndex: number;
  url: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  index?: number;
  total?: number;
}

let currentJobIndex = -1;
const visitedJobKeys = new Set<string>();

export function getCurrentJobCardIndex(): number {
  return currentJobIndex;
}

function getCardKey(card: HTMLElement): string {
  const url = extractJobUrlFromCard(card);
  if (url) return url;

  const jid =
    card.getAttribute("data-jobid") ||
    card.querySelector("[data-jobid]")?.getAttribute("data-jobid") ||
    card.getAttribute("data-jid");
  if (jid) return `jid:${jid}`;

  const title = pickIn(card, ".job-name", ".job-title", "[class*='job-name']", "h3");
  const company = pickIn(card, ".company-name", "[class*='company-name']");
  if (title) return `title:${title}|${company}`;

  return `pos:${cardTopPosition(card)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

/** 右侧岗位详情区域（排除左侧列表） */
export function findJobDetailRoot(): HTMLElement | null {
  const selectors = [
    ".job-detail-wrapper",
    ".job-detail-box",
    ".job-detail-container",
    ".job-detail",
    ".detail-job-box",
    "[class*='job-detail-wrap']",
    "[class*='JobDetail']",
  ];

  for (const sel of selectors) {
    const nodes = document.querySelectorAll<HTMLElement>(sel);
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      if (node.closest(".job-list-box, .job-list, .job-card-wrapper, .job-card-box, .job-card")) {
        continue;
      }
      const hasDetail =
        node.querySelector(".job-sec-text, .job-detail-section, .job-name, .job-title, h1") ||
        (node.className || "").includes("job-detail");
      if (hasDetail) return node;
    }
  }

  const clickables = document.querySelectorAll<HTMLElement>("a, button, span, div");
  for (const btn of clickables) {
    const label = (btn.textContent || "").replace(/\s+/g, "");
    if (!label.includes("立即沟通") && !label.includes("继续沟通")) continue;
    if (!isVisible(btn)) continue;
    const panel = btn.closest<HTMLElement>(
      ".job-detail-wrapper, .job-detail-box, .job-detail, .job-detail-container, [class*='detail'], .right-container",
    );
    if (!panel) continue;
    if (panel.closest(".job-list-box, .job-list, .job-card-wrapper, .job-card-box")) continue;
    return panel;
  }

  return null;
}

function extractJobUrlFromCard(card: HTMLElement): string {
  const link = card.querySelector<HTMLAnchorElement>(
    'a[href*="job_detail"], a[href*="/job/"], a[href*="jobs"]',
  );
  if (link?.href) return normalizeJobUrl(link.href);

  const jid =
    card.getAttribute("data-jobid") ||
    card.querySelector("[data-jobid]")?.getAttribute("data-jobid") ||
    card.getAttribute("data-jid");
  if (jid) {
    return normalizeJobUrl(`${window.location.origin}/job_detail/${jid}.html`);
  }
  return "";
}

export function guessCompanyFromText(text: string): string {
  const match = text.match(
    /[\u4e00-\u9fa5（）()A-Za-z0-9·]{2,48}(?:有限公司|股份有限公司|有限责任公司|科技公司|集团有限公司)/,
  );
  return match?.[0]?.trim() || "";
}

function normalizeJobUrl(href: string): string {
  if (!href) return "";
  try {
    return new URL(href, window.location.origin).href.split("?")[0];
  } catch {
    return href.split("?")[0];
  }
}

function collectCardTags(card: HTMLElement): string[] {
  const tags = new Set<string>();
  card.querySelectorAll(
    ".tag-list li, .tag-list span, .info-desc span, .job-card-footer span, .job-info span, [class*='tag-list'] span",
  ).forEach((el) => {
    const t = textOf(el);
    if (t && t.length > 0 && t.length < 40) tags.add(t);
  });
  return Array.from(tags);
}

/** 从左侧列表卡片读取岗位（补充链接与公司名） */
export function scrapeJobFromCard(card: HTMLElement): JobData | null {
  const job_url = extractJobUrlFromCard(card);

  const job_title = pickIn(
    card,
    ".job-name",
    ".job-title",
    ".job-card-left .name",
    "[class*='job-name']",
    "h3",
  );

  let company = pickIn(
    card,
    ".company-name",
    ".company-text",
    ".info-public .company-name",
    ".job-card-footer .company-name",
    "a.company-name",
    "[class*='company-name']",
    ".info-company",
  );
  if (!company) {
    company = guessCompanyFromText(textOf(card.querySelector(".job-card-footer, .info-public")) || textOf(card));
  }

  const salaryRaw = pickIn(card, ".salary", ".job-salary", ".red", "[class*='salary']");
  const salary = isGarbledSalary(salaryRaw) ? "" : salaryRaw;

  let city = pickIn(card, ".job-area", ".job-location", ".text-city", "[class*='job-area']");
  const tags = collectCardTags(card);
  if (!city) {
    city = tags.find((t) => /市|区|县|省/.test(t) && t.length <= 12) || "";
  }

  if (!job_title) return null;

  const tagLine = tags.length ? tags.join(" · ") : "";
  const jd_text = [
    `岗位：${job_title}`,
    company ? `公司：${company}` : "",
    salary ? `薪资：${salary}` : "",
    city ? `城市：${city}` : "",
    tagLine ? `标签：${tagLine}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    platform: "boss",
    job_title,
    company: company || "",
    salary,
    city,
    jd_text,
    job_url: job_url || window.location.href.split("?")[0],
    hr_name: "",
    hr_title: "",
    company_size: "",
    company_industry: "",
  };
}

export function getActiveJobCard(): HTMLElement | null {
  const cards = findJobCards();
  if (cards.length === 0) return null;

  const activeIndex = detectActiveCardIndex(cards);
  if (activeIndex >= 0) {
    if (activeIndex > currentJobIndex) {
      currentJobIndex = activeIndex;
    }
    return cards[activeIndex];
  }

  if (currentJobIndex >= 0 && currentJobIndex < cards.length) {
    return cards[currentJobIndex];
  }
  if (cards.length === 1) return cards[0];
  return null;
}

export function scrapeActiveListJob(): JobData | null {
  const card = getActiveJobCard();
  if (!card) return null;
  return scrapeJobFromCard(card);
}

function listCardReady(): boolean {
  const detailRoot = findJobDetailRoot();
  if (detailRoot) {
    const title = pickIn(detailRoot, ".job-name", ".job-title", "h1.name", "h1");
    if (title) return true;
  }
  const job = scrapeActiveListJob();
  return Boolean(job?.job_title);
}

function isListCardEligible(card: HTMLElement): boolean {
  if (!card.querySelector(".job-name, .job-title, [class*='job-name']")) return false;
  if (card.closest("[class*='job-detail']")) return false;
  return true;
}

function cardTopPosition(card: HTMLElement): number {
  const rect = card.getBoundingClientRect();
  const listRoot = card.closest<HTMLElement>(
    ".job-list-box, .job-list, .job-recommend-result, .search-job-result",
  );
  if (listRoot) {
    return rect.top - listRoot.getBoundingClientRect().top + listRoot.scrollTop;
  }
  return rect.top + window.scrollY;
}

function sortCardsTopDown(cards: HTMLElement[]): HTMLElement[] {
  return [...cards].sort((a, b) => {
    const diff = cardTopPosition(a) - cardTopPosition(b);
    if (Math.abs(diff) > 1) return diff;
    return cards.indexOf(a) - cards.indexOf(b);
  });
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findClickableByTexts(texts: string[]): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>("a, button, span, div[role='button']");
  for (const el of nodes) {
    if (!isVisible(el)) continue;
    const t = (el.textContent || "").replace(/\s+/g, "");
    if (texts.some((x) => t.includes(x.replace(/\s+/g, "")))) {
      return el;
    }
  }
  return null;
}

function clickElement(el: HTMLElement): void {
  el.scrollIntoView({ block: "nearest", behavior: "auto" });
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.click();
}

/** 收集左侧/列表中的岗位卡片（自上而下排序，含列表内未滚入视口的卡片） */
export function findJobCards(): HTMLElement[] {
  const seen = new Set<HTMLElement>();

  const listRoots = document.querySelectorAll<HTMLElement>(
    ".job-list-box, .job-list, .job-recommend-result, .search-job-result",
  );
  const cardSelectors = ".job-card-wrapper, .job-card-box, .job-card, li";

  if (listRoots.length > 0) {
    for (const root of listRoots) {
      root.querySelectorAll<HTMLElement>(cardSelectors).forEach((card) => {
        if (!isListCardEligible(card)) return;
        if (!isVisible(card)) return;
        seen.add(card);
      });
    }
  }

  const links = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="job_detail"], a[href*="/job/"]',
  );
  for (const link of links) {
    const card =
      link.closest<HTMLElement>(
        "li, .job-card-wrapper, .job-card-box, .job-card, [class*='job-card'], .job-list li",
      ) || link;
    if (!isListCardEligible(card)) continue;
    if (!card.closest(".job-list-box, .job-list, .job-recommend-result, .search-job-result")) continue;
    if (!isVisible(card)) continue;
    seen.add(card);
  }

  return sortCardsTopDown(Array.from(seen));
}

function cardLooksSelected(card: HTMLElement): boolean {
  const cls = card.className || "";
  if (
    card.classList.contains("active") ||
    card.classList.contains("selected") ||
    card.classList.contains("curr") ||
    card.getAttribute("aria-selected") === "true" ||
    /\b(job-card-wrapper-active|is-active|is-selected|job-active)\b/i.test(cls)
  ) {
    return true;
  }
  const directChild = card.querySelector(":scope > .active, :scope > .selected, :scope > [class*='active']");
  return Boolean(directChild);
}

function detectActiveCardIndex(cards: HTMLElement[]): number {
  const pageUrl = normalizeJobUrl(window.location.href);
  if (pageUrl.includes("job_detail") || pageUrl.includes("/job/")) {
    for (let i = 0; i < cards.length; i++) {
      const cardUrl = extractJobUrlFromCard(cards[i]);
      if (cardUrl && cardUrl === pageUrl) return i;
    }
  }

  for (let i = 0; i < cards.length; i++) {
    if (cardLooksSelected(cards[i])) return i;
  }
  return -1;
}

export function getPageInfo(): PageInfo {
  const url = window.location.href;
  const cards = findJobCards();
  const activeIndex = detectActiveCardIndex(cards);

  let pageType: PageType = "unknown";
  if (url.includes("/chat") || document.querySelector(".chat-conversation, .chat-box, .im-chat")) {
    pageType = "chat";
  } else if (url.includes("/job_detail/") || url.includes("/job/")) {
    pageType = cards.length > 1 ? "list" : "detail";
  } else if (cards.length > 0) {
    pageType = "list";
  } else if (document.querySelector(".job-detail, .job-sec-text")) {
    pageType = "detail";
  }

  return { pageType, jobCount: cards.length, activeIndex, url };
}

function scrollJobListDown(): boolean {
  const selectors = [".job-list-box", ".job-list", ".card-area", ".job-recommend-result", ".frame-container"];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.scrollHeight > el.clientHeight + 20) {
      const prevTop = el.scrollTop;
      el.scrollTop += Math.min(320, el.clientHeight * 0.6);
      return el.scrollTop > prevTop;
    }
  }
  window.scrollBy({ top: 400, behavior: "auto" });
  return false;
}

function findNextUnvisitedIndex(cards: HTMLElement[], startFrom: number): number {
  for (let i = Math.max(0, startFrom); i < cards.length; i++) {
    if (!visitedJobKeys.has(getCardKey(cards[i]))) return i;
  }
  return -1;
}

export function resetJobIndex(): void {
  currentJobIndex = -1;
  visitedJobKeys.clear();
}

function detailTextLength(): number {
  const root = findJobDetailRoot() || document;
  const selectors = [
    ".job-sec-text",
    ".job-detail-section .text",
    ".detail-content",
    ".job-detail-body",
    ".job-detail-section",
  ];
  for (const sel of selectors) {
    const nodes = root.querySelectorAll(sel);
    if (!nodes.length) continue;
    const text = Array.from(nodes)
      .map((n) => extractCleanElementText(n))
      .filter(Boolean)
      .join("\n");
    const clean = sanitizeJdText(text);
    if (clean.length > 50) return clean.length;
  }
  return 0;
}

/** 切换岗位后等待列表卡片或右侧 JD 任一就绪即可抓取 */
export async function waitForJobDetailReady(timeoutMs = 12000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (detailTextLength() >= 80) return true;
    if (listCardReady()) return true;
    await sleep(400);
  }
  return detailTextLength() >= 80 || listCardReady();
}

export async function clickJobCard(index: number): Promise<ActionResult> {
  const cards = findJobCards();
  if (cards.length === 0) {
    return {
      success: false,
      message: "未找到岗位列表。请打开 BOSS 职位搜索/推荐页（左侧有岗位列表）",
    };
  }
  if (index < 0 || index >= cards.length) {
    return { success: false, message: `岗位索引无效 (${index + 1}/${cards.length})` };
  }

  const card = cards[index];
  const link = card.querySelector<HTMLAnchorElement>(
    'a[href*="job_detail"], a[href*="/job/"], a[href*="jobs"]',
  );
  const target = link || card;
  const key = getCardKey(card);

  clickElement(target);
  await sleep(300);
  target.click();

  currentJobIndex = index;
  visitedJobKeys.add(key);

  await sleep(900);
  return {
    success: true,
    message: `已点击第 ${index + 1}/${cards.length} 个岗位（自上而下）`,
    index,
    total: cards.length,
  };
}

export async function clickNextJob(): Promise<ActionResult> {
  let cards = findJobCards();
  if (cards.length === 0) {
    return {
      success: false,
      message: "未找到岗位列表。请在 BOSS 打开带左侧列表的搜索/推荐页面",
    };
  }

  const active = detectActiveCardIndex(cards);
  if (active >= 0 && active > currentJobIndex) {
    currentJobIndex = active;
    visitedJobKeys.add(getCardKey(cards[active]));
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    cards = findJobCards();
    const scanFrom = currentJobIndex >= 0 ? currentJobIndex + 1 : 0;
    const nextIndex = findNextUnvisitedIndex(cards, scanFrom);

    if (nextIndex >= 0) {
      return clickJobCard(nextIndex);
    }

    const beforeKeys = new Set(cards.map(getCardKey));
    const scrolled = scrollJobListDown();
    await sleep(scrolled ? 900 : 500);
    cards = findJobCards();

    const hasNewCard = cards.some((card) => !beforeKeys.has(getCardKey(card)));
    if (!hasNewCard && !scrolled) {
      return {
        success: false,
        message: "已从上到下遍历完当前列表，没有更多岗位",
      };
    }
  }

  return {
    success: false,
    message: "已从上到下遍历完当前列表，没有更多岗位",
  };
}

export function clickStartChat(): ActionResult {
  const btn = findClickableByTexts(["立即沟通", "继续沟通", "聊一聊", "继续聊"]);
  if (!btn) {
    return { success: false, message: "未找到「立即沟通」按钮，请确认在岗位详情页" };
  }
  clickElement(btn);
  return { success: true, message: "已点击立即沟通" };
}

export function clickSendButton(): ActionResult {
  const btn = findClickableByTexts(["发送", "发 送"]);
  if (!btn) {
    return { success: false, message: "未找到发送按钮" };
  }
  clickElement(btn);
  return { success: true, message: "已点击发送" };
}

export async function waitForChatInput(timeoutMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (findChatInputElement()) return true;
    await sleep(300);
  }
  return false;
}

const CHAT_INPUT_SELECTORS = [
  ".dialog-container textarea",
  ".chat-input textarea",
  "#chat-input textarea",
  "textarea.input-area",
  "textarea[class*='input']",
  ".im-chat textarea",
  "div[contenteditable='true'][class*='chat']",
  "div[contenteditable='true']",
  "textarea",
] as const;

/** BOSS 沟通弹窗内的输入框（优先可见、在对话框内） */
export function findChatInputElement(): HTMLTextAreaElement | HTMLDivElement | null {
  for (const sel of CHAT_INPUT_SELECTORS) {
    const nodes = document.querySelectorAll<HTMLTextAreaElement | HTMLDivElement>(sel);
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      if (el instanceof HTMLTextAreaElement) return el;
      if (el.isContentEditable) return el;
    }
  }
  return null;
}

export function readChatInputValue(): string {
  const el = findChatInputElement();
  if (!el) return "";
  if (el instanceof HTMLTextAreaElement) return el.value.trim();
  return (el.textContent || el.innerText || "").trim();
}

function setNativeTextareaValue(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
}

/** 清空并写入话术，兼容 React 受控组件与 contenteditable */
export function writeChatInputContent(content: string): boolean {
  const el = findChatInputElement();
  if (!el) return false;

  el.focus();

  if (el instanceof HTMLTextAreaElement) {
    setNativeTextareaValue(el, "");
    setNativeTextareaValue(el, content);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: content }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand("delete", false);
    document.execCommand("insertText", false, content);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: content }));
    return true;
  }

  return false;
}

/** BOSS 预填的默认打招呼语片段，填入失败时用于拦截自动发送 */
export const BOSS_DEFAULT_GREETING_MARKERS = [
  "对贵司招聘岗位很感兴趣",
  "希望能有机会加入贵司",
  "期待您的回复",
] as const;

export function looksLikeBossDefaultGreeting(text: string): boolean {
  const t = text.replace(/\s+/g, "");
  return BOSS_DEFAULT_GREETING_MARKERS.some((m) => t.includes(m.replace(/\s+/g, "")));
}

/** 默认打招呼发出后，等待输入框可再次编辑 */
export async function waitForChatInputCleared(
  timeoutMs = 10000,
  previousText?: string,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const val = readChatInputValue();
    if (val.length < 3) return true;
    if (previousText && val !== previousText && !looksLikeBossDefaultGreeting(val)) return true;
    await sleep(300);
  }
  return readChatInputValue().length < 3;
}
