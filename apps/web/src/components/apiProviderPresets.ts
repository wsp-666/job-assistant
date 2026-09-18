export type ModelTier = "standard" | "pro";

export type ModelOption = {
  id: string;
  label: string;
  tier: ModelTier;
  desc?: string;
};

export type ProviderPreset = {
  id: string;
  label: string;
  desc: string;
  baseUrl?: string;
  needsSecret?: boolean;
  models?: ModelOption[];
};

const tierTag = (tier: ModelTier) => (tier === "pro" ? "Pro" : "普通");

export function modelOptionLabel(opt: ModelOption) {
  return `${opt.label}（${tierTag(opt.tier)}）`;
}

export const VISION_PROVIDERS: ProviderPreset[] = [
  {
    id: "baidu_ocr",
    label: "百度 OCR",
    desc: "扫描版简历 PDF 文字识别，个人每月约 1000 次免费",
    needsSecret: true,
    models: [
      { id: "general", label: "通用识别", tier: "standard", desc: "速度快，省额度，适合大多数简历" },
      { id: "accurate", label: "高精度识别", tier: "pro", desc: "识别更准，适合复杂排版或低清晰度扫描件" },
    ],
  },
  {
    id: "tencent_ocr",
    label: "腾讯云 OCR",
    desc: "通用印刷体识别，适合扫描版文档",
    needsSecret: true,
    models: [
      { id: "general", label: "通用印刷体", tier: "standard", desc: "标准识别" },
      { id: "accurate", label: "高精度印刷体", tier: "pro", desc: "复杂场景更准确" },
    ],
  },
  {
    id: "aliyun_ocr",
    label: "阿里云 OCR",
    desc: "文档智能识别，支持多场景文字提取",
    needsSecret: true,
    models: [
      { id: "general", label: "通用文字", tier: "standard", desc: "标准识别" },
      { id: "accurate", label: "高精版", tier: "pro", desc: "适合票据、表格等复杂文档" },
    ],
  },
  {
    id: "custom_vision",
    label: "自定义识图",
    desc: "自行配置识图服务接口与模型",
    needsSecret: false,
  },
];

export const ANALYSIS_PROVIDERS: ProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    desc: "高性价比，推荐用于话术生成",
    baseUrl: "https://api.deepseek.com",
    models: [
      { id: "deepseek-v4-flash", label: "V4 Flash", tier: "standard", desc: "推荐，速度快、成本低" },
      { id: "deepseek-chat", label: "Chat", tier: "standard", desc: "通用对话模型" },
      { id: "deepseek-reasoner", label: "Reasoner", tier: "pro", desc: "深度推理，质量更高但更慢" },
    ],
  },
  {
    id: "qwen",
    label: "通义千问",
    desc: "阿里云大模型，OpenAI 兼容接口",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      { id: "qwen-turbo", label: "Turbo", tier: "standard", desc: "轻量快速" },
      { id: "qwen-plus", label: "Plus", tier: "standard", desc: "均衡之选" },
      { id: "qwen-max", label: "Max", tier: "pro", desc: "旗舰模型，效果最佳" },
    ],
  },
  {
    id: "zhipu",
    label: "智谱 AI",
    desc: "GLM 系列模型",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      { id: "glm-4-flash", label: "GLM-4 Flash", tier: "standard", desc: "免费额度多，响应快" },
      { id: "glm-4-air", label: "GLM-4 Air", tier: "standard", desc: "轻量实用" },
      { id: "glm-4-plus", label: "GLM-4 Plus", tier: "pro", desc: "高智能旗舰" },
    ],
  },
  {
    id: "moonshot",
    label: "Moonshot / Kimi",
    desc: "长文本理解能力强",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [
      { id: "moonshot-v1-8k", label: "8K 上下文", tier: "standard", desc: "适合短话术生成" },
      { id: "moonshot-v1-32k", label: "32K 上下文", tier: "standard", desc: "中等长度 JD" },
      { id: "moonshot-v1-128k", label: "128K 上下文", tier: "pro", desc: "超长 JD 与简历" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    desc: "GPT 系列官方接口",
    baseUrl: "https://api.openai.com",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o Mini", tier: "standard", desc: "便宜快速" },
      { id: "gpt-4o", label: "GPT-4o", tier: "pro", desc: "多模态旗舰" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo", tier: "pro", desc: "高质量长文本" },
    ],
  },
  {
    id: "custom_analysis",
    label: "自定义分析",
    desc: "任意 OpenAI 兼容接口，自行填写模型名",
  },
];

export function providerList(category: "vision" | "analysis") {
  return category === "vision" ? VISION_PROVIDERS : ANALYSIS_PROVIDERS;
}

export function getProviderPreset(category: "vision" | "analysis", providerId: string) {
  return providerList(category).find((p) => p.id === providerId);
}

export function defaultModelForProvider(preset: ProviderPreset): string {
  return preset.models?.[0]?.id || "";
}

export function getVisionModelValue(profile: { provider: string; model: string; options: Record<string, string> }) {
  if (profile.provider === "custom_vision") return profile.model;
  return profile.options?.ocr_type || "general";
}

export function visionModelLabel(providerId: string, value: string): string {
  const preset = VISION_PROVIDERS.find((p) => p.id === providerId);
  const opt = preset?.models?.find((m) => m.id === value);
  return opt ? modelOptionLabel(opt) : value;
}

export function analysisModelLabel(providerId: string, model: string): string {
  const preset = ANALYSIS_PROVIDERS.find((p) => p.id === providerId);
  const opt = preset?.models?.find((m) => m.id === model);
  return opt ? modelOptionLabel(opt) : model;
}
