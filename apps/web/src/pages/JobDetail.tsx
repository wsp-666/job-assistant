import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { api, Greeting, Job, JobRecommendations } from "../api/client";
import { isCareerPlatform, jobDetailPath } from "../utils/jobRoutes";

const GREETING_TEMPLATES = [
  { id: "first_contact", label: "首聊打招呼" },
  { id: "follow_up", label: "跟进话术" },
  { id: "thank_you", label: "感谢/收尾" },
  { id: "interview_confirm", label: "面试回复" },
] as const;

const TEMPLATE_LABELS: Record<string, string> = {
  default: "首聊",
  first_contact: "首聊",
  follow_up: "跟进",
  thank_you: "感谢",
  interview_confirm: "面试回复",
  technical: "技术向",
  career_switch: "转岗向",
};

const OFFER_OPTIONS = [
  { value: "none", label: "暂无" },
  { value: "pending", label: "等待中" },
  { value: "received", label: "已收到 Offer" },
  { value: "rejected", label: "已拒绝/未通过" },
] as const;

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm text-slate-700">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TailoredResumeView({ data }: { data: Record<string, unknown> }) {
  const skills = Array.isArray(data.skills) ? (data.skills as string[]) : [];
  const sections: { key: string; label: string }[] = [
    { key: "summary", label: "自我评价" },
    { key: "education", label: "教育经历" },
    { key: "experience", label: "工作经历" },
    { key: "projects", label: "项目经历" },
  ];
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {sections.map(({ key, label }) => {
        const val = data[key];
        if (!val || (typeof val === "string" && !val.trim())) return null;
        return (
          <div key={key}>
            <h4 className="mb-1 font-medium text-slate-800">{label}</h4>
            <p className="whitespace-pre-wrap">{String(val)}</p>
          </div>
        );
      })}
      {skills.length > 0 && (
        <div>
          <h4 className="mb-1 font-medium text-slate-800">技能</h4>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isCareerRoute = location.pathname.startsWith("/career-jobs/");
  const jobId = Number(id);
  const modifySectionRef = useRef<HTMLDivElement>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [greetings, setGreetings] = useState<Greeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState<string | null>(null);
  const [modifyInstruction, setModifyInstruction] = useState("");
  const [selectedGreetingId, setSelectedGreetingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<JobRecommendations | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState("first_contact");

  const selectedGreeting = greetings.find((g) => g.id === selectedGreetingId) ?? null;

  const load = async () => {
    setLoading(true);
    try {
      const j = await api.getJob(jobId);
      setJob(j);
      if (isCareerPlatform(j.platform)) {
        setGreetings([]);
        setSelectedGreetingId(null);
      } else {
        const g = await api.getGreetings(jobId);
        setGreetings(g);
        if (selectedGreetingId && !g.some((item) => item.id === selectedGreetingId)) {
          setSelectedGreetingId(null);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) load();
  }, [jobId]);

  useEffect(() => {
    if (!job) return;
    const correctPath = jobDetailPath(job);
    if (location.pathname !== correctPath) {
      navigate(correctPath, { replace: true });
    }
  }, [job, location.pathname, navigate]);

  const handleGenerate = async (templateId?: string) => {
    const tid = templateId ?? activeTemplate;
    setGenerating(true);
    setGeneratingTemplate(tid);
    try {
      const instruction = modifyInstruction.trim();
      const baseId =
        selectedGreetingId ?? (instruction && greetings[0] ? greetings[0].id : undefined);
      await api.generateGreeting(jobId, {
        template_id: tid,
        modify_instruction: instruction || undefined,
        base_greeting_id: baseId,
      });
      if (instruction) setModifyInstruction("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
      setGeneratingTemplate(null);
    }
  };

  const handleDelete = async (greetingId: number) => {
    if (!confirm("确定删除这条话术记录？")) return;
    setDeletingId(greetingId);
    try {
      await api.deleteGreeting(greetingId);
      if (selectedGreetingId === greetingId) setSelectedGreetingId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const handlePickGreeting = (greeting: Greeting) => {
    setSelectedGreetingId(greeting.id);
    modifySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleLoadRecommendations = async () => {
    setLoadingRec(true);
    try {
      const rec = await api.getJobRecommendations(jobId);
      setRecommendations(rec);
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成推荐失败");
    } finally {
      setLoadingRec(false);
    }
  };

  const handlePipelineChange = async (patch: {
    has_greeted?: boolean;
    has_applied_resume?: boolean;
    interview_round?: number;
    offer_status?: "none" | "pending" | "received" | "rejected";
  }) => {
    setSavingPipeline(true);
    try {
      const updated = await api.updateJobPipeline(jobId, patch);
      setJob(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingPipeline(false);
    }
  };

  const handleTailorResume = async () => {
    setTailoring(true);
    try {
      const result = await api.tailorResumeForJob(jobId);
      setJob((prev) => (prev ? { ...prev, tailored_resume: result.tailored_resume } : prev));
    } catch (e) {
      alert(e instanceof Error ? e.message : "定向改写失败");
    } finally {
      setTailoring(false);
    }
  };

  const handleStatus = async (status: string) => {
    await api.updateJobStatus(jobId, status);
    await load();
  };

  const handleDeleteJob = async () => {
    if (!job) return;
    const extra = isCareerPlatform(job.platform) ? "" : "相关话术记录也会一并删除。";
    if (!confirm(`确定删除岗位「${job.job_title}」？${extra}`)) return;
    setDeleting(true);
    try {
      await api.deleteJob(jobId);
      navigate(isCareerPlatform(job.platform) ? "/career-jobs" : "/jobs");
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <p>加载中...</p>;
  if (!job) return <p>岗位不存在</p>;

  const offerStatus = job.offer_status ?? "none";
  const interviewRound = job.interview_round ?? 0;
  const isCareer = isCareerRoute || isCareerPlatform(job.platform);
  const listPath = isCareer ? "/career-jobs" : "/jobs";

  return (
    <div className="space-y-5">
      <Link to={listPath} className="text-sm text-blue-600 hover:underline">
        ← 返回{isCareer ? "官网岗位" : "BOSS直聘岗位"}
      </Link>

      <div className="card">
        <h2 className="text-2xl font-bold">{job.job_title}</h2>
        <p className="mt-2 text-slate-600">
          {job.company} · {job.city} · {job.salary || "薪资面议"}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          职责匹配 {job.role_match_score ?? 0} · 待遇匹配 {job.benefits_match_score ?? 0} · 公司匹配{" "}
          {job.company_match_score ?? 0}
          {(job.company_industry || job.company_size) &&
            ` · ${[job.company_industry, job.company_size].filter(Boolean).join(" / ")}`}
          {!isCareer && (
            <>
              {" · HR: "}
              {job.hr_name || "未知"} {job.hr_title}
            </>
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => handleStatus("skipped")}>
            跳过
          </button>
          <button className="btn-secondary" onClick={() => api.rematchJob(jobId).then(load)}>
            重新匹配
          </button>
          <a className="btn-secondary" href={job.job_url} target="_blank" rel="noreferrer">
            {isCareer ? "打开官网岗位" : "打开 BOSS 岗位"}
          </a>
          <button
            className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            disabled={deleting}
            onClick={handleDeleteJob}
          >
            {deleting ? "删除中..." : "删除岗位"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold">投递进度</h3>
          {savingPipeline && <span className="text-xs text-slate-500">保存中…</span>}
        </div>
        <div className={`grid grid-cols-1 gap-4 ${isCareer ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
          {!isCareer && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={!!job.has_greeted}
                disabled={savingPipeline}
                onChange={(e) => handlePipelineChange({ has_greeted: e.target.checked })}
              />
              <span>已打招呼</span>
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={!!job.has_applied_resume}
              disabled={savingPipeline}
              onChange={(e) => handlePipelineChange({ has_applied_resume: e.target.checked })}
            />
            <span>已投递简历</span>
          </label>
          <div className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-slate-600">面试轮次</span>
            <select
              className="input py-1 text-sm"
              value={interviewRound}
              disabled={savingPipeline}
              onChange={(e) => handlePipelineChange({ interview_round: Number(e.target.value) })}
            >
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "未面试" : `第 ${i} 轮`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-slate-600">Offer</span>
            <select
              className="input py-1 text-sm"
              value={offerStatus}
              disabled={savingPipeline}
              onChange={(e) =>
                handlePipelineChange({
                  offer_status: e.target.value as "none" | "pending" | "received" | "rejected",
                })
              }
            >
              {OFFER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!isCareer && (
        <>
          <div className="card">
            <h3 className="mb-3 font-semibold">多轮话术</h3>
            <div className="flex flex-wrap gap-2">
              {GREETING_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={`rounded border px-3 py-1.5 text-sm transition ${
                    activeTemplate === tpl.id
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                  }`}
                  disabled={generating}
                  onClick={() => {
                    setActiveTemplate(tpl.id);
                    handleGenerate(tpl.id);
                  }}
                >
                  {generating && generatingTemplate === tpl.id ? "生成中…" : tpl.label}
                </button>
              ))}
            </div>
          </div>

          <div ref={modifySectionRef} className="card">
            {selectedGreeting && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/80 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-blue-700">
                    已提取的历史话术（
                    {TEMPLATE_LABELS[selectedGreeting.template_id] ?? selectedGreeting.template_id}）
                  </span>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-700"
                    onClick={() => setSelectedGreetingId(null)}
                  >
                    取消选择
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {selectedGreeting.content}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {new Date(selectedGreeting.created_at).toLocaleString()}
                </p>
              </div>
            )}

            <label className="label">修改想法（可选）</label>
            <textarea
              className="input min-h-[88px] text-sm"
              value={modifyInstruction}
              onChange={(e) => setModifyInstruction(e.target.value)}
              placeholder="例如：更简短一些；突出实习经历；语气更正式；不要提某个项目…"
            />
            <p className="mt-2 text-xs text-slate-500">
              选择上方话术类型生成，或填写修改意见后点击下方按钮基于历史话术重新生成。
            </p>
            <button
              className="btn-primary mt-3"
              onClick={() => handleGenerate()}
              disabled={generating}
            >
              {generating
                ? "生成中..."
                : modifyInstruction.trim() || selectedGreeting
                  ? "按想法重新生成"
                  : `生成${TEMPLATE_LABELS[activeTemplate] ?? "话术"}`}
            </button>
          </div>
        </>
      )}

      <div className={`grid grid-cols-1 gap-5 ${isCareer ? "" : "lg:grid-cols-2 lg:items-stretch"}`}>
        {!isCareer && (
          <div className="flex min-h-[520px] flex-col">
            <h3 className="mb-3 font-semibold">话术历史</h3>
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {greetings.length === 0 ? (
                <div className="card text-slate-500">暂无话术，点击上方按钮生成</div>
              ) : (
                greetings.map((g) => (
                  <div
                    key={g.id}
                    className={`card transition ${
                      selectedGreetingId === g.id ? "border-blue-300 ring-1 ring-blue-200" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                          {TEMPLATE_LABELS[g.template_id] ?? g.template_id}
                        </span>
                        <span>{new Date(g.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          title="提取到修改区"
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                          onClick={() => handlePickGreeting(g)}
                        >
                          ↑
                        </button>
                        <span>{g.is_sent ? "已发送" : "未发送"}</span>
                        <button
                          type="button"
                          className="text-red-600 hover:underline disabled:opacity-50"
                          disabled={deletingId === g.id}
                          onClick={() => handleDelete(g.id)}
                        >
                          {deletingId === g.id ? "删除中…" : "删除"}
                        </button>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{g.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className={`flex flex-col gap-4 ${isCareer ? "" : "min-h-[520px]"}`}>
          <div className="card flex min-h-0 flex-1 flex-col">
            <h3 className="font-semibold">岗位 JD</h3>
            <pre className="mt-3 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {job.jd_text || "暂无 JD 内容"}
            </pre>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="font-semibold">简历定向改写</h3>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={handleTailorResume}
                disabled={tailoring}
              >
                {tailoring ? "改写中…" : job.tailored_resume ? "重新改写" : "生成定向简历"}
              </button>
            </div>
            {!job.tailored_resume ? (
              <p className="text-sm text-slate-500">
                根据本岗位 JD 与默认简历，AI 将突出匹配经历与技能，生成一版定向改写内容（不修改原始简历）。
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <TailoredResumeView data={job.tailored_resume} />
              </div>
            )}
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="font-semibold">推荐功能</h3>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={handleLoadRecommendations}
                disabled={loadingRec}
              >
                {loadingRec ? "分析中…" : recommendations ? "重新分析" : "生成推荐"}
              </button>
            </div>

            {!recommendations ? (
              <p className="text-sm text-slate-500">
                {isCareer
                  ? "点击「生成推荐」，AI 将结合简历与 JD 分析投递注意事项、应关注的技能，以及岗位优缺点。"
                  : "点击「生成推荐」，AI 将结合简历与 JD 分析沟通注意事项、应关注的技能，以及岗位优缺点。"}
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 text-sm font-medium text-slate-800">
                    {isCareer ? "投递注意事项" : "聊天注意事项"}
                  </h4>
                  <BulletList items={recommendations.chat_tips} empty="暂无" />
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium text-slate-800">应关注的技能</h4>
                  <BulletList items={recommendations.focus_skills} empty="暂无" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-emerald-700">岗位优点</h4>
                    <BulletList items={recommendations.pros} empty="暂无" />
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-amber-700">岗位不足 / 风险</h4>
                    <BulletList items={recommendations.cons} empty="暂无" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
