export type PanelMode = "manual" | "crawl" | "deliver";

export interface AutoDeliveryConfig {
  panelMode: PanelMode;
  minRoleScore: number;
  maxRoleScore: number;
  minBenefitsScore: number;
  maxBenefitsScore: number;
  minCompanyScore: number;
  maxCompanyScore: number;
  intervalSec: number;
  maxCount: number;
  crawlMaxCount: number;
  autoSend: boolean;
  autoWatch: boolean;
}

export const DEFAULT_AUTO_DELIVERY_CONFIG: AutoDeliveryConfig = {
  panelMode: "manual",
  minRoleScore: 60,
  maxRoleScore: 100,
  minBenefitsScore: 60,
  maxBenefitsScore: 100,
  minCompanyScore: 0,
  maxCompanyScore: 100,
  intervalSec: 8,
  maxCount: 20,
  crawlMaxCount: 50,
  autoSend: false,
  autoWatch: true,
};

const STORAGE_KEY = "autoDeliveryConfig";

export function inScoreRange(score: number, min: number, max: number): boolean {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return score >= lo && score <= hi;
}

export function checkAutoDeliveryScores(
  roleScore: number,
  benefitsScore: number,
  companyScore: number,
  config: Pick<
    AutoDeliveryConfig,
    | "minRoleScore"
    | "maxRoleScore"
    | "minBenefitsScore"
    | "maxBenefitsScore"
    | "minCompanyScore"
    | "maxCompanyScore"
  >,
): { ok: true } | { ok: false; reason: string } {
  if (!inScoreRange(roleScore, config.minRoleScore, config.maxRoleScore)) {
    const lo = Math.min(config.minRoleScore, config.maxRoleScore);
    const hi = Math.max(config.minRoleScore, config.maxRoleScore);
    return { ok: false, reason: `职责分 ${roleScore} 不在 ${lo}~${hi} 范围内` };
  }
  if (!inScoreRange(benefitsScore, config.minBenefitsScore, config.maxBenefitsScore)) {
    const lo = Math.min(config.minBenefitsScore, config.maxBenefitsScore);
    const hi = Math.max(config.minBenefitsScore, config.maxBenefitsScore);
    return { ok: false, reason: `待遇分 ${benefitsScore} 不在 ${lo}~${hi} 范围内` };
  }
  if (!inScoreRange(companyScore, config.minCompanyScore, config.maxCompanyScore)) {
    const lo = Math.min(config.minCompanyScore, config.maxCompanyScore);
    const hi = Math.max(config.minCompanyScore, config.maxCompanyScore);
    return { ok: false, reason: `公司分 ${companyScore} 不在 ${lo}~${hi} 范围内` };
  }
  return { ok: true };
}

export function formatScoreThresholds(
  config: Pick<
    AutoDeliveryConfig,
    | "minRoleScore"
    | "maxRoleScore"
    | "minBenefitsScore"
    | "maxBenefitsScore"
    | "minCompanyScore"
    | "maxCompanyScore"
  >,
): string {
  const range = (min: number, max: number, label: string) => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return `${label} ${lo}~${hi}`;
  };
  return [
    range(config.minRoleScore, config.maxRoleScore, "职责"),
    range(config.minBenefitsScore, config.maxBenefitsScore, "待遇"),
    range(config.minCompanyScore, config.maxCompanyScore, "公司"),
  ].join(" · ");
}

function normalizePanelMode(raw: Partial<AutoDeliveryConfig>): PanelMode {
  if (raw.panelMode === "crawl" || raw.panelMode === "deliver" || raw.panelMode === "manual") {
    return raw.panelMode;
  }
  // 兼容旧版：全自动 + autoSubMode
  const legacy = raw as Record<string, unknown> & { autoSubMode?: string };
  if (legacy.panelMode === "auto") {
    return legacy.autoSubMode === "deliver" ? "deliver" : "crawl";
  }
  return "manual";
}

export async function loadAutoDeliveryConfig(): Promise<AutoDeliveryConfig> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY] as Partial<AutoDeliveryConfig> & { autoSubMode?: string };
    if (!raw) return { ...DEFAULT_AUTO_DELIVERY_CONFIG };
    const panelMode = normalizePanelMode(raw);
    return {
      ...DEFAULT_AUTO_DELIVERY_CONFIG,
      ...raw,
      panelMode,
      crawlMaxCount: raw.crawlMaxCount ?? raw.maxCount ?? DEFAULT_AUTO_DELIVERY_CONFIG.crawlMaxCount,
    };
  } catch {
    return { ...DEFAULT_AUTO_DELIVERY_CONFIG };
  }
}

export async function saveAutoDeliveryConfig(config: AutoDeliveryConfig): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
  } catch {
    // ignore
  }
}

const DISCLAIMER_STORAGE_KEY = "deliveryDisclaimerAccepted";
export const DISCLAIMER_VERSION = "2026-06-1";

export async function isDeliveryDisclaimerAccepted(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(DISCLAIMER_STORAGE_KEY);
    return result[DISCLAIMER_STORAGE_KEY] === DISCLAIMER_VERSION;
  } catch {
    return false;
  }
}

export async function acceptDeliveryDisclaimer(): Promise<void> {
  try {
    await chrome.storage.local.set({ [DISCLAIMER_STORAGE_KEY]: DISCLAIMER_VERSION });
  } catch {
    // ignore
  }
}
