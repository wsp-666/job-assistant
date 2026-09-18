import { useState } from "react";
import { ResumeContent } from "../api/client";

export const COMPREHENSIVE_HINTS: Record<string, string> = {
  summary:
    "【求职意向】\n期望岗位：\n期望城市：\n期望薪资：\n到岗时间：\n\n【个人优势】\n请用 3-5 句话概括你的核心亮点",
  education:
    "【教育经历】\n学校名称 | 专业 | 学历 | 起止时间\nGPA / 排名（选填）\n主修课程 / 荣誉（选填）",
  experience:
    "【工作 / 实习经历】\n公司名称 | 职位 | 起止时间\n工作职责：\n- \n工作成果（尽量量化）：\n- ",
  projects:
    "【项目经历】\n项目名称 | 担任角色 | 起止时间\n项目描述：\n- \n项目成果：\n- ",
};

const SECTION_FIELDS = [
  { key: "summary" as const, title: "求职意向 / 个人简介", rows: 6 },
  { key: "education" as const, title: "教育经历", rows: 5 },
  { key: "experience" as const, title: "工作 / 实习经历", rows: 7 },
  { key: "projects" as const, title: "项目经历", rows: 6 },
];

type Props = {
  form: ResumeContent;
  saving: boolean;
  optimizing: boolean;
  onChange: (next: ResumeContent) => void;
  onSave: () => void;
  onOptimize: () => void;
  onClose: () => void;
  onApplyStructure?: () => void;
};

function renderPreviewText(value: string | undefined, fallback: string) {
  const text = (value || "").trim();
  return text || fallback;
}

export default function ResumeEditor({
  form,
  saving,
  optimizing,
  onChange,
  onSave,
  onOptimize,
  onClose,
  onApplyStructure,
}: Props) {
  const [skillInput, setSkillInput] = useState("");

  const updateField = (key: keyof ResumeContent, value: string | string[]) => {
    onChange({ ...form, [key]: value });
  };

  const skills = form.skills || [];

  const addSkill = (raw: string) => {
    const token = raw.trim();
    if (!token || skills.includes(token)) return;
    updateField("skills", [...skills, token]);
  };

  const removeSkill = (skill: string) => {
    updateField(
      "skills",
      skills.filter((item) => item !== skill),
    );
  };

  return (
    <div className="card space-y-4 border-blue-200 bg-blue-50/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">在线编辑简历</h3>
          <p className="mt-0.5 text-xs text-slate-500">分段填写，右侧实时预览；结构与「全面简历」模板一致</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onApplyStructure && (
            <button type="button" className="btn-secondary" onClick={onApplyStructure}>
              套用全面简历结构
            </button>
          )}
          <button type="button" className="btn-secondary" disabled={optimizing} onClick={onOptimize}>
            {optimizing ? "AI 优化中..." : "AI 优化简历"}
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
            {saving ? "保存中..." : "保存"}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">基本信息</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">姓名</span>
                <input
                  className="input mt-1"
                  value={form.full_name || ""}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  placeholder="张三"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">手机</span>
                <input
                  className="input mt-1"
                  value={form.phone || ""}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="13800000000"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">邮箱</span>
                <input
                  className="input mt-1"
                  value={form.email || ""}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="name@example.com"
                />
              </label>
            </div>
          </div>

          {SECTION_FIELDS.map((section) => (
            <div key={section.key} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">{section.title}</p>
              <textarea
                className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm leading-relaxed"
                rows={section.rows}
                value={form[section.key] || ""}
                placeholder={COMPREHENSIVE_HINTS[section.key]}
                onChange={(e) => updateField(section.key, e.target.value)}
              />
            </div>
          ))}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-slate-800">技能标签</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                >
                  {skill}
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500"
                    onClick={() => removeSkill(skill)}
                    aria-label={`删除技能 ${skill}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="input flex-1"
                value={skillInput}
                placeholder="输入技能后回车添加"
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill(skillInput);
                    setSkillInput("");
                  }
                }}
              />
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={() => {
                  addSkill(skillInput);
                  setSkillInput("");
                }}
              >
                添加
              </button>
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-slate-400">实时预览</p>
            <div className="space-y-5 text-sm text-slate-800">
              <div className="border-b border-slate-100 pb-4 text-center">
                <h4 className="text-xl font-bold text-slate-900">
                  {renderPreviewText(form.full_name, "你的姓名")}
                </h4>
                <p className="mt-1 text-slate-500">
                  {[form.phone, form.email].filter(Boolean).join(" · ") || "手机 · 邮箱"}
                </p>
              </div>

              {SECTION_FIELDS.map((section) => {
                const text = (form[section.key] || "").trim();
                if (!text) return null;
                return (
                  <section key={section.key}>
                    <h5 className="mb-2 font-semibold text-slate-900">{section.title}</h5>
                    <pre className="whitespace-pre-wrap font-sans text-slate-700">{text}</pre>
                  </section>
                );
              })}

              {skills.length > 0 && (
                <section>
                  <h5 className="mb-2 font-semibold text-slate-900">技能</h5>
                  <p className="text-slate-700">{skills.join("、")}</p>
                </section>
              )}

              {!form.full_name &&
                !form.summary &&
                !form.education &&
                !form.experience &&
                !form.projects &&
                skills.length === 0 && (
                  <p className="text-center text-slate-400">左侧填写后，预览将在此实时更新</p>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
