import { useState } from "react";
import { api } from "../api/client";
import MultiChipSelect, { PRESET_CITIES, PRESET_JOB_TITLES } from "./MultiChipSelect";

const JOB_TYPE_PRESETS = ["全职", "实习", "兼职", "校招"];
const COMPANY_SIZE_PRESETS = ["0-20人", "20-99人", "100-499人", "500-999人", "1000-9999人", "10000人以上"];
const OUTLOOK_PRESETS = ["人工智能", "新能源", "半导体", "生物医药", "互联网", "金融科技", "高端制造"];

export interface TargetPosition {
  id: string;
  title: string;
  title_aliases: string[];
  summary: string;
  details: string;
  keywords: string[];
  cities: string[];
  min_salary: number;
  max_salary: number;
  min_salary_unlimited: boolean;
  max_salary_unlimited: boolean;
  include_keywords: string[];
  exclude_keywords: string[];
  greeting_style: string;
  daily_limit: number;
  salary_type_monthly: boolean;
  salary_type_daily: boolean;
  min_daily_salary: number;
  max_daily_salary: number;
  min_daily_salary_unlimited: boolean;
  max_daily_salary_unlimited: boolean;
  job_types: string[];
  weekend_rest: "any" | "double_rest";
  require_social_insurance: boolean;
  want_year_end_bonus: boolean;
  want_commission: boolean;
  want_meal_allowance: boolean;
  want_accommodation: boolean;
  preferred_company_sizes: string[];
  preferred_industries: string[];
  outlook_industries: string[];
  cities_unlimited: boolean;
  company_sizes_unlimited: boolean;
}

export function newPosition(title = ""): TargetPosition {
  return {
    id: crypto.randomUUID(),
    title,
    title_aliases: [],
    summary: "",
    details: "",
    keywords: [],
    cities: [],
    min_salary: 10,
    max_salary: 30,
    min_salary_unlimited: true,
    max_salary_unlimited: true,
    include_keywords: [],
    exclude_keywords: [],
    greeting_style: "简洁",
    daily_limit: 30,
    salary_type_monthly: true,
    salary_type_daily: false,
    min_daily_salary: 150,
    max_daily_salary: 400,
    min_daily_salary_unlimited: true,
    max_daily_salary_unlimited: true,
    job_types: [],
    weekend_rest: "any",
    require_social_insurance: false,
    want_year_end_bonus: false,
    want_commission: false,
    want_meal_allowance: false,
    want_accommodation: false,
    preferred_company_sizes: [],
    preferred_industries: [],
    outlook_industries: [],
    cities_unlimited: true,
    company_sizes_unlimited: true,
  };
}

function parseList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinList(list: string[]): string {
  return list.join("，");
}

function mergeUnique(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = item.trim();
      if (!key) continue;
      const lower = key.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(key);
    }
  }
  return out;
}

function formatSalary(pos: TargetPosition): string {
  const parts: string[] = [];
  if (pos.salary_type_monthly !== false) {
    if (pos.min_salary_unlimited && pos.max_salary_unlimited) {
      parts.push("月薪不限");
    } else {
      const low = pos.min_salary_unlimited ? "不限" : `${pos.min_salary}K`;
      const high = pos.max_salary_unlimited ? "不限" : `${pos.max_salary}K`;
      parts.push(`月薪 ${low}~${high}`);
    }
  }
  if (pos.salary_type_daily) {
    if (pos.min_daily_salary_unlimited && pos.max_daily_salary_unlimited) {
      parts.push("日薪不限");
    } else {
      const low = pos.min_daily_salary_unlimited ? "不限" : `${pos.min_daily_salary}`;
      const high = pos.max_daily_salary_unlimited ? "不限" : `${pos.max_daily_salary}`;
      parts.push(`日薪 ${low}~${high}元/天`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "薪资不限";
}

function formatBenefitsSummary(pos: TargetPosition): string {
  const parts: string[] = [];
  if (pos.job_types.length > 0) parts.push(pos.job_types.join("/"));
  if (pos.weekend_rest === "double_rest") parts.push("双休");
  if (pos.require_social_insurance) parts.push("五险一金");
  const wants: string[] = [];
  if (pos.want_year_end_bonus) wants.push("年终奖");
  if (pos.want_commission) wants.push("提成");
  if (pos.want_meal_allowance) wants.push("餐补");
  if (pos.want_accommodation) wants.push("包住宿");
  if (wants.length > 0) parts.push(`期望：${wants.join("、")}`);
  return parts.length > 0 ? parts.join(" · ") : "待遇不限";
}

function formatCompanySummary(pos: TargetPosition): string {
  const parts: string[] = [];
  if (pos.company_sizes_unlimited) {
    parts.push("规模不限");
  } else if (pos.preferred_company_sizes.length > 0) {
    parts.push(`规模：${pos.preferred_company_sizes.join("/")}`);
  }
  if (pos.preferred_industries.length > 0) parts.push(`行业：${pos.preferred_industries.join("、")}`);
  if (pos.outlook_industries.length > 0) parts.push(`前景：${pos.outlook_industries.join("、")}`);
  return parts.length > 0 ? parts.join(" · ") : "公司不限";
}

function resetFormFields(
  pos: TargetPosition,
  isNew: boolean,
): {
  draft: TargetPosition & { isNew: boolean };
  keywordsText: string;
  aliasesText: string;
  includeText: string;
  excludeText: string;
  industryText: string;
  outlookText: string;
} {
  return {
    draft: {
      ...pos,
      cities_unlimited: pos.cities_unlimited ?? pos.cities.length === 0,
      company_sizes_unlimited: pos.company_sizes_unlimited ?? pos.preferred_company_sizes.length === 0,
      isNew,
    },
    keywordsText: pos.keywords.join("，"),
    aliasesText: joinList(pos.title_aliases ?? []),
    includeText: joinList(pos.include_keywords),
    excludeText: joinList(pos.exclude_keywords),
    industryText: joinList(pos.preferred_industries),
    outlookText: joinList(pos.outlook_industries),
  };
}

interface Props {
  positions: TargetPosition[];
  onSave: (next: TargetPosition[]) => Promise<void>;
  saving?: boolean;
  message?: string;
}

type Draft = TargetPosition & { isNew: boolean };

export default function TargetPositionLayers({ positions, onSave, saving, message }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...newPosition(), isNew: true }));
  const [keywordsText, setKeywordsText] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [includeText, setIncludeText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [excludeText, setExcludeText] = useState("");
  const [industryText, setIndustryText] = useState("");
  const [outlookText, setOutlookText] = useState("");

  const openAdd = () => {
    const next = resetFormFields(newPosition(), true);
    setDraft(next.draft);
    setKeywordsText(next.keywordsText);
    setAliasesText(next.aliasesText);
    setIncludeText(next.includeText);
    setExcludeText(next.excludeText);
    setIndustryText(next.industryText);
    setOutlookText(next.outlookText);
  };

  const openEdit = (pos: TargetPosition) => {
    const next = resetFormFields(pos, false);
    setDraft(next.draft);
    setKeywordsText(next.keywordsText);
    setAliasesText(next.aliasesText);
    setIncludeText(next.includeText);
    setExcludeText(next.excludeText);
    setIndustryText(next.industryText);
    setOutlookText(next.outlookText);
  };

  const pickPreset = (title: string) => {
    setDraft((d) => ({ ...d, title }));
  };

  const handleSuggestKeywords = async () => {
    const mainTitle = draft.title.trim();
    const aliases = parseList(aliasesText);
    const titles = mergeUnique([mainTitle], aliases);
    if (!titles.length) {
      alert("请先填写岗位主名称");
      return;
    }
    setSuggesting(true);
    try {
      const res = await api.suggestPositionKeywords({
        titles,
        summary: draft.summary.trim(),
        details: draft.details.trim(),
      });
      const mainLower = mainTitle.toLowerCase();
      const nextAliases = mergeUnique(
        aliases,
        res.title_aliases.filter((a) => a.toLowerCase() !== mainLower),
      );
      const nextKeywords = mergeUnique(parseList(keywordsText), res.keywords);
      setAliasesText(joinList(nextAliases));
      setKeywordsText(joinList(nextKeywords));
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setSuggesting(false);
    }
  };

  const buildSaved = (): TargetPosition | null => {
    if (!draft.title.trim()) return null;
    return {
      id: draft.id,
      title: draft.title.trim(),
      title_aliases: parseList(aliasesText).filter(
        (a) => a.toLowerCase() !== draft.title.trim().toLowerCase(),
      ),
      summary: draft.summary.trim(),
      details: draft.details.trim(),
      keywords: parseList(keywordsText),
      cities: draft.cities,
      min_salary: draft.min_salary,
      max_salary: draft.max_salary,
      min_salary_unlimited: draft.min_salary_unlimited,
      max_salary_unlimited: draft.max_salary_unlimited,
      include_keywords: parseList(includeText),
      exclude_keywords: parseList(excludeText),
      greeting_style: draft.greeting_style,
      daily_limit: draft.daily_limit,
      salary_type_monthly: draft.salary_type_monthly,
      salary_type_daily: draft.salary_type_daily,
      min_daily_salary: draft.min_daily_salary,
      max_daily_salary: draft.max_daily_salary,
      min_daily_salary_unlimited: draft.min_daily_salary_unlimited,
      max_daily_salary_unlimited: draft.max_daily_salary_unlimited,
      job_types: draft.job_types,
      weekend_rest: draft.weekend_rest,
      require_social_insurance: draft.require_social_insurance,
      want_year_end_bonus: draft.want_year_end_bonus,
      want_commission: draft.want_commission,
      want_meal_allowance: draft.want_meal_allowance,
      want_accommodation: draft.want_accommodation,
      preferred_company_sizes: draft.preferred_company_sizes,
      preferred_industries: parseList(industryText),
      outlook_industries: parseList(outlookText),
      cities_unlimited: draft.cities_unlimited,
      company_sizes_unlimited: draft.company_sizes_unlimited,
    };
  };

  const handleSave = async () => {
    const saved = buildSaved();
    if (!saved) return;
    if (draft.isNew && positions.some((p) => p.title === saved.title)) return;

    const next = draft.isNew
      ? [...positions, saved]
      : positions.map((p) => (p.id === saved.id ? saved : p));

    await onSave(next);
    openAdd();
  };

  const remove = async (id: string) => {
    await onSave(positions.filter((p) => p.id !== id));
    if (!draft.isNew && draft.id === id) openAdd();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...positions];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await onSave(next);
  };

  const updateDraft = (patch: Partial<TargetPosition>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };

  const toggleJobType = (type: string) => {
    setDraft((d) => {
      const has = d.job_types.includes(type);
      return {
        ...d,
        job_types: has ? d.job_types.filter((t) => t !== type) : [...d.job_types, type],
      };
    });
  };

  const toggleCompanySize = (size: string) => {
    setDraft((d) => {
      const has = d.preferred_company_sizes.includes(size);
      return {
        ...d,
        company_sizes_unlimited: false,
        preferred_company_sizes: has
          ? d.preferred_company_sizes.filter((s) => s !== size)
          : [...d.preferred_company_sizes, size],
      };
    });
  };

  const setCitiesUnlimited = (unlimited: boolean) => {
    setDraft((d) => ({
      ...d,
      cities_unlimited: unlimited,
      cities: unlimited ? [] : d.cities,
    }));
  };

  const setCompanySizesUnlimited = (unlimited: boolean) => {
    setDraft((d) => ({
      ...d,
      company_sizes_unlimited: unlimited,
      preferred_company_sizes: unlimited ? [] : d.preferred_company_sizes,
    }));
  };

  const toggleOutlook = (item: string) => {
    setOutlookText((prev) => {
      const list = parseList(prev);
      const has = list.includes(item);
      const next = has ? list.filter((x) => x !== item) : [...list, item];
      return joinList(next);
    });
  };

  const selectedId = draft.isNew ? null : draft.id;

  return (
    <div className="grid min-h-[calc(100vh-9.5rem)] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-2">
      {/* 左侧：已添加岗位 */}
      <div className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
        <div className="shrink-0 border-b border-slate-200 px-6 py-3">
          <h3 className="text-lg font-semibold text-slate-900">已添加的目标岗位</h3>
          <p className="text-sm text-slate-500">自上而下优先级递减 · 点击在右侧编辑</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {positions.length === 0 ? (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              暂无岗位，请在右侧填写并保存
            </div>
          ) : (
            <div className="space-y-4">
              {positions.map((pos, index) => {
                const active = pos.id === selectedId;
                return (
                  <div
                    key={pos.id}
                    className={`rounded-lg border bg-white shadow-sm transition ${
                      active ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <button type="button" onClick={() => openEdit(pos)} className="w-full p-5 text-left">
                      <div className="flex items-start gap-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-bold text-white">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xl font-semibold text-slate-900">{pos.title}</h4>
                          {(pos.title_aliases?.length ?? 0) > 0 && (
                            <p className="mt-1 text-sm text-slate-500">
                              同类名称：{pos.title_aliases.join("、")}
                            </p>
                          )}
                          {pos.summary && (
                            <p className="mt-2 text-base leading-relaxed text-slate-600">{pos.summary}</p>
                          )}
                          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div>
                              <dt className="text-slate-400">城市</dt>
                              <dd className="font-medium text-slate-700">
                                {pos.cities_unlimited
                                  ? "不限"
                                  : pos.cities.length > 0
                                    ? pos.cities.join("、")
                                    : "未指定"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-slate-400">薪资</dt>
                              <dd className="font-medium text-slate-700">{formatSalary(pos)}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-400">性质与待遇</dt>
                              <dd className="font-medium text-slate-700">{formatBenefitsSummary(pos)}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-400">公司与行业</dt>
                              <dd className="font-medium text-slate-700">{formatCompanySummary(pos)}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-400">话术</dt>
                              <dd className="font-medium text-slate-700">
                                {pos.greeting_style} · 每日 {pos.daily_limit} 封
                              </dd>
                            </div>
                            {pos.include_keywords.length > 0 && (
                              <div>
                                <dt className="text-slate-400">包含</dt>
                                <dd className="font-medium text-slate-700">{pos.include_keywords.join("、")}</dd>
                              </div>
                            )}
                            {pos.exclude_keywords.length > 0 && (
                              <div className="col-span-2">
                                <dt className="text-slate-400">排除</dt>
                                <dd className="font-medium text-slate-700">{pos.exclude_keywords.join("、")}</dd>
                              </div>
                            )}
                          </dl>
                          {pos.keywords.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {pos.keywords.map((kw) => (
                                <span key={kw} className="rounded-md bg-blue-50 px-2.5 py-1 text-sm text-blue-700">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2.5">
                      <button
                        type="button"
                        disabled={index === 0 || saving}
                        className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        onClick={() => move(index, -1)}
                      >
                        ↑ 上移
                      </button>
                      <button
                        type="button"
                        disabled={index === positions.length - 1 || saving}
                        className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        onClick={() => move(index, 1)}
                      >
                        ↓ 下移
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-30"
                        onClick={() => remove(pos.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：添加 / 编辑 */}
      <div className="flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {draft.isNew ? "添加目标岗位" : `编辑：${draft.title || "未命名"}`}
            </h3>
            <p className="text-sm text-slate-500">岗位信息、筛选条件与话术设置</p>
          </div>
          {!draft.isNew && (
            <button type="button" className="btn-secondary" onClick={openAdd}>
              + 新建岗位
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            <div>
              <label className="label">快速选择岗位</label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                {PRESET_JOB_TITLES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => pickPreset(t)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                      draft.title === t
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-300 bg-white hover:border-blue-400"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <label className="label">岗位主名称 *</label>
                <input
                  className="input text-base"
                  value={draft.title}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  placeholder="如：售前工程师"
                />
                <p className="mt-1 text-xs text-slate-500">你在找的核心岗位，用于展示和优先匹配</p>
              </div>
              <div>
                <label className="label">同类岗位名称（别名）</label>
                <input
                  className="input text-base"
                  value={aliasesText}
                  onChange={(e) => setAliasesText(e.target.value)}
                  placeholder="售前解决方案，售前顾问，解决方案工程师"
                />
                <p className="mt-1 text-xs text-slate-500">
                  BOSS 上同一类岗位可能有多种叫法，用逗号分隔；会参与标题匹配
                </p>
              </div>
              <div>
                <label className="label">简介</label>
                <textarea
                  className="input min-h-[100px] text-base"
                  value={draft.summary}
                  onChange={(e) => updateDraft({ summary: e.target.value })}
                  placeholder="一句话描述求职方向"
                />
              </div>
              <div>
                <label className="label">期望工作内容</label>
                <textarea
                  className="input min-h-[100px] text-base"
                  value={draft.details}
                  onChange={(e) => updateDraft({ details: e.target.value })}
                  placeholder="期望技术栈、行业、工作内容偏好等"
                />
              </div>
              <div className="lg:col-span-2">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="label mb-0">岗位匹配关键词</label>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={suggesting || !draft.title.trim()}
                    onClick={handleSuggestKeywords}
                  >
                    {suggesting ? "生成中…" : "根据岗位名称智能生成"}
                  </button>
                </div>
                <input
                  className="input text-base"
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="售前，解决方案，B端（可点击上方按钮自动生成）"
                />
                <p className="mt-1 text-xs text-slate-500">
                  用于在岗位标题和 JD 中检索匹配；智能生成会同时补充「同类岗位名称」和关键词
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-5">
              <h4 className="mb-4 text-base font-semibold text-slate-900">筛选条件</h4>
              <div className="space-y-5">
                <div>
                  <label className="label">目标城市</label>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCitiesUnlimited(true)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                        draft.cities_unlimited
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-300 bg-white hover:border-blue-400"
                      }`}
                    >
                      不限
                    </button>
                    <button
                      type="button"
                      onClick={() => setCitiesUnlimited(false)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                        !draft.cities_unlimited
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-300 bg-white hover:border-blue-400"
                      }`}
                    >
                      指定城市
                    </button>
                  </div>
                  {!draft.cities_unlimited && (
                    <MultiChipSelect
                      label=""
                      value={draft.cities}
                      onChange={(cities) => updateDraft({ cities, cities_unlimited: false })}
                      presets={PRESET_CITIES}
                      placeholder="自定义城市"
                    />
                  )}
                  {draft.cities_unlimited && (
                    <p className="text-xs text-slate-500">不限制工作城市，待遇分中不按城市扣分</p>
                  )}
                </div>

                <div>
                  <label className="label">岗位性质（可多选，不选表示不限）</label>
                  <div className="flex flex-wrap gap-2">
                    {JOB_TYPE_PRESETS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleJobType(t)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                          draft.job_types.includes(t)
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-white hover:border-blue-400"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="label">薪资类型（可同时启用月薪与日薪）</label>
                  <div className="flex flex-wrap gap-6 text-sm">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.salary_type_monthly !== false}
                        onChange={(e) => updateDraft({ salary_type_monthly: e.target.checked })}
                      />
                      月薪（K/月）
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.salary_type_daily}
                        onChange={(e) => updateDraft({ salary_type_daily: e.target.checked })}
                      />
                      日薪（元/天，实习岗常用）
                    </label>
                  </div>
                </div>

                {draft.salary_type_monthly !== false && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="label">最低月薪</label>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="minSalary"
                            checked={draft.min_salary_unlimited}
                            onChange={() => updateDraft({ min_salary_unlimited: true })}
                          />
                          不限
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="minSalary"
                            checked={!draft.min_salary_unlimited}
                            onChange={() =>
                              updateDraft({ min_salary_unlimited: false, min_salary: draft.min_salary || 10 })
                            }
                          />
                          不低于
                        </label>
                        {!draft.min_salary_unlimited && (
                          <div className="flex items-center gap-2">
                            <input
                              className="input w-32"
                              type="number"
                              min={1}
                              value={draft.min_salary || ""}
                              onChange={(e) => updateDraft({ min_salary: Number(e.target.value) })}
                            />
                            <span className="text-slate-500">K / 月</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="label">最高月薪</label>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="maxSalary"
                            checked={draft.max_salary_unlimited}
                            onChange={() => updateDraft({ max_salary_unlimited: true })}
                          />
                          不设上限
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="maxSalary"
                            checked={!draft.max_salary_unlimited}
                            onChange={() =>
                              updateDraft({ max_salary_unlimited: false, max_salary: draft.max_salary || 30 })
                            }
                          />
                          不高于
                        </label>
                        {!draft.max_salary_unlimited && (
                          <div className="flex items-center gap-2">
                            <input
                              className="input w-32"
                              type="number"
                              min={1}
                              value={draft.max_salary || ""}
                              onChange={(e) => updateDraft({ max_salary: Number(e.target.value) })}
                            />
                            <span className="text-slate-500">K / 月</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {draft.salary_type_daily && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="label">最低日薪</label>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="minDailySalary"
                            checked={draft.min_daily_salary_unlimited}
                            onChange={() => updateDraft({ min_daily_salary_unlimited: true })}
                          />
                          不限
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="minDailySalary"
                            checked={!draft.min_daily_salary_unlimited}
                            onChange={() =>
                              updateDraft({
                                min_daily_salary_unlimited: false,
                                min_daily_salary: draft.min_daily_salary || 150,
                              })
                            }
                          />
                          不低于
                        </label>
                        {!draft.min_daily_salary_unlimited && (
                          <div className="flex items-center gap-2">
                            <input
                              className="input w-32"
                              type="number"
                              min={1}
                              value={draft.min_daily_salary || ""}
                              onChange={(e) => updateDraft({ min_daily_salary: Number(e.target.value) })}
                            />
                            <span className="text-slate-500">元 / 天</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="label">最高日薪</label>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="maxDailySalary"
                            checked={draft.max_daily_salary_unlimited}
                            onChange={() => updateDraft({ max_daily_salary_unlimited: true })}
                          />
                          不设上限
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="maxDailySalary"
                            checked={!draft.max_daily_salary_unlimited}
                            onChange={() =>
                              updateDraft({
                                max_daily_salary_unlimited: false,
                                max_daily_salary: draft.max_daily_salary || 400,
                              })
                            }
                          />
                          不高于
                        </label>
                        {!draft.max_daily_salary_unlimited && (
                          <div className="flex items-center gap-2">
                            <input
                              className="input w-32"
                              type="number"
                              min={1}
                              value={draft.max_daily_salary || ""}
                              onChange={(e) => updateDraft({ max_daily_salary: Number(e.target.value) })}
                            />
                            <span className="text-slate-500">元 / 天</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h5 className="mb-3 text-sm font-semibold text-slate-800">待遇期望（影响待遇匹配分）</h5>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="label">休息制度</label>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="weekendRest"
                            checked={draft.weekend_rest === "any"}
                            onChange={() => updateDraft({ weekend_rest: "any" })}
                          />
                          不限
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="weekendRest"
                            checked={draft.weekend_rest === "double_rest"}
                            onChange={() => updateDraft({ weekend_rest: "double_rest" })}
                          />
                          必须双休
                        </label>
                      </div>
                    </div>
                    <div className="flex items-end">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.require_social_insurance}
                          onChange={(e) => updateDraft({ require_social_insurance: e.target.checked })}
                        />
                        要求五险一金
                      </label>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.want_year_end_bonus}
                        onChange={(e) => updateDraft({ want_year_end_bonus: e.target.checked })}
                      />
                      期望年终奖
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.want_commission}
                        onChange={(e) => updateDraft({ want_commission: e.target.checked })}
                      />
                      期望提成
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.want_meal_allowance}
                        onChange={(e) => updateDraft({ want_meal_allowance: e.target.checked })}
                      />
                      期望餐补
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.want_accommodation}
                        onChange={(e) => updateDraft({ want_accommodation: e.target.checked })}
                      />
                      期望包住宿
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h5 className="mb-3 text-sm font-semibold text-slate-800">公司与行业（影响公司匹配分）</h5>
                  <div className="space-y-4">
                    <div>
                      <label className="label">期望公司规模</label>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setCompanySizesUnlimited(true)}
                          className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                            draft.company_sizes_unlimited
                              ? "border-amber-500 bg-amber-50 text-amber-800"
                              : "border-slate-300 bg-white hover:border-amber-400"
                          }`}
                        >
                          不限
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompanySizesUnlimited(false)}
                          className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                            !draft.company_sizes_unlimited
                              ? "border-amber-500 bg-amber-50 text-amber-800"
                              : "border-slate-300 bg-white hover:border-amber-400"
                          }`}
                        >
                          指定规模
                        </button>
                      </div>
                      {!draft.company_sizes_unlimited && (
                        <div className="flex flex-wrap gap-2">
                          {COMPANY_SIZE_PRESETS.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => toggleCompanySize(s)}
                              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                draft.preferred_company_sizes.includes(s)
                                  ? "border-amber-500 bg-amber-50 text-amber-800"
                                  : "border-slate-300 bg-white hover:border-amber-400"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      {draft.company_sizes_unlimited && (
                        <p className="text-xs text-slate-500">不限制公司规模，公司分中不按规模扣分</p>
                      )}
                    </div>
                    <div>
                      <label className="label">期望行业</label>
                      <input
                        className="input"
                        value={industryText}
                        onChange={(e) => setIndustryText(e.target.value)}
                        placeholder="互联网，软件，新能源"
                      />
                    </div>
                    <div>
                      <label className="label">行业前景偏好（可多选）</label>
                      <div className="mb-2 flex flex-wrap gap-2">
                        {OUTLOOK_PRESETS.map((o) => (
                          <button
                            key={o}
                            type="button"
                            onClick={() => toggleOutlook(o)}
                            className={`rounded-full border px-3 py-1.5 text-sm transition ${
                              parseList(outlookText).includes(o)
                                ? "border-amber-500 bg-amber-50 text-amber-800"
                                : "border-slate-300 bg-white hover:border-amber-400"
                            }`}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                      <input
                        className="input"
                        value={outlookText}
                        onChange={(e) => setOutlookText(e.target.value)}
                        placeholder="可自定义前景行业关键词"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <label className="label">必须包含关键词</label>
                    <input
                      className="input"
                      value={includeText}
                      onChange={(e) => setIncludeText(e.target.value)}
                      placeholder="React，TypeScript"
                    />
                  </div>
                  <div>
                    <label className="label">排除关键词</label>
                    <input
                      className="input"
                      value={excludeText}
                      onChange={(e) => setExcludeText(e.target.value)}
                      placeholder="外包，驻场"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-5">
              <h4 className="mb-4 text-base font-semibold text-slate-900">话术设置</h4>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <label className="label">话术风格</label>
                  <select
                    className="input"
                    value={draft.greeting_style}
                    onChange={(e) => updateDraft({ greeting_style: e.target.value })}
                  >
                    <option value="简洁">简洁</option>
                    <option value="正式">正式</option>
                    <option value="热情">热情</option>
                  </select>
                </div>
                <div>
                  <label className="label">每日沟通上限</label>
                  <input
                    className="input"
                    type="number"
                    value={draft.daily_limit}
                    onChange={(e) => updateDraft({ daily_limit: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            className="btn-primary px-6"
            onClick={handleSave}
            disabled={saving || !draft.title.trim()}
          >
            {saving ? "保存中..." : draft.isNew ? "添加并保存" : "保存修改"}
          </button>
          {draft.isNew ? (
            <button type="button" className="btn-secondary" onClick={openAdd}>
              清空表单
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={openAdd}>
              取消编辑
            </button>
          )}
          {message && <span className="text-sm text-green-600">{message}</span>}
        </div>
      </div>
    </div>
  );
}
