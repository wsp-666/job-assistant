import { useCallback, useEffect, useState } from "react";

import {
  ADMIN_BASE,
  ApplicationProfile,
  getApplicationProfile,
  saveApplicationProfile,
} from "../shared/api";
import {
  analyzeCurrentApplicationPage,
  fillCurrentApplicationPage,
} from "./tabBridge";

type Props = {
  apiOk: boolean;
};

export default function ApplicationFormAssistant({ apiOk }: Props) {
  const [profile, setProfile] = useState<ApplicationProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<string[]>([]);

  const refreshProfile = useCallback(async () => {
    if (!apiOk) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await getApplicationProfile();
      setProfile(data);
      setMessage(data.answer_sets?.length ? "投递资料已读取" : "尚未同步岗位资料套装");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "投递资料读取失败");
    } finally {
      setLoading(false);
    }
  }, [apiOk]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const selectAnswerSet = async (id: string) => {
    if (!profile) return;
    const selected = profile.answer_sets?.find((item) => item.id === id);
    const next = {
      ...profile,
      active_answer_set_id: id,
      resume_id: selected?.resume_id || profile.resume_id,
    };
    setLoading(true);
    setMessage("");
    try {
      const saved = await saveApplicationProfile(next);
      setProfile(saved);
      setMessage(`已切换为“${selected?.name || "基础资料"}”`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "资料套装切换失败");
    } finally {
      setLoading(false);
    }
  };

  const analyzePage = async () => {
    setLoading(true);
    setDetails([]);
    try {
      const result = await analyzeCurrentApplicationPage(profile || undefined);
      setMessage(result.loginRequired ? "当前是登录页面，请先完成登录" : `识别到 ${result.inputCount} 个可交互字段`);
      const recognized = result.fields
        .filter((field) => field.matchedLabel)
        .map((field) => `${field.matchedLabel}${field.hasValue ? "（已有内容，将覆盖）" : ""}`);
      const unmatched = result.fields.filter((field) => !field.matchedLabel && field.type !== "hidden").length;
      setDetails([
        recognized.length ? `可填写：${[...new Set(recognized)].join("、")}` : "当前控件没有匹配到资料字段",
        unmatched ? `另有 ${unmatched} 个控件需要人工处理或继续适配` : "未发现额外未匹配控件",
        result.title,
        result.url,
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message}；如刚安装插件，请刷新招聘页面` : "页面识别失败");
    } finally {
      setLoading(false);
    }
  };

  const fillPage = async () => {
    if (!profile) {
      setMessage("请先读取投递资料");
      return;
    }
    setLoading(true);
    setDetails([]);
    try {
      for (let step = 0; step < 5; step += 1) {
        const result = await fillCurrentApplicationPage(profile);
        if (result.loginRequired) {
          setMessage("检测到登录页面，请完成登录后再次点击“一键补充当前页”");
          return;
        }
        if (result.advanced) {
          setMessage(result.message);
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
          continue;
        }
        setMessage(result.message);
        setDetails([
          result.filledFields.length ? `已填写：${result.filledFields.join("、")}` : "没有识别到可自动填写的空字段",
          result.requiredEmpty.length ? `仍需人工确认：${result.requiredEmpty.join("、")}` : "必填项未发现明显缺失",
          result.actionText ? `页面按钮：${result.actionText}（不会自动最终提交）` : "未识别到下一步或提交按钮",
        ]);
        return;
      }
      setMessage("页面连续跳转超过5步，已停止，请核对当前页面后再次点击补充");
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message}；请刷新招聘页面后重试` : "自动补充失败");
    } finally {
      setLoading(false);
    }
  };

  const activeSet = profile?.answer_sets?.find((item) => item.id === profile.active_answer_set_id);
  const openAdmin = () => chrome.tabs.create({ url: `${ADMIN_BASE}/applications` });

  return (
    <>
      <div className="card form-assistant-card">
        <div className="section-heading">
          <div>
            <strong>简历信息补充</strong>
            <p>登录招聘网站后，选择岗位资料，再补充当前页面。</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void refreshProfile()} disabled={!apiOk || loading}>
            刷新资料
          </button>
        </div>

        <label className="field-label" htmlFor="answer-set">本次使用的岗位资料</label>
        <select
          id="answer-set"
          className="input"
          value={profile?.active_answer_set_id || ""}
          disabled={!profile || loading}
          onChange={(event) => void selectAnswerSet(event.target.value)}
        >
          <option value="">仅使用通用基础资料</option>
          {(profile?.answer_sets || []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.job_category}
            </option>
          ))}
        </select>

        <div className="profile-summary">
          <span>资料：{activeSet?.name || "通用基础资料"}</span>
          <span>简历：{profile?.resume_name || "尚未绑定可上传简历"}</span>
          <span>实习内容：{activeSet?.answers?.["实习经历"] ? "已准备" : "使用基础版本"}</span>
          <span>项目内容：{activeSet?.answers?.["项目经历"] ? "已准备" : "使用基础版本"}</span>
        </div>

        {!profile?.answer_sets?.length && (
          <div className="notice-box">
            管理台尚未导入岗位资料。请打开投递资料，点击“同步岗位文档”并保存。
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void analyzePage()} disabled={loading}>
            识别当前网页
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void fillPage()} disabled={!apiOk || !profile || loading}>
            {loading ? "处理中…" : "一键补充当前页"}
          </button>
        </div>

        <button type="button" className="text-button" onClick={openAdmin}>打开管理台修改资料与简历绑定</button>
      </div>

      {(message || details.length > 0) && (
        <div className="card result-card">
          {message && <strong>{message}</strong>}
          {details.map((item) => <p key={item}>{item}</p>)}
        </div>
      )}
    </>
  );
}
