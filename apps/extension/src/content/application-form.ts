import { ensureAuthToken } from "../shared/authToken";

type ApplicationProfile = {
  full_name: string;
  phone: string;
  email: string;
  gender: string;
  birth_date: string;
  current_city: string;
  target_city: string;
  native_place: string;
  school: string;
  major: string;
  discipline_category: string;
  degree: string;
  graduation_date: string;
  work_years: string;
  expected_salary: string;
  recruitment_source: string;
  portfolio_url: string;
  github_url: string;
  linkedin_url: string;
  summary: string;
  education: string;
  experience: string;
  projects: string;
  awards: string;
  language_ability: string;
  certificates: string;
  campus_experience: string;
  skills: string[];
  resume_name?: string;
  has_uploadable_resume?: boolean;
  resume_file_url?: string | null;
  custom_fields: Record<string, string>;
  effective_custom_fields?: Record<string, string>;
};

type FillResult = {
  loginRequired: boolean;
  filled: number;
  uploaded: boolean;
  filledFields: string[];
  requiredEmpty: string[];
  actionFound: boolean;
  actionText: string;
  advanced: boolean;
  submitted: boolean;
  message: string;
};

const API_BASE = "http://127.0.0.1:8000";

function visible(element: Element): boolean {
  const node = element as HTMLElement;
  const style = window.getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
}

function pageText(): string {
  return (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 12000);
}

function loginRequired(): boolean {
  const url = location.href.toLowerCase();
  if (/\/(login|signin|passport|auth)(\/|\?|#|$)/.test(url)) return true;
  const password = Array.from(document.querySelectorAll('input[type="password"]')).find(visible);
  if (password) return true;
  const text = pageText();
  const strongSignals = ["登录后投递", "请先登录", "登录后申请", "登录账号后继续", "扫码登录"];
  return strongSignals.some((signal) => text.includes(signal));
}

const CONTROL_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
  ".ant-select-selector",
  ".el-select",
].join(",");

function queryAllDeep(selector: string, root: Document | ShadowRoot = document): Element[] {
  const found = Array.from(root.querySelectorAll(selector));
  for (const host of Array.from(root.querySelectorAll("*"))) {
    if (host.shadowRoot) found.push(...queryAllDeep(selector, host.shadowRoot));
  }
  return found;
}

function labelledByText(element: Element): string {
  return (element.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent || "")
    .join(" ");
}

function associatedLabel(element: Element): string {
  const id = element.getAttribute("id");
  const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  const parentLabel = element.closest("label");
  const container = element.closest(
    ".form-item,.form-group,.ant-form-item,.el-form-item,[class*='formItem'],[class*='field']",
  );
  return [
    explicit?.textContent,
    parentLabel?.textContent,
    container?.querySelector("label")?.textContent,
    container?.querySelector("[class*='label']")?.textContent,
  ]
    .filter(Boolean)
    .join(" ");
}

function descriptor(element: HTMLElement): string {
  return [
    element.getAttribute("name"),
    element.id,
    element.getAttribute("placeholder"),
    element.getAttribute("aria-label"),
    element.getAttribute("autocomplete"),
    element.getAttribute("title"),
    labelledByText(element),
    associatedLabel(element),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

type FieldSignal = { text: string; weight: number; source: string };

function fieldSignals(element: HTMLElement): FieldSignal[] {
  const values: Array<[string, string | null | undefined, number]> = [
    ["explicit-label", associatedLabel(element), 1],
    ["aria-label", element.getAttribute("aria-label"), 1],
    ["aria-labelledby", labelledByText(element), 1],
    ["placeholder", element.getAttribute("placeholder"), 0.92],
    ["title", element.getAttribute("title"), 0.88],
    ["name", element.getAttribute("name"), 0.72],
    ["id", element.id, 0.68],
    ["autocomplete", element.getAttribute("autocomplete"), 0.8],
    ["nearby-label", localFieldText(element), 0.9],
    ["visual-label", visualFieldLabel(element), 0.94],
  ];
  return values
    .map(([source, raw, weight]) => ({ source, text: cleanContextText(raw || "").toLowerCase(), weight }))
    .filter((item) => item.text.length > 0);
}

type MappingKey = keyof ApplicationProfile | "__age";
type Mapping = { key: MappingKey; patterns: RegExp[]; label: string };

const FIELD_MAPPINGS: Mapping[] = [
  { key: "full_name", label: "姓名", patterns: [/姓名|真实姓名|(^|[\s_-])full.?name([\s_-]|$)|(^|[\s_-])name([\s_-]|$)/] },
  { key: "phone", label: "手机号", patterns: [/手机|电话|联系电话|联系方式|mobile|phone|tel/] },
  { key: "email", label: "邮箱", patterns: [/邮箱|电子邮件|e-?mail/] },
  { key: "gender", label: "性别", patterns: [/性别|gender/] },
  { key: "birth_date", label: "出生日期", patterns: [/出生|生日|birth/] },
  { key: "__age", label: "年龄", patterns: [/^年龄$|age/] },
  { key: "target_city", label: "期望城市", patterns: [/期望.*(城市|地点)|意向.*(城市|地点)|preferred.*(city|location)/] },
  { key: "current_city", label: "当前城市", patterns: [/现居|当前.*(城市|地点)|所在.*(城市|地点)|current.*(city|location)/] },
  { key: "native_place", label: "籍贯", patterns: [/籍贯|户籍|native.?place|hometown/] },
  { key: "school", label: "学校", patterns: [/学校|院校|毕业院校|school|university|college/] },
  { key: "major", label: "专业", patterns: [/专业|major/] },
  { key: "discipline_category", label: "学科门类", patterns: [/学科门类|专业类别|discipline.?category/] },
  { key: "degree", label: "学历", patterns: [/学历|学位|degree|education.?level/] },
  { key: "graduation_date", label: "毕业时间", patterns: [/毕业.*(时间|日期|年份)|graduat/] },
  { key: "work_years", label: "工作年限", patterns: [/工作年限|经验年限|years?.*experience/] },
  { key: "expected_salary", label: "期望薪资", patterns: [/期望.*(薪资|工资)|expected.*salary/] },
  { key: "recruitment_source", label: "招聘渠道", patterns: [/招聘渠道|获知.*招聘|了解.*招聘|信息来源|recruitment.?source/] },
  { key: "github_url", label: "GitHub", patterns: [/github/] },
  { key: "linkedin_url", label: "LinkedIn", patterns: [/linkedin/] },
  { key: "portfolio_url", label: "作品集", patterns: [/作品集|个人网站|portfolio|website|homepage/] },
  { key: "summary", label: "个人优势", patterns: [/个人优势|自我评价|个人简介|个人总结|summary|profile|about.?me/] },
  { key: "education", label: "教育经历", patterns: [/教育经历|教育背景|education.?experience|education.?background/] },
  { key: "experience", label: "工作经历", patterns: [/工作经历|实习经历|工作经验|work.?experience|employment/] },
  { key: "projects", label: "项目经历", patterns: [/项目经历|项目经验|project.?experience|projects/] },
  { key: "awards", label: "获奖经历", patterns: [/获奖经历|荣誉奖项|奖项荣誉|竞赛获奖|奖项名称|荣誉名称|honou?rs?|awards?/] },
  { key: "language_ability", label: "语言能力", patterns: [/语言能力|外语能力|英语水平|英语等级|语言名称|外语名称|cet[-\s]?[46]|language.?proficiency|foreign.?language/] },
  { key: "certificates", label: "证书资质", patterns: [/资格证书|技能证书|证书资质|所获证书|证书名称|certificates?|qualifications?/] },
  { key: "campus_experience", label: "校园经历", patterns: [/校园经历|校内经历|学生工作|社团经历|campus.?experience/] },
  { key: "skills", label: "技能", patterns: [/技能|专业技能|skill|tech.?stack/] },
];

function profileValue(profile: ApplicationProfile, key: MappingKey): string {
  if (key === "__age") {
    const match = profile.birth_date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return "";
    const today = new Date();
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const age = today.getFullYear() - year - (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0);
    return age > 0 && age < 100 ? String(age) : "";
  }
  const raw = profile[key];
  return Array.isArray(raw) ? raw.join("、") : typeof raw === "string" ? raw : "";
}

function mappingFor(description: string, profile: ApplicationProfile): { value: string; label: string } | null {
  for (const [key, value] of Object.entries(profile.effective_custom_fields || profile.custom_fields || {})) {
    if (value && description.includes(key.toLowerCase())) return { value, label: key };
  }
  for (const mapping of FIELD_MAPPINGS) {
    if (mapping.key === "full_name" && /项目|公司|单位|学校|院校|project|company|school/.test(description)) continue;
    if (!mapping.patterns.some((pattern) => pattern.test(description))) continue;
    const value = profileValue(profile, mapping.key);
    if (value.trim()) return { value: value.trim(), label: mapping.label };
  }
  return null;
}

function mappingForElement(element: HTMLElement, profile: ApplicationProfile): { value: string; label: string } | null {
  const signals = fieldSignals(element);
  const hasDirectHumanLabel = Boolean(cleanContextText(
    associatedLabel(element)
    || element.getAttribute("aria-label")
    || labelledByText(element)
    || element.getAttribute("placeholder")
    || "",
  ));
  const eligibleSignals = hasDirectHumanLabel
    ? signals.filter((item) => ["explicit-label", "aria-label", "aria-labelledby", "placeholder", "title", "autocomplete"].includes(item.source))
    : signals;
  const section = visualSectionTitle(element).toLowerCase();
  const protectedKind = recordKind(element, signals.map((item) => item.text).join(" "));
  let best: { value: string; label: string; score: number } | null = null;

  for (const [key, value] of Object.entries(profile.effective_custom_fields || profile.custom_fields || {})) {
    if (!value || !key.trim()) continue;
    if (protectedKind && protectedKind !== "unknown" && sectionKindFromText(key) !== protectedKind) continue;
    const wanted = compactText(key);
    for (const signal of eligibleSignals) {
      const actual = compactText(signal.text);
      if (!actual) continue;
      const score = actual === wanted ? signal.weight : actual.includes(wanted) ? signal.weight * 0.88 : 0;
      if (score >= 0.78 && (!best || score > best.score)) best = { value, label: key, score };
    }
  }

  for (const mapping of FIELD_MAPPINGS) {
    const value = profileValue(profile, mapping.key).trim();
    if (!value) continue;
    const mappingKind = mappingKeySection(mapping.key);
    if (protectedKind && protectedKind !== "unknown" && mappingKind !== protectedKind) continue;
    for (const signal of eligibleSignals) {
      const genericName = mapping.key === "full_name" && /^(name|名称|title)$/i.test(signal.text.trim());
      if (genericName || (mapping.key === "full_name" && /项目|公司|单位|学校|院校|project|company|school/.test(section))) continue;
      if (!mapping.patterns.some((pattern) => pattern.test(signal.text))) continue;
      const exactBoost = mapping.patterns.some((pattern) => {
        pattern.lastIndex = 0;
        const match = signal.text.match(pattern)?.[0] || "";
        return compactText(match) === compactText(signal.text);
      }) ? 0.06 : 0;
      const score = Math.min(1, signal.weight + exactBoost);
      if (score >= 0.78 && (!best || score > best.score)) best = { value, label: mapping.label, score };
    }
  }
  return best ? { value: best.value, label: best.label } : null;
}

function realClick(element: HTMLElement) {
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const options = { bubbles: true, cancelable: true, view: window };
  element.dispatchEvent(new PointerEvent("pointerdown", options));
  element.dispatchEvent(new MouseEvent("mousedown", options));
  element.dispatchEvent(new PointerEvent("pointerup", options));
  element.dispatchEvent(new MouseEvent("mouseup", options));
  element.click();
}

function waitForDomChange(timeoutMs = 1200): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      window.setTimeout(resolve, 80);
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const timer = window.setTimeout(finish, timeoutMs);
  });
}

function dispatchValueEvents(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

function setTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  if (element.disabled || element.readOnly) return false;
  const oldValue = element.value;
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  const tracker = (element as HTMLInputElement & { _valueTracker?: { setValue: (next: string) => void } })._valueTracker;
  tracker?.setValue(oldValue);
  element.focus();
  dispatchValueEvents(element);
  return element.value.trim() === value.trim() || element.value.trim().length > 0;
}

function dateParts(value: string): { year: string; month: string; day: string } | null {
  const match = value.match(/(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/);
  if (!match) return null;
  return { year: match[1], month: match[2].padStart(2, "0"), day: (match[3] || "01").padStart(2, "0") };
}

function dateValueForElement(element: HTMLElement, value: string, description: string): string {
  const parts = dateParts(value);
  if (!parts) return value;
  const primaryHints = [
    associatedLabel(element),
    element.getAttribute("aria-label"),
    labelledByText(element),
    element.getAttribute("placeholder"),
    element.getAttribute("name"),
    element.id,
  ].filter(Boolean).join(" ");
  const hint = (primaryHints || description).toLowerCase();
  if (/(^|[^年月])年($|[^月])|year/.test(hint) && !/yyyy.?mm|年月/.test(hint)) return parts.year;
  if (/(^|[^年])月($|[^日])|month/.test(hint) && !/yyyy.?mm|年月/.test(hint)) return String(Number(parts.month));
  if (/(^|[^月])日($|[^期])|day/.test(hint)) return String(Number(parts.day));
  if (element instanceof HTMLInputElement && element.type === "date") return `${parts.year}-${parts.month}-${parts.day}`;
  if (element instanceof HTMLInputElement && element.type === "month") return `${parts.year}-${parts.month}`;
  if (/mm\s*[\/-]\s*yyyy/i.test(hint)) return `${parts.month}/${parts.year}`;
  if (/yyyy\s*[\/.]\s*mm/i.test(hint)) return /\//.test(hint) ? `${parts.year}/${parts.month}` : `${parts.year}.${parts.month}`;
  return `${parts.year}-${parts.month}`;
}

async function setSpinButtonValue(element: HTMLElement, value: string): Promise<boolean> {
  element.focus();
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
  for (const char of value) {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
    element.dispatchEvent(new InputEvent("input", { data: char, inputType: "insertText", bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
  }
  if (element instanceof HTMLInputElement) setTextValue(element, value);
  dispatchValueEvents(element);
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  const actual = element instanceof HTMLInputElement ? element.value : element.getAttribute("aria-valuenow") || element.getAttribute("aria-valuetext") || element.textContent || "";
  return compactText(actual).includes(compactText(value));
}

function setEditableValue(element: HTMLElement, value: string): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return setTextValue(element, value);
  }
  if (element.getAttribute("contenteditable") !== "true" && element.getAttribute("role") !== "textbox") return false;
  element.focus();
  element.textContent = value;
  element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: value }));
  dispatchValueEvents(element);
  return cleanContextText(element.textContent || "").length > 0;
}

function setSelectValue(element: HTMLSelectElement, value: string): boolean {
  if (element.disabled) return false;
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  const option = Array.from(element.options).find((item) => {
    const label = `${item.text} ${item.value}`.toLowerCase().replace(/\s+/g, "");
    return label === normalized || label.includes(normalized) || normalized.includes(label);
  });
  if (!option) return false;
  element.value = option.value;
  dispatchValueEvents(element);
  return true;
}

function optionText(element: Element): string {
  return compactText(`${element.getAttribute("data-value") || ""} ${element.getAttribute("value") || ""} ${element.textContent || ""}`);
}

async function setCustomChoiceValue(element: HTMLElement, value: string): Promise<boolean> {
  const wanted = compactText(value);
  if (!wanted || element.getAttribute("aria-disabled") === "true") return false;
  realClick(element);
  let option: HTMLElement | undefined;
  for (let attempt = 0; attempt < 8 && !option; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const options = queryAllDeep([
      "[role='option']",
      "[role='radio']",
      ".ant-select-item-option",
      ".el-select-dropdown__item",
      ".el-radio",
      ".ant-radio-wrapper",
    ].join(",")).filter(visible);
    const controlledId = element.getAttribute("aria-controls") || element.getAttribute("aria-owns");
    const controlled = controlledId ? document.getElementById(controlledId) : null;
    const scopedOptions = controlled
      ? Array.from(controlled.querySelectorAll<HTMLElement>("[role='option'],[role='radio'],.ant-select-item-option,.el-select-dropdown__item"))
      : options;
    option = scopedOptions.find((item) => {
      const text = optionText(item);
      return text === wanted || text.includes(wanted) || wanted.includes(text);
    }) as HTMLElement | undefined;
  }
  if (!option) {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }
  realClick(option);
  dispatchValueEvents(element);
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  const committed = compactText(`${element.textContent || ""} ${element.getAttribute("aria-valuetext") || ""} ${(element as HTMLInputElement).value || ""}`);
  return Boolean(committed) && (committed.includes(wanted) || wanted.includes(committed));
}

function elementCommittedText(element: HTMLElement): string {
  return cleanContextText([
    element instanceof HTMLInputElement ? element.value : "",
    element.getAttribute("aria-valuetext"),
    element.getAttribute("data-value"),
    element.textContent,
  ].filter(Boolean).join(" "));
}

function exactDateOption(element: HTMLElement, candidates: string[]): boolean {
  const text = cleanContextText(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.textContent || ""}`);
  const normalized = compactText(text);
  return candidates.some((candidate) => {
    const wanted = compactText(candidate);
    return normalized === wanted || (normalized.length <= wanted.length + 2 && normalized.includes(wanted));
  });
}

function datePickerOptions(): HTMLElement[] {
  return queryAllDeep([
    "[role='option']", "[role='gridcell']", "[role='button']", "button", "td", "li",
    ".ant-picker-cell", ".ant-picker-header-view button", ".el-month-table td", ".el-year-table td",
    "[class*='year']", "[class*='month']",
  ].join(","))
    .filter((item): item is HTMLElement => item instanceof HTMLElement && visible(item))
    .filter((item) => cleanContextText(item.textContent || item.getAttribute("aria-label") || "").length <= 32);
}

async function clickDateOption(candidates: string[]): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const option = datePickerOptions()
      .filter((item) => exactDateOption(item, candidates))
      .sort((a, b) => {
        const aInteractive = a.matches("button,[role='button'],[role='option'],[role='gridcell'],td,li") ? 0 : 1;
        const bInteractive = b.matches("button,[role='button'],[role='option'],[role='gridcell'],td,li") ? 0 : 1;
        return aInteractive - bInteractive || (a.textContent || "").length - (b.textContent || "").length;
      })[0];
    if (option) {
      const changed = waitForDomChange(900);
      realClick(option);
      await changed;
      return true;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
  return false;
}

async function setCustomDateValue(element: HTMLElement, rawValue: string, description: string): Promise<boolean> {
  const parts = dateParts(rawValue);
  if (!parts) return false;
  const expected = dateValueForElement(element, rawValue, description);

  if (element instanceof HTMLInputElement && !element.disabled && !element.readOnly) {
    const oldReadOnly = element.readOnly;
    const oldValue = element.value;
    try {
      element.readOnly = false;
      setTextValue(element, expected);
    } finally {
      element.readOnly = oldReadOnly;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    if (compactText(element.value).includes(compactText(expected))) return true;
    if (element.value !== oldValue) setTextValue(element, oldValue);
  }

  const changed = waitForDomChange(1200);
  realClick(element);
  await changed;

  const combined = [
    `${parts.year}-${parts.month}`,
    `${parts.year}/${parts.month}`,
    `${parts.year}年${Number(parts.month)}月`,
    `${parts.year}年${parts.month}月`,
  ];
  if (await clickDateOption(combined)) {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    if (compactText(elementCommittedText(element)).includes(compactText(parts.year))) return true;
  }

  const visibleYearHeaders = datePickerOptions().filter((item) => /^(19|20)\d{2}年?$/.test(cleanContextText(item.textContent || "")));
  const targetYearVisible = visibleYearHeaders.some((item) => exactDateOption(item, [parts.year, `${parts.year}年`]));
  if (!targetYearVisible && visibleYearHeaders.length) {
    const header = visibleYearHeaders.find((item) => /header|view|switch|label/i.test(item.className || "")) || visibleYearHeaders[0];
    const headerChanged = waitForDomChange(900);
    realClick(header);
    await headerChanged;
  }
  await clickDateOption([parts.year, `${parts.year}年`]);
  await clickDateOption([
    `${Number(parts.month)}月`,
    `${parts.month}月`,
    parts.month,
    String(Number(parts.month)),
  ]);
  await new Promise((resolve) => window.setTimeout(resolve, 180));

  const committed = compactText(elementCommittedText(element));
  return Boolean(committed) && committed.includes(compactText(parts.year))
    && (committed.includes(parts.month) || committed.includes(String(Number(parts.month))));
}

async function setControlValue(element: HTMLElement, rawValue: string, description: string): Promise<boolean> {
  const value = dateValueForElement(element, rawValue, description);
  if (element.getAttribute("role") === "spinbutton") return setSpinButtonValue(element, value);
  if (element instanceof HTMLSelectElement) return setSelectValue(element, value);
  if (dateParts(rawValue) && (
    (element instanceof HTMLInputElement && (element.readOnly || /date|month|year|yyyy|mm|时间|日期|年月/.test(`${element.type} ${description}`)))
    || element.getAttribute("role") === "combobox"
  )) {
    const selected = await setCustomDateValue(element, rawValue, description);
    if (selected) return true;
  }
  if (
    element.getAttribute("role") === "combobox"
    || element.classList.contains("ant-select-selector")
    || element.classList.contains("el-select")
    || (element instanceof HTMLInputElement && element.readOnly)
  ) return setCustomChoiceValue(element, value);
  return setEditableValue(element, value);
}

function compactText(value: string): string {
  return value.toLowerCase().replace(/[\s：:、，,。·\/／_\-（）()]/g, "");
}

function cleanContextText(value: string): string {
  return value.replace(/[＊*]/g, "").replace(/\s+/g, " ").trim();
}

function localFieldText(element: Element): string {
  const parts: string[] = [];
  const add = (value: string | null | undefined) => {
    const text = cleanContextText(value || "");
    if (text.length >= 1 && text.length <= 80 && !parts.includes(text)) parts.push(text);
  };

  add(element.previousElementSibling?.textContent);
  add(element.parentElement?.previousElementSibling?.textContent);

  let current: Element | null = element.parentElement;
  for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
    add(current.previousElementSibling?.textContent);
    const controls = current.querySelectorAll(CONTROL_SELECTOR).length;
    const text = cleanContextText(current.textContent || "");
    if (controls === 1 && text.length <= 100) add(text);
    if (controls > 1 || text.length > 160) break;
  }
  return parts.join(" ");
}

function visualFieldLabel(element: HTMLElement): string {
  const controlRect = element.getBoundingClientRect();
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    "label,[class*='label'],[class*='Label'],[class*='title'],[class*='Title'],span,div",
  ));
  let bestText = "";
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate === element || candidate.contains(element) || element.contains(candidate) || !visible(candidate)) continue;
    if (candidate.querySelector(CONTROL_SELECTOR)) continue;
    const text = cleanContextText(candidate.textContent || "");
    if (!text || text.length > 30 || /[。！？；]/.test(text)) continue;
    const rect = candidate.getBoundingClientRect();
    const verticalCenterGap = Math.abs((rect.top + rect.bottom) / 2 - (controlRect.top + controlRect.bottom) / 2);
    const leftDistance = controlRect.left - rect.right;
    const aboveDistance = controlRect.top - rect.bottom;
    const isLeft = leftDistance >= -8 && leftDistance <= 320 && verticalCenterGap <= Math.max(48, controlRect.height);
    const horizontalOverlap = rect.right >= controlRect.left - 20 && rect.left <= controlRect.right + 20;
    const isAbove = aboveDistance >= -8 && aboveDistance <= 100 && horizontalOverlap;
    if (!isLeft && !isAbove) continue;
    const score = isLeft ? Math.max(0, leftDistance) + verticalCenterGap * 2 : Math.max(0, aboveDistance) + Math.abs(rect.left - controlRect.left);
    if (score < bestScore) {
      bestScore = score;
      bestText = text;
    }
  }
  return bestText;
}

function ancestorFieldTexts(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    const text = (current.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length >= 2 && text.length <= 240 && !parts.includes(text)) parts.push(text);
  }
  return parts.join(" ");
}

function fieldDescription(element: HTMLElement): string {
  return `${descriptor(element)} ${localFieldText(element)} ${visualFieldLabel(element)}`.replace(/\s+/g, " ").trim().toLowerCase();
}

type StructuredRecord = {
  name: string;
  role: string;
  start: string;
  end: string;
  link: string;
  description: string;
};

function customProfileValue(profile: ApplicationProfile, keys: string[]): string {
  const fields = profile.effective_custom_fields || profile.custom_fields || {};
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function roleTitle(profile: ApplicationProfile, kind: "experience" | "project"): string {
  const text = `${profile.resume_name || ""} ${customProfileValue(profile, ["岗位方向", "目标岗位"])}`;
  if (kind === "project") {
    if (/产品/.test(text)) return "项目组长 / 产品规划";
    if (/项目经理|项目助理/.test(text)) return "项目组长 / 项目管理";
    if (/售前|解决方案|fde/i.test(text)) return "项目组长 / 方案设计与交付";
    if (/销售|商务/.test(text)) return "项目组长 / 项目汇报";
    if (/ai/i.test(text)) return "项目组长 / AI应用开发";
    return "项目组长 / 全栈开发";
  }
  if (/产品/.test(text)) return "Java开发实习生（兼需求分析与产品协同）";
  if (/项目经理|项目助理/.test(text)) return "Java开发实习生（兼项目交付协同）";
  if (/售前|解决方案/.test(text)) return "Java开发实习生（兼技术方案与交付支持）";
  if (/fde/i.test(text)) return "Java开发实习生（兼客户部署与交付支持）";
  if (/销售|商务/.test(text)) return "Java开发实习生（兼客户沟通与方案支持）";
  if (/ai/i.test(text)) return "Java开发实习生（兼AI应用研发与交付）";
  if (/全栈/.test(text)) return "Java开发实习生（兼前端联调与交付）";
  return "Java开发实习生";
}

function structuredRecords(profile: ApplicationProfile): { experience: StructuredRecord; project: StructuredRecord } {
  const experienceText = customProfileValue(profile, ["实习经历", "工作经历", "实习内容", "工作内容"]) || profile.experience;
  const projectText = customProfileValue(profile, ["项目经历", "项目描述", "项目内容"]) || profile.projects;
  return {
    experience: {
      name: "中软国际",
      role: roleTitle(profile, "experience"),
      start: "2026-06",
      end: "",
      link: "",
      description: experienceText,
    },
    project: {
      name: "渔见智能平台",
      role: roleTitle(profile, "project"),
      start: "2026-03",
      end: "2026-06",
      link: profile.github_url || "https://github.com/wsp-666/yunyu",
      description: projectText,
    },
  };
}

type SectionKind = "experience" | "project" | "award" | "language" | "certificate" | "campus" | "unknown";

const SECTION_TITLE_PATTERN = /^(实习经历|工作经历|项目经历|项目经验|获奖经历|荣誉奖项|奖项荣誉|竞赛获奖|语言能力|外语能力|英语水平|证书资质|资格证书|技能证书|校园经历|校内经历|学生工作|社团经历)(\s*[（(]?\d+[)）]?)?$/i;

function sectionKindFromText(raw: string): SectionKind {
  const text = cleanContextText(raw).toLowerCase();
  if (/获奖经历|荣誉奖项|奖项荣誉|竞赛获奖|奖项名称|荣誉名称|honou?rs?|awards?/.test(text)) return "award";
  if (/语言能力|外语能力|英语水平|英语等级|语言名称|外语名称|language.?proficiency|foreign.?language|cet[-\s]?[46]/.test(text)) return "language";
  if (/证书资质|资格证书|技能证书|所获证书|证书名称|certificates?|qualifications?/.test(text)) return "certificate";
  if (/校园经历|校内经历|学生工作|社团经历|campus.?experience/.test(text)) return "campus";
  if (/项目经历|项目经验|项目名称|项目角色|项目链接|project.?(name|role|link|experience)/.test(text)) return "project";
  if (/实习经历|工作经历|公司名称|单位名称|实习岗位|工作岗位|work.?experience|employment/.test(text)) return "experience";
  return "unknown";
}

function mappingKeySection(key: MappingKey): SectionKind {
  if (key === "experience") return "experience";
  if (key === "projects") return "project";
  if (key === "awards") return "award";
  if (key === "language_ability") return "language";
  if (key === "certificates") return "certificate";
  if (key === "campus_experience") return "campus";
  return "unknown";
}

function visualSectionTitle(element: HTMLElement): string {
  const selector = "h1,h2,h3,h4,h5,h6,legend,button,[role='button'],[class*='section-title'],[class*='sectionTitle'],[class*='module-title'],[class*='block-title']";
  const targetTop = element.getBoundingClientRect().top;
  let current: HTMLElement | null = element.parentElement;
  for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
    const headings = Array.from(current.querySelectorAll<HTMLElement>(selector))
      .filter(visible)
      .map((heading) => ({ top: heading.getBoundingClientRect().top, text: cleanContextText(heading.textContent || heading.getAttribute("aria-label") || "") }))
      .filter((item) => SECTION_TITLE_PATTERN.test(item.text) && item.top <= targetTop + 12)
      .sort((a, b) => b.top - a.top);
    const uniqueKinds = new Set(headings.map((item) => sectionKindFromText(item.text)).filter((kind) => kind !== "unknown"));
    if (uniqueKinds.size === 1 && headings[0]) return headings[0].text;
    if (uniqueKinds.size > 1) return "";
  }
  return "";
}

function recordKind(element: HTMLElement, _description: string): SectionKind {
  const primarySignals = [
    associatedLabel(element),
    element.getAttribute("aria-label"),
    labelledByText(element),
    element.getAttribute("placeholder"),
    element.getAttribute("name"),
    element.id,
  ];
  for (const signal of primarySignals) {
    const direct = sectionKindFromText(signal || "");
    if (direct !== "unknown") return direct;
  }
  const title = visualSectionTitle(element);
  return title ? sectionKindFromText(title) : "unknown";
}

function datePosition(element: HTMLElement): "start" | "end" {
  const primary = [
    associatedLabel(element),
    element.getAttribute("aria-label"),
    labelledByText(element),
    element.getAttribute("placeholder"),
    element.getAttribute("name"),
    element.id,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/开始|起始|start/.test(primary)) return "start";
  if (/结束|截止|end/.test(primary)) return "end";
  const rect = element.getBoundingClientRect();
  const peers = queryAllDeep("input,textarea,[role='textbox'],[role='combobox']")
    .filter((item): item is HTMLElement => item instanceof HTMLElement && visible(item))
    .filter((item) => {
      const peerRect = item.getBoundingClientRect();
      return Math.abs(peerRect.top - rect.top) < Math.max(12, rect.height / 2) && Math.abs(peerRect.height - rect.height) < 20;
    })
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  return peers.indexOf(element) > 0 ? "end" : "start";
}

function structuredMappingFor(
  element: HTMLElement,
  description: string,
  profile: ApplicationProfile,
): { value: string; label: string } | null {
  const kind = recordKind(element, description);
  if (kind !== "experience" && kind !== "project") return null;
  const record = structuredRecords(profile)[kind];
  const primary = [
    associatedLabel(element),
    element.getAttribute("aria-label"),
    labelledByText(element),
    element.getAttribute("placeholder"),
    element.getAttribute("name"),
    element.id,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/项目名称|项目名|project.?name/.test(primary) && kind === "project") return { value: record.name, label: "项目名称" };
  if (/公司名称|单位名称|公司|单位|company/.test(primary) && kind === "experience") return { value: record.name, label: "公司名称" };
  if (/项目角色|项目职位|担任角色|project.?role/.test(primary) && kind === "project") return { value: record.role, label: "项目角色" };
  if (/职位名称|岗位名称|实习岗位|工作岗位|职位|岗位|job.?title/.test(primary) && kind === "experience") return { value: record.role, label: "实习岗位" };
  if (/项目链接|项目地址|project.?(url|link)/.test(primary) && kind === "project") return { value: record.link, label: "项目链接" };
  if (/开始时间|开始日期|起始时间|起止时间|yyyy|mm|年份|月份|(^|\s)年($|\s)|(^|\s)月($|\s)|start.?date/i.test(primary)) {
    const part = datePosition(element);
    const value = part === "start" ? record.start : record.end;
    return value ? { value, label: part === "start" ? "开始时间" : "结束时间" } : null;
  }
  if (/结束时间|结束日期|截止时间|end.?date/.test(primary)) return record.end ? { value: record.end, label: "结束时间" } : null;
  if (/描述|工作内容|实习内容|项目内容|项目职责|主要职责|description/.test(primary)) {
    return record.description ? { value: record.description, label: kind === "project" ? "项目描述" : "实习描述" } : null;
  }
  return null;
}

async function expandStructuredSections(profile: ApplicationProfile): Promise<number> {
  const records = structuredRecords(profile);
  if (!records.experience.description && !records.project.description) return 0;
  let clicked = 0;
  const headers = queryAllDeep("button,[role='button'],[aria-expanded],h1,h2,h3,h4,h5,[class*='title'],[class*='header']")
    .filter((item): item is HTMLElement => item instanceof HTMLElement && visible(item));
  for (const header of headers) {
    const text = cleanContextText(header.textContent || header.getAttribute("aria-label") || "");
    if (!/^(实习经历|工作经历|项目经历|项目经验)$/.test(text)) continue;
    const clickable = header.closest<HTMLElement>("button,[role='button'],[aria-expanded]");
    if (clickable && clickable.getAttribute("aria-expanded") !== "true") {
      const changed = waitForDomChange();
      realClick(clickable);
      await changed;
      clicked += 1;
    }
  }
  if (clicked) await new Promise((resolve) => window.setTimeout(resolve, 180));

  const ensureKind = async (kind: "experience" | "project") => {
    const controls = () => queryAllDeep(CONTROL_SELECTOR)
      .filter((item): item is HTMLElement => item instanceof HTMLElement && visible(item))
    const hasKind = () => controls().some((item) => recordKind(item, fieldDescription(item)) === kind);
    if (hasKind()) return;

    const kindPattern = kind === "experience" ? /实习经历|工作经历/ : /项目经历|项目经验/;
    const candidates = queryAllDeep("button,[role='button'],a,[class*='add'],[class*='Add'],div,span")
      .filter((item): item is HTMLElement => item instanceof HTMLElement && visible(item))
      .filter((item) => {
        const text = cleanContextText(item.textContent || item.getAttribute("aria-label") || "");
        if (!/^(\+\s*)?(添加|新增|新建|add)(实习经历|工作经历|项目经历|项目经验)?$/i.test(text)) return false;
        if (Array.from(item.children).some((child) => cleanContextText(child.textContent || "") === text)) return false;
        const context = `${text} ${visualSectionTitle(item)}`;
        return kindPattern.test(context);
      })
      .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
    const rawButton = candidates[0];
    const button = rawButton?.closest<HTMLElement>("button,[role='button'],a,[class*='add'],[class*='Add']") || rawButton;
    if (!button) return;
    const beforeCount = controls().length;
    const changed = waitForDomChange(1600);
    realClick(button);
    await changed;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (hasKind() || controls().length > beforeCount) {
        clicked += 1;
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  };
  if (records.experience.description) await ensureKind("experience");
  if (records.project.description) await ensureKind("project");
  if (clicked) await new Promise((resolve) => window.setTimeout(resolve, 300));
  return clicked;
}

function fillRadioGroups(profile: ApplicationProfile): { count: number; matched: number; labels: string[] } {
  const radios = queryAllDeep('input[type="radio"]')
    .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement)
    .filter((element) => visible(element) && !element.disabled);
  const groups = new Map<string, HTMLInputElement[]>();
  radios.forEach((radio, index) => {
    const key = radio.name || `unnamed-${index}`;
    groups.set(key, [...(groups.get(key) || []), radio]);
  });
  let count = 0;
  let matched = 0;
  const labels: string[] = [];
  for (const group of groups.values()) {
    const context = `${descriptor(group[0])} ${ancestorFieldTexts(group[0])}`.toLowerCase();
    const mapped = mappingFor(context, profile);
    if (!mapped) continue;
    matched += 1;
    const wanted = compactText(mapped.value);
    const option = group.find((radio) => {
      const optionText = compactText(`${radio.value} ${associatedLabel(radio)} ${radio.parentElement?.textContent || ""}`);
      return optionText === wanted || optionText.includes(wanted) || wanted.includes(optionText);
    });
    if (!option || option.checked) continue;
    option.click();
    dispatchValueEvents(option);
    count += 1;
    if (!labels.includes(mapped.label)) labels.push(mapped.label);
  }
  return { count, matched, labels };
}

function fillCustomRadios(profile: ApplicationProfile): { count: number; matched: number; labels: string[] } {
  const groups = queryAllDeep("[role='radiogroup']").filter(visible);
  let count = 0;
  let matched = 0;
  const labels: string[] = [];
  for (const group of groups) {
    const mapped = mappingFor(fieldDescription(group as HTMLElement), profile);
    if (!mapped) continue;
    matched += 1;
    const wanted = compactText(mapped.value);
    const options = Array.from(group.querySelectorAll<HTMLElement>("[role='radio'],.ant-radio-wrapper,.el-radio"));
    const option = options.find((item) => {
      const text = optionText(item);
      return text === wanted || text.includes(wanted) || wanted.includes(text);
    });
    if (!option || option.getAttribute("aria-checked") === "true" || option.classList.contains("is-checked")) continue;
    option.click();
    dispatchValueEvents(option);
    count += 1;
    if (!labels.includes(mapped.label)) labels.push(mapped.label);
  }
  return { count, matched, labels };
}

function fillOngoingExperience(): boolean {
  const candidates = queryAllDeep("input[type='checkbox'],[role='checkbox']")
    .filter((item): item is HTMLElement => item instanceof HTMLElement && visible(item));
  const checkbox = candidates.find((item) => {
    const context = `${fieldDescription(item)} ${visualSectionTitle(item)}`;
    return /至今|目前|仍在职|present|current/.test(context) && /实习经历|工作经历/.test(context);
  });
  if (!checkbox) return false;
  const checked = checkbox instanceof HTMLInputElement ? checkbox.checked : checkbox.getAttribute("aria-checked") === "true";
  if (checked) return false;
  checkbox.click();
  dispatchValueEvents(checkbox);
  return true;
}

async function uploadResume(profile: ApplicationProfile): Promise<boolean> {
  if (!profile.has_uploadable_resume || !profile.resume_file_url) return false;
  const input = queryAllDeep('input[type="file"]')
    .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement)
    .find(
    (element) => visible(element) && !element.disabled,
  );
  if (!input) return false;
  const token = await ensureAuthToken();
  const response = await fetch(`${API_BASE}${profile.resume_file_url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) return false;
  const blob = await response.blob();
  const filename = profile.resume_name || (blob.type === "application/pdf" ? "resume.pdf" : "resume.docx");
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  dispatchValueEvents(input);
  return Boolean(input.files?.length);
}

function requiredEmptyFields(): string[] {
  const labels = queryAllDeep("input[required],textarea[required],select[required],[aria-required='true']")
    .filter((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    .filter((element) => visible(element) && !element.disabled && element.type !== "hidden")
    .filter((element) => {
      if (element instanceof HTMLInputElement && element.type === "radio") {
        if (!element.name) return !element.checked;
        const group = queryAllDeep('input[type="radio"]')
          .filter((item): item is HTMLInputElement => item instanceof HTMLInputElement)
          .filter((item) => item.name === element.name);
        return !group.some((item) => item.checked);
      }
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        return !element.checked;
      }
      return !element.value?.trim();
    })
    .map((element) => associatedLabel(element) || element.getAttribute("placeholder") || element.name || "必填项");
  return [...new Set(labels)].slice(0, 10);
}

function findPrimaryAction(): HTMLElement | null {
  const candidates = queryAllDeep('button,input[type="submit"],input[type="button"],[role="button"],a')
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => visible(element) && !("disabled" in element && Boolean((element as HTMLButtonElement).disabled)));
  const score = (element: HTMLElement) => {
    const value = element instanceof HTMLInputElement ? element.value : "";
    const text = (element.textContent || value || element.getAttribute("aria-label") || "").trim();
    if (/登录|注册|搜索|查询|取消|返回|关闭/.test(text)) return -100;
    if (/提交申请|提交简历|确认投递|立即投递|申请职位|完成申请|submit application|apply now|finish/.test(text.toLowerCase())) return 100;
    if (/^(投递|申请|去投递|开始申请|应聘|apply)$/i.test(text)) return 90;
    if (/下一步|保存并下一步|继续|next|continue/.test(text.toLowerCase())) return 80;
    if (element instanceof HTMLInputElement && element.type === "submit") return 40;
    return 0;
  };
  return candidates.sort((a, b) => score(b) - score(a)).find((item) => score(item) > 0) || null;
}

function actionText(element: HTMLElement | null): string {
  const value = element instanceof HTMLInputElement ? element.value : "";
  return (element?.textContent || value || element?.getAttribute("aria-label") || "").trim();
}

function formFingerprint(): string {
  const controls = queryAllDeep(CONTROL_SELECTOR)
    .filter((item): item is HTMLElement => item instanceof HTMLElement && visible(item));
  return [location.href, document.title, controls.length, pageText().slice(-1200)].join("|");
}

function isNextAction(text: string): boolean {
  return /下一步|保存并下一步|继续|next|continue/i.test(text) && !/提交|投递|申请|finish|submit/i.test(text);
}

function isExplicitFinalAction(text: string): boolean {
  return /提交申请|提交简历|确认投递|立即投递|申请职位|完成申请|submit application|apply now|finish application/i.test(text);
}

function isApplicationEntryAction(text: string): boolean {
  return /^(投递|申请|去投递|开始申请|应聘|apply)$/i.test(text.trim());
}

function submissionConfirmation(): { confirmed: boolean; message: string } {
  const text = pageText();
  const url = location.href.toLowerCase();
  const signals = [
    "投递成功",
    "申请成功",
    "简历已投递",
    "感谢您的申请",
    "application submitted",
    "application received",
    "thank you for applying",
  ];
  const signal = signals.find((item) => text.toLowerCase().includes(item.toLowerCase()));
  const urlConfirmed = /success|confirmation|submitted|thank-you/.test(url);
  return {
    confirmed: Boolean(signal || urlConfirmed),
    message: signal ? `检测到成功提示：${signal}` : urlConfirmed ? "已进入提交成功页面" : "尚未检测到明确的提交成功提示",
  };
}

async function fillApplicationForm(profile: ApplicationProfile, autoSubmit: boolean, overwrite = false): Promise<FillResult> {
  if (loginRequired()) {
    return { loginRequired: true, filled: 0, uploaded: false, filledFields: [], requiredEmpty: [], actionFound: false, actionText: "", advanced: false, submitted: false, message: "检测到登录页面" };
  }

  let expandedSections = 0;
  let filled = 0;
  let matchedFields = 0;
  const filledFields: string[] = [];
  const processed = new WeakSet<HTMLElement>();
  for (let pass = 0; pass < 3; pass += 1) {
    expandedSections += await expandStructuredSections(profile);
    const elements = queryAllDeep(CONTROL_SELECTOR)
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => {
        if (!visible(element) || ("disabled" in element && Boolean((element as HTMLInputElement).disabled))) return false;
        if (element instanceof HTMLInputElement && ["hidden", "password", "submit", "button", "file", "checkbox", "radio"].includes(element.type)) return false;
        return true;
      });
    const plan: Array<{ element: HTMLElement; description: string; value: string; label: string }> = [];
    for (const element of elements) {
      if (processed.has(element)) continue;
      const currentValue = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
        ? element.value
        : element.getAttribute("aria-valuetext") || element.textContent || "";
      if (!overwrite && currentValue.trim()) continue;
      const desc = fieldDescription(element);
      if (/验证码|密码|搜索|关键词|职位搜索|captcha|password|search/.test(desc)) continue;
      const mapped = structuredMappingFor(element, desc, profile) || mappingForElement(element, profile);
      if (!mapped) continue;
      matchedFields += 1;
      plan.push({ element, description: desc, value: mapped.value, label: mapped.label });
    }
    let passFilled = 0;
    for (const item of plan) {
      const success = await setControlValue(item.element, item.value, item.description);
      if (success) {
        processed.add(item.element);
        passFilled += 1;
        filled += 1;
        if (!filledFields.includes(item.label)) filledFields.push(item.label);
      }
    }
    if (passFilled === 0 && pass > 0) break;
    await new Promise((resolve) => window.setTimeout(resolve, 160));
  }

  const radioResult = fillRadioGroups(profile);
  matchedFields += radioResult.matched;
  filled += radioResult.count;
  radioResult.labels.forEach((label) => {
    if (!filledFields.includes(label)) filledFields.push(label);
  });
  const customRadioResult = fillCustomRadios(profile);
  matchedFields += customRadioResult.matched;
  filled += customRadioResult.count;
  customRadioResult.labels.forEach((label) => {
    if (!filledFields.includes(label)) filledFields.push(label);
  });
  if (fillOngoingExperience()) {
    filled += 1;
    filledFields.push("实习结束时间：至今");
  }

  const uploaded = await uploadResume(profile).catch(() => false);
  const requiredEmpty = requiredEmptyFields();
  const action = findPrimaryAction();
  const text = actionText(action);
  let advanced = false;
  let submitted = false;

  if (action && requiredEmpty.length === 0) {
    if (isApplicationEntryAction(text) && matchedFields === 0) {
      const before = formFingerprint();
      const changed = waitForDomChange(1800);
      realClick(action);
      await changed;
      advanced = formFingerprint() !== before;
    } else if (isNextAction(text)) {
      const before = formFingerprint();
      const changed = waitForDomChange(1800);
      realClick(action);
      await changed;
      advanced = formFingerprint() !== before;
    } else if (autoSubmit && isExplicitFinalAction(text)) {
      realClick(action);
      submitted = true;
    }
  }

  const parts = [`已填写 ${filled} 个字段`];
  if (expandedSections) parts.push(`已展开或新增 ${expandedSections} 个经历区域`);
  if (uploaded) parts.push("已上传简历");
  if (requiredEmpty.length) parts.push(`仍有 ${requiredEmpty.length} 个必填项需确认`);
  if (advanced) parts.push(isApplicationEntryAction(text) ? "已进入简历填写页" : "已进入下一步");
  if (submitted) parts.push("已点击提交");
  if (!action) parts.push("未找到提交按钮");

  return {
    loginRequired: false,
    filled,
    uploaded,
    filledFields,
    requiredEmpty,
    actionFound: Boolean(action),
    actionText: text,
    advanced,
    submitted,
    message: parts.join("，"),
  };
}

declare global {
  interface Window {
    __jobAssistantApplicationFormVersion?: string;
  }
}

const APPLICATION_FORM_VERSION = "2.5.0";
if (window.__jobAssistantApplicationFormVersion !== APPLICATION_FORM_VERSION) {
  window.__jobAssistantApplicationFormVersion = APPLICATION_FORM_VERSION;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "APPLICATION_ANALYZE") {
      const profile = message.profile as ApplicationProfile | undefined;
      const fields = queryAllDeep(`${CONTROL_SELECTOR},[role='radiogroup']`)
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .filter(visible)
        .slice(0, 30)
        .map((element) => {
          const desc = fieldDescription(element);
          const mapped = profile ? structuredMappingFor(element, desc, profile) || mappingForElement(element, profile) : null;
          const value = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
            ? element.value
            : element.getAttribute("aria-valuetext") || "";
          return {
            type: element instanceof HTMLInputElement ? element.type || "text" : element.tagName.toLowerCase(),
            description: desc.slice(0, 180),
            matchedLabel: mapped?.label || "",
            hasValue: Boolean(value.trim()),
          };
        });
      sendResponse({
        loginRequired: loginRequired(),
        url: location.href,
        title: document.title,
        inputCount: queryAllDeep(`${CONTROL_SELECTOR},[role='radiogroup']`).filter(visible).length,
        fields,
      });
      return false;
    }
    if (message?.type === "APPLICATION_VERIFY_SUBMISSION") {
      sendResponse(submissionConfirmation());
      return false;
    }
    if (message?.type === "APPLICATION_FILL" && message.profile) {
      fillApplicationForm(message.profile as ApplicationProfile, Boolean(message.autoSubmit), Boolean(message.overwrite))
        .then(sendResponse)
        .catch((error) => sendResponse({
          loginRequired: false,
          filled: 0,
          uploaded: false,
          filledFields: [],
          requiredEmpty: [],
          actionFound: false,
          actionText: "",
          advanced: false,
          submitted: false,
          message: error instanceof Error ? error.message : "自动填写失败",
        }));
      return true;
    }
    return false;
  });
}
