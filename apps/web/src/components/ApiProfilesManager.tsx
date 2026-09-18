import { useEffect, useState } from "react";
import { api, ApiProfile, ApiProfiles } from "../api/client";
import {
  analysisModelLabel,
  defaultModelForProvider,
  getProviderPreset,
  getVisionModelValue,
  modelOptionLabel,
  providerList,
  ProviderPreset,
  visionModelLabel,
} from "./apiProviderPresets";

const MASKED = "***";

function profileFromPreset(category: "vision" | "analysis", preset: ProviderPreset): ApiProfile {
  const defaultModel = defaultModelForProvider(preset);
  return {
    id: crypto.randomUUID(),
    name: preset.label,
    category,
    provider: preset.id,
    api_key: "",
    secret_key: "",
    base_url: preset.baseUrl || "",
    model: preset.id === "custom_vision" ? "" : category === "analysis" ? defaultModel : "",
    options:
      category === "vision" && preset.models?.length
        ? { ocr_type: defaultModel }
        : {},
  };
}

interface EditState extends ApiProfile {
  apiKeyInput: string;
  secretKeyInput: string;
}

export default function ApiProfilesManager() {
  const [data, setData] = useState<ApiProfiles | null>(null);
  const [pickerCategory, setPickerCategory] = useState<"vision" | "analysis" | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getApiProfiles().then(setData);
  }, []);

  const visionProfiles = data?.profiles.filter((p) => p.category === "vision") || [];
  const analysisProfiles = data?.profiles.filter((p) => p.category === "analysis") || [];

  const openPicker = (category: "vision" | "analysis") => setPickerCategory(category);

  const pickProvider = (preset: ProviderPreset) => {
    if (!pickerCategory) return;
    const profile = profileFromPreset(pickerCategory, preset);
    setEditing({ ...profile, apiKeyInput: "", secretKeyInput: "" });
    setPickerCategory(null);
  };

  const openEdit = (profile: ApiProfile) => {
    setEditing({
      ...profile,
      apiKeyInput: profile.api_key === MASKED ? "" : profile.api_key,
      secretKeyInput: profile.secret_key === MASKED ? "" : profile.secret_key,
    });
  };

  const closeEdit = () => setEditing(null);

  const saveAll = async (next: ApiProfiles) => {
    setSaving(true);
    setMessage("");
    try {
      const saved = await api.updateApiProfiles(next);
      setData(saved);
      setMessage("API 配置已保存");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing || !data) return;
    if (!editing.name.trim()) return;

    const updated: ApiProfile = {
      id: editing.id,
      name: editing.name.trim(),
      category: editing.category,
      provider: editing.provider,
      api_key: editing.apiKeyInput.trim() || (editing.api_key === MASKED ? MASKED : editing.api_key),
      secret_key: editing.secretKeyInput.trim() || (editing.secret_key === MASKED ? MASKED : editing.secret_key),
      base_url: editing.base_url.trim(),
      model: editing.model.trim(),
      options: editing.options,
    };

    const exists = data.profiles.some((p) => p.id === updated.id);
    const profiles = exists
      ? data.profiles.map((p) => (p.id === updated.id ? updated : p))
      : [...data.profiles, updated];

    let activeVisionId = data.active_vision_id;
    let activeAnalysisId = data.active_analysis_id;
    if (!exists) {
      if (updated.category === "vision") activeVisionId = updated.id;
      else activeAnalysisId = updated.id;
    }

    await saveAll({
      profiles,
      active_vision_id: activeVisionId,
      active_analysis_id: activeAnalysisId,
    });
    closeEdit();
  };

  const setActive = async (id: string, category: "vision" | "analysis") => {
    if (!data) return;
    await saveAll({
      ...data,
      active_vision_id: category === "vision" ? id : data.active_vision_id,
      active_analysis_id: category === "analysis" ? id : data.active_analysis_id,
    });
  };

  const removeProfile = async (id: string) => {
    if (!data) return;
    const profiles = data.profiles.filter((p) => p.id !== id);
    await saveAll({
      profiles,
      active_vision_id: data.active_vision_id === id ? "" : data.active_vision_id,
      active_analysis_id: data.active_analysis_id === id ? "" : data.active_analysis_id,
    });
    if (editing?.id === id) closeEdit();
  };

  const currentPreset = editing
    ? getProviderPreset(editing.category, editing.provider)
    : undefined;

  const modelOptions = currentPreset?.models || [];
  const selectedModelOption =
    editing?.category === "vision"
      ? modelOptions.find((m) => m.id === getVisionModelValue(editing))
      : modelOptions.find((m) => m.id === editing?.model);

  const needsSecret = currentPreset?.needsSecret ?? false;

  const setVisionModel = (modelId: string) => {
    if (!editing) return;
    if (editing.provider === "custom_vision") {
      setEditing({ ...editing, model: modelId });
    } else {
      setEditing({ ...editing, options: { ...editing.options, ocr_type: modelId } });
    }
  };

  const profileModelSummary = (p: ApiProfile) => {
    if (p.category === "analysis" && p.model) {
      return analysisModelLabel(p.provider, p.model);
    }
    if (p.category === "vision") {
      const v = getVisionModelValue(p);
      if (v) return visionModelLabel(p.provider, v);
      if (p.model) return p.model;
    }
    return "";
  };

  const renderSection = (
    title: string,
    desc: string,
    category: "vision" | "analysis",
    profiles: ApiProfile[],
    activeId: string,
  ) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-slate-900">{title}</h4>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
        <button type="button" className="btn-primary text-xs" onClick={() => openPicker(category)}>
          + 添加
        </button>
      </div>

      {profiles.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">暂无配置，点击「添加」选择服务商并填入 Key</p>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => {
            const preset = getProviderPreset(category, p.provider);
            const modelText = profileModelSummary(p);
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-lg border bg-white p-3 ${
                  activeId === p.id ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200"
                }`}
              >
                <input
                  type="radio"
                  name={`active-${category}`}
                  checked={activeId === p.id}
                  onChange={() => setActive(p.id, category)}
                  title="设为当前使用"
                />
                <button type="button" className="flex-1 text-left" onClick={() => openEdit(p)}>
                  <div className="font-medium text-slate-900">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {preset?.label || p.provider}
                    {modelText ? ` · ${modelText}` : ""}
                    {p.api_key === MASKED || p.api_key ? " · 已配置 Key" : " · 未填 Key"}
                  </div>
                </button>
                <button type="button" className="text-xs text-red-600" onClick={() => removeProfile(p.id)}>
                  删除
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!data) return <p className="text-sm text-slate-500">加载 API 配置...</p>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">API 配置</h3>
        <p className="text-sm text-slate-500">
          识图 API 用于扫描版简历，分析 API 用于生成打招呼话术
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {renderSection("识图 API", "用于扫描版简历 PDF 文字识别", "vision", visionProfiles, data.active_vision_id)}
        {renderSection("分析 API", "用于 AI 生成打招呼话术", "analysis", analysisProfiles, data.active_analysis_id)}
      </div>

      {message && <p className="text-sm text-green-600">{message}</p>}
      {saving && <p className="text-sm text-slate-500">保存中...</p>}

      {pickerCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPickerCategory(null)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">选择{pickerCategory === "vision" ? "识图" : "分析"}服务商</h3>
            <p className="mt-1 text-sm text-slate-500">点击一项后选择模型版本并填写 Key</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {providerList(pickerCategory).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => pickProvider(preset)}
                  className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-blue-400 hover:bg-blue-50/50"
                >
                  <div className="font-semibold text-slate-900">{preset.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{preset.desc}</div>
                  {preset.models && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {preset.models.map((m) => (
                        <span
                          key={m.id}
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            m.tier === "pro" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {m.tier === "pro" ? "Pro" : "普通"}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn-secondary" onClick={() => setPickerCategory(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeEdit}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">
              {data.profiles.some((p) => p.id === editing.id) ? "编辑" : "配置"} {currentPreset?.label || editing.provider}
            </h3>

            <div className="mt-4 space-y-4">
              <div>
                <label className="label">显示名称</label>
                <input
                  className="input"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="如：我的 DeepSeek"
                />
              </div>

              {editing.category === "analysis" && (
                <div>
                  <label className="label">API Base URL</label>
                  <input
                    className="input"
                    value={editing.base_url}
                    onChange={(e) => setEditing({ ...editing, base_url: e.target.value })}
                    placeholder="https://api.deepseek.com"
                  />
                </div>
              )}

              {/* 模型选择：有预设列表的下拉，自定义则手填 */}
              {modelOptions.length > 0 && (
                <div>
                  <label className="label">选择模型</label>
                  <select
                    className="input"
                    value={
                      editing.category === "vision"
                        ? getVisionModelValue(editing)
                        : editing.model || modelOptions[0].id
                    }
                    onChange={(e) => {
                      const id = e.target.value;
                      if (editing.category === "vision") setVisionModel(id);
                      else setEditing({ ...editing, model: id });
                    }}
                  >
                    {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {modelOptionLabel(m)}
                      </option>
                    ))}
                  </select>
                  {selectedModelOption?.desc && (
                    <p className="mt-1 text-xs text-slate-500">{selectedModelOption.desc}</p>
                  )}
                </div>
              )}

              {editing.provider === "custom_vision" && (
                <>
                  <div>
                    <label className="label">接口地址</label>
                    <input
                      className="input"
                      value={editing.base_url}
                      onChange={(e) => setEditing({ ...editing, base_url: e.target.value })}
                      placeholder="https://your-ocr-api.example.com"
                    />
                  </div>
                  <div>
                    <label className="label">模型名称</label>
                    <input
                      className="input"
                      value={editing.model}
                      onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                      placeholder="如：ocr-v1 / gpt-4o"
                    />
                  </div>
                </>
              )}

              {editing.provider === "custom_analysis" && (
                <div>
                  <label className="label">模型名称</label>
                  <input
                    className="input"
                    value={editing.model}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                    placeholder="填入兼容接口的模型 ID"
                  />
                </div>
              )}

              {(editing.provider === "tencent_ocr" || editing.provider === "aliyun_ocr") && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  该服务商接口正在接入中，当前仅支持保存配置。请优先使用百度 OCR，或等待后续版本更新。
                </p>
              )}

              <div>
                <label className="label">API Key *</label>
                <input
                  className="input"
                  type="password"
                  value={editing.apiKeyInput}
                  onChange={(e) => setEditing({ ...editing, apiKeyInput: e.target.value })}
                  placeholder={editing.api_key === MASKED ? "已保存，留空则不修改" : "填入 API Key"}
                />
              </div>

              {needsSecret && (
                <div>
                  <label className="label">Secret Key *</label>
                  <input
                    className="input"
                    type="password"
                    value={editing.secretKeyInput}
                    onChange={(e) => setEditing({ ...editing, secretKeyInput: e.target.value })}
                    placeholder={editing.secret_key === MASKED ? "已保存，留空则不修改" : "填入 Secret Key"}
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={closeEdit}>
                取消
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={saving}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
