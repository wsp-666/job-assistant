import type { JobData } from "./api";

/** 有效 JD 最少字符数 */
export const MIN_JD_LENGTH = 80;

const JD_KEYWORDS = [
  "岗位职责",
  "职位描述",
  "任职要求",
  "工作职责",
  "岗位描述",
  "岗位要求",
  "工作内容",
  "任职资格",
];

const LIST_PAGE_JUNK_MARKERS = ["立即沟通", "职位收藏", "推荐职位", "查看全部职位", "相似职位"];

const INVALID_TITLES = new Set(["未知岗位", "未知公司", ""]);

export function hasMeaningfulJd(jdText: string): boolean {
  const jd = jdText.trim();
  if (jd.length < MIN_JD_LENGTH) return false;
  if (!JD_KEYWORDS.some((k) => jd.includes(k))) return false;
  if (looksLikeListPageJunk(jd)) return false;
  return true;
}

export function looksLikeListPageJunk(jd: string): boolean {
  let hits = 0;
  for (const m of LIST_PAGE_JUNK_MARKERS) {
    if (jd.includes(m)) hits += 1;
  }
  if (hits >= 2) return true;
  const chatCount = jd.match(/立即沟通/g)?.length ?? 0;
  return chatCount >= 2;
}

export function checkJobDeliverable(
  job: JobData | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!job) {
    return { ok: false, reason: "未能读取岗位信息" };
  }
  if (INVALID_TITLES.has(job.job_title.trim()) || job.job_title.trim().length < 2) {
    return { ok: false, reason: "岗位名称无效" };
  }
  if (INVALID_TITLES.has(job.company.trim()) || job.company.trim().length < 2) {
    return { ok: false, reason: "公司名称无效" };
  }
  const jd = job.jd_text.trim();
  if (jd.length < MIN_JD_LENGTH) {
    return { ok: false, reason: `岗位介绍过短（${jd.length} 字，需 ≥${MIN_JD_LENGTH}）` };
  }
  if (!JD_KEYWORDS.some((k) => jd.includes(k))) {
    return { ok: false, reason: "未检测到岗位职责/任职要求等介绍" };
  }
  if (looksLikeListPageJunk(jd)) {
    return { ok: false, reason: "岗位详情未加载完整（疑似列表页内容）" };
  }
  return { ok: true };
}
