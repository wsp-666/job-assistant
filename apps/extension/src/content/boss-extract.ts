/** BOSS 反爬处理：字体混淆薪资、JD 噪声文本、内嵌 JSON / detail API 明文提取 */

export interface BossPlainJob {
  job_title?: string;
  company?: string;
  salary?: string;
  city?: string;
  jd_text?: string;
  hr_name?: string;
  hr_title?: string;
  company_size?: string;
  company_industry?: string;
}

const PUA_RE = /[\uE000-\uF8FF\uFFF0-\uFFFF\uFFFD]/g;
const CSS_BLOCK_RE = /\.[a-zA-Z_][\w-]*\s*\{[^}]*\}/g;
const AT_RULE_RE = /@[a-z-]+\s*\{[^}]*\}/gi;

export function isGarbledSalary(text: string): boolean {
  if (!text?.trim()) return true;
  if (PUA_RE.test(text)) return true;
  if (/[元Kk薪天]/.test(text) && !/\d/.test(text)) return true;
  return false;
}

export function isGarbledJd(text: string): boolean {
  if (!text) return true;
  const sample = text.slice(0, 800);
  const cssHits = (sample.match(CSS_BLOCK_RE) || []).length;
  if (cssHits >= 2) return true;
  if (sample.includes("display:none!important") || sample.includes("font-size:0!important")) return true;
  if (/举报微信扫码分享/.test(sample) && cssHits >= 1) return true;
  return false;
}

export function sanitizeJdText(raw: string): string {
  let text = raw || "";
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(CSS_BLOCK_RE, "");
  text = text.replace(AT_RULE_RE, "");
  text = text.replace(/举报[\s\S]*?(?=岗位职责|职位描述|工作职责|任职要求|岗位描述|工作内容)/g, "");
  text = text.replace(/举报微信扫码分享职位/g, "");
  text = text.replace(/微信扫码分享/g, "");
  text = text.replace(PUA_RE, "");
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^\.[a-zA-Z_]/.test(line)) return false;
      if (line.includes("!important") && line.includes("display")) return false;
      return true;
    })
    .join("\n");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function extractCleanElementText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("style, script, link, svg, iframe, noscript").forEach((n) => n.remove());

  clone.querySelectorAll("*").forEach((node) => {
    const htmlEl = node as HTMLElement;
    const style = htmlEl.getAttribute("style") || "";
    const cls = typeof htmlEl.className === "string" ? htmlEl.className : "";
    if (
      /display\s*:\s*none/i.test(style) ||
      /font-size\s*:\s*0/i.test(style) ||
      /visibility\s*:\s*hidden/i.test(style) ||
      /opacity\s*:\s*0/i.test(style) ||
      /hide|hidden|BossZhipin/i.test(cls)
    ) {
      node.remove();
    }
  });

  return sanitizeJdText((clone.textContent || "").trim());
}

function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function pickQuotedField(text: string, field: string): string {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const match = text.match(re);
  return match ? decodeJsonString(match[1]) : "";
}

function mapZpJobInfo(info: Record<string, unknown>): BossPlainJob {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const val = info[key];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    return "";
  };

  return {
    job_title: pick("jobName", "positionName", "title"),
    company: pick("brandName", "companyName", "comName"),
    salary: pick("salaryDesc", "salary"),
    city: pick("cityName", "city", "locationName"),
    jd_text: pick("postDescription", "jobDetail", "description"),
    hr_name: pick("bossName", "userName"),
    hr_title: pick("bossTitle", "title"),
    company_size: pick("companyScale", "scaleName"),
    company_industry: pick("companyIndustry", "industryName"),
  };
}

export function parseEmbeddedBossJob(): BossPlainJob | null {
  const merged: BossPlainJob = {};
  const assign = (src: BossPlainJob) => {
    for (const [k, v] of Object.entries(src) as [keyof BossPlainJob, string | undefined][]) {
      if (v && !merged[k]) merged[k] = v;
    }
  };

  const win = window as unknown as Record<string, unknown>;
  for (const key of Object.keys(win)) {
    if (!/job|zp|boss|detail|page/i.test(key)) continue;
    const val = win[key];
    if (!val || typeof val !== "object") continue;
    try {
      const json = JSON.stringify(val);
      if (json.includes("salaryDesc") || json.includes("postDescription") || json.includes("jobName")) {
        const jobInfo =
          (val as { jobInfo?: Record<string, unknown> }).jobInfo ||
          (val as { zpData?: { jobInfo?: Record<string, unknown> } }).zpData?.jobInfo;
        if (jobInfo) assign(mapZpJobInfo(jobInfo));
      }
    } catch {
      /* ignore */
    }
  }

  for (const script of document.querySelectorAll("script")) {
    const text = script.textContent || "";
    if (!text.includes("salaryDesc") && !text.includes("postDescription") && !text.includes("jobName")) {
      continue;
    }
    assign({
      job_title: pickQuotedField(text, "jobName") || pickQuotedField(text, "positionName"),
      company: pickQuotedField(text, "brandName") || pickQuotedField(text, "companyName"),
      salary: pickQuotedField(text, "salaryDesc") || pickQuotedField(text, "salary"),
      city: pickQuotedField(text, "cityName") || pickQuotedField(text, "city"),
      jd_text: pickQuotedField(text, "postDescription") || pickQuotedField(text, "jobDetail"),
      hr_name: pickQuotedField(text, "bossName"),
      hr_title: pickQuotedField(text, "bossTitle"),
      company_size: pickQuotedField(text, "companyScale"),
      company_industry: pickQuotedField(text, "companyIndustry"),
    });
  }

  const hasData = Object.values(merged).some((v) => v && String(v).trim());
  return hasData ? merged : null;
}

export function extractJobIdFromPage(card?: HTMLElement | null): {
  jobId: string;
  securityId?: string;
} | null {
  const url = window.location.href;
  const urlMatch = url.match(/job_detail\/([^.?#/]+)/) || url.match(/\/job\/([^.?#/]+)/);
  if (urlMatch?.[1]) {
    return { jobId: urlMatch[1] };
  }

  const roots = card ? [card] : Array.from(document.querySelectorAll<HTMLElement>("[data-jobid], [data-jid]"));
  for (const root of roots) {
    const jobId =
      root.getAttribute("data-jobid") ||
      root.getAttribute("data-jid") ||
      root.querySelector("[data-jobid]")?.getAttribute("data-jobid") ||
      "";
    if (!jobId) continue;
    const securityId =
      root.getAttribute("data-securityid") ||
      root.getAttribute("data-security-id") ||
      root.querySelector("[data-securityid]")?.getAttribute("data-securityid") ||
      undefined;
    return { jobId, securityId };
  }

  return null;
}

export async function fetchBossJobDetail(
  jobId: string,
  securityId?: string,
): Promise<BossPlainJob | null> {
  if (!jobId) return null;

  const endpoints = [
    `https://www.zhipin.com/wapi/zpgeek/job/detail.json?jobId=${encodeURIComponent(jobId)}`,
    `https://www.zhipin.com/wapi/zpgeek/job/detail.json?encryptJobId=${encodeURIComponent(jobId)}`,
  ];

  for (const base of endpoints) {
    const url = securityId ? `${base}&securityId=${encodeURIComponent(securityId)}` : base;
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        code?: number;
        zpData?: { jobInfo?: Record<string, unknown> };
      };
      if (data.code !== 0 || !data.zpData?.jobInfo) continue;
      const mapped = mapZpJobInfo(data.zpData.jobInfo);
      if (mapped.job_title || mapped.salary || mapped.jd_text) return mapped;
    } catch {
      /* try next */
    }
  }

  return null;
}

export function mergePlainJobFields(
  ...sources: (BossPlainJob | null | undefined)[]
): BossPlainJob {
  const out: BossPlainJob = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src) as [keyof BossPlainJob, string | undefined][]) {
      const val = (v || "").trim();
      if (!val) continue;
      if (k === "salary" && isGarbledSalary(val)) continue;
      if (k === "jd_text" && isGarbledJd(val)) continue;
      if (!out[k] || (k === "jd_text" && val.length > (out.jd_text?.length || 0))) {
        out[k] = k === "jd_text" ? sanitizeJdText(val) : val;
      }
    }
  }
  return out;
}
