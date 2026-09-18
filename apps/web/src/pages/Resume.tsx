import { useEffect, useState } from "react";

import { api, Resume, ResumeContent, ResumeTemplate } from "../api/client";

import ResumeEditor, { COMPREHENSIVE_HINTS } from "../components/ResumeEditor";



const EMPTY_CONTENT: ResumeContent = {

  full_name: "",

  phone: "",

  email: "",

  summary: "",

  education: "",

  experience: "",

  projects: "",

  skills: [],

};



function contentFromResume(resume: Resume): ResumeContent {

  const p = resume.parsed_json;

  const skills = Array.isArray(p.skills) ? (p.skills as string[]) : [];

  return {

    full_name: String(p.full_name || ""),

    phone: String(p.phone || ""),

    email: String(p.email || ""),

    summary: String(p.summary || ""),

    education: String(p.education || ""),

    experience: String(p.experience || ""),

    projects: String(p.projects || ""),

    skills,

    template_id: String(p.template_id || ""),

  };

}



function applyComprehensiveStructure(form: ResumeContent): ResumeContent {

  const next = { ...form, template_id: "comprehensive" };

  (["summary", "education", "experience", "projects"] as const).forEach((key) => {

    if (!(next[key] || "").trim()) {

      next[key] = COMPREHENSIVE_HINTS[key];

    }

  });

  return next;

}



export default function ResumePage() {

  const [resumes, setResumes] = useState<Resume[]>([]);

  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);

  const [uploading, setUploading] = useState(false);

  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState<ResumeContent>(EMPTY_CONTENT);

  const [saving, setSaving] = useState(false);

  const [optimizing, setOptimizing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = () => api.listResumes().then(setResumes);

  useEffect(() => {

    load();

    api.listResumeTemplates().then(setTemplates).catch(() => {});

  }, []);



  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0];

    if (!file) return;

    setUploading(true);

    try {

      const created = await api.uploadResume(file);

      await load();

      openEditor(created);

    } catch (err) {

      alert(err instanceof Error ? err.message : "上传失败");

    } finally {

      setUploading(false);

      e.target.value = "";

    }

  };



  const handleCreateFromTemplate = async (templateId: string) => {

    const name = window.prompt("简历名称", "我的简历");

    if (name === null) return;

    setCreating(true);

    try {

      const created = await api.createResumeFromTemplate({

        template_id: templateId,

        name: name || "我的简历",

      });

      await load();

      openEditor(created);

    } catch (err) {

      alert(err instanceof Error ? err.message : "创建失败");

    } finally {

      setCreating(false);

    }

  };



  const openEditor = (resume: Resume) => {

    setEditingId(resume.id);

    const content = contentFromResume(resume);

    const needsStructure =

      resume.parsed_json.source === "upload" &&

      !content.summary?.trim() &&

      !content.education?.trim() &&

      !content.experience?.trim() &&

      !content.projects?.trim();

    setForm(needsStructure ? applyComprehensiveStructure(content) : content);

  };



  const handleSetDefault = async (id: number) => {

    await api.setDefaultResume(id);

    await load();

  };



  const handleDelete = async (resume: Resume) => {

    const hint = resume.is_default ? "这是当前默认简历，删除后将自动指定另一份为默认。" : "";

    if (!window.confirm(`确定删除简历「${resume.name}」？${hint}`)) return;

    setDeletingId(resume.id);

    try {

      await api.deleteResume(resume.id);

      if (editingId === resume.id) {

        setEditingId(null);

        setForm(EMPTY_CONTENT);

      }

      await load();

    } catch (err) {

      alert(err instanceof Error ? err.message : "删除失败");

    } finally {

      setDeletingId(null);

    }

  };



  const handleSave = async () => {

    if (editingId == null) return;

    setSaving(true);

    try {

      const updated = await api.updateResumeContent(editingId, form);

      await load();

      setForm(contentFromResume(updated));

      alert("保存成功");

    } catch (err) {

      alert(err instanceof Error ? err.message : "保存失败");

    } finally {

      setSaving(false);

    }

  };



  const handleOptimize = async () => {

    if (editingId == null) return;

    if (!window.confirm("将调用 AI 优化当前简历内容，是否继续？")) return;

    setOptimizing(true);

    try {

      const updated = await api.optimizeResume(editingId);

      setForm(contentFromResume(updated));

      await load();

      alert("AI 优化完成");

    } catch (err) {

      alert(err instanceof Error ? err.message : "优化失败，请检查会员与 API 设置");

    } finally {

      setOptimizing(false);

    }

  };



  return (

    <div className="space-y-6">

      <div>

        <h2 className="text-2xl font-bold">简历管理</h2>

        <p className="text-slate-500">

          上传简历、从模板新建，或在线分段编辑；推荐优先使用「全面简历」模板

        </p>

      </div>



      <div className="card space-y-4">

        <p className="font-medium text-slate-800">从模板新建</p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

          {templates.map((tpl) => (

            <button

              key={tpl.id}

              type="button"

              disabled={creating}

              onClick={() => handleCreateFromTemplate(tpl.id)}

              className={`rounded-lg border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 ${

                tpl.id === "comprehensive"

                  ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200"

                  : "border-slate-200 bg-slate-50"

              }`}

            >

              <p className="font-semibold text-slate-900">

                {tpl.name}

                {tpl.id === "comprehensive" && (

                  <span className="ml-2 rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white">推荐</span>

                )}

              </p>

              <p className="mt-1 text-xs text-slate-500">{tpl.description}</p>

            </button>

          ))}

        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">

          <label className="btn-primary cursor-pointer">

            {uploading ? "上传中..." : "上传简历"}

            <input

              type="file"

              accept=".pdf,.doc,.docx"

              className="hidden"

              disabled={uploading}

              onChange={handleUpload}

            />

          </label>

          <p className="text-xs text-slate-500">支持 .pdf / .docx，上传后可按全面简历结构在线编辑</p>

        </div>

      </div>



      {editingId != null && (

        <ResumeEditor

          form={form}

          saving={saving}

          optimizing={optimizing}

          onChange={setForm}

          onSave={handleSave}

          onOptimize={handleOptimize}

          onClose={() => setEditingId(null)}

          onApplyStructure={() => setForm((prev) => applyComprehensiveStructure(prev))}

        />

      )}



      {resumes.length === 0 ? (

        <div className="card text-slate-500">还没有简历，请上传或从模板新建</div>

      ) : (

        <div className="space-y-3">

          {resumes.map((r) => (

            <div key={r.id} className="card">

              <div className="flex flex-wrap items-start justify-between gap-4">

                <div>

                  <p className="font-semibold">

                    {r.name}{" "}

                    {r.is_default && <span className="badge bg-blue-100 text-blue-800">默认</span>}

                    {!!r.parsed_json.ai_optimized && (

                      <span className="badge ml-1 bg-emerald-100 text-emerald-800">已 AI 优化</span>

                    )}

                  </p>

                  <p className="mt-1 text-xs text-slate-500">

                    {r.parsed_json.source === "template"

                      ? `模板创建 · ${String(r.parsed_json.template_id || "未知")}`

                      : r.parsed_json.source === "upload"

                        ? "文件上传"

                        : "在线编辑"}{" "}

                    · {new Date(r.created_at).toLocaleString()}

                    {r.parsed_json.parse_method === "baidu_ocr" && (

                      <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">

                        百度OCR

                      </span>

                    )}

                  </p>

                </div>

                <div className="flex flex-wrap gap-2">

                  <button className="btn-secondary" onClick={() => openEditor(r)}>

                    编辑

                  </button>

                  {!r.is_default && (

                    <button className="btn-secondary" onClick={() => handleSetDefault(r.id)}>

                      设为默认

                    </button>

                  )}

                  <button
                    className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    disabled={deletingId === r.id}
                    onClick={() => handleDelete(r)}
                  >
                    {deletingId === r.id ? "删除中..." : "删除"}
                  </button>

                </div>

              </div>

              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">

                <div>

                  <p className="font-medium text-slate-700">技能</p>

                  <p className="mt-1 text-slate-600">

                    {((r.parsed_json.skills as string[]) || []).join("、") || "未填写"}

                  </p>

                </div>

                <div>

                  <p className="font-medium text-slate-700">经历摘要</p>

                  <p className="mt-1 line-clamp-3 text-slate-600">

                    {String(r.parsed_json.experience || r.parsed_json.summary || "暂无")}

                  </p>

                </div>

              </div>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}

