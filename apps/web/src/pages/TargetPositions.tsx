import { useEffect, useState } from "react";
import { api, Settings, TargetPosition } from "../api/client";
import TargetPositionLayers, { newPosition } from "../components/TargetPositionLayers";

function normalizePosition(raw: Partial<TargetPosition>): TargetPosition {
  const base = newPosition();
  return {
    ...base,
    ...raw,
    keywords: raw.keywords ?? base.keywords,
    cities: raw.cities ?? base.cities,
    include_keywords: raw.include_keywords ?? base.include_keywords,
    exclude_keywords: raw.exclude_keywords ?? base.exclude_keywords,
    job_types: raw.job_types ?? base.job_types,
    preferred_company_sizes: raw.preferred_company_sizes ?? base.preferred_company_sizes,
    preferred_industries: raw.preferred_industries ?? base.preferred_industries,
    outlook_industries: raw.outlook_industries ?? base.outlook_industries,
  };
}

export default function TargetPositionsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [positions, setPositions] = useState<TargetPosition[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getSettings().then((s) => {
      setForm(s);
      setPositions((s.target_positions ?? []).map((p) => normalizePosition(p)));
    });
  }, []);

  const handleSave = async (next: TargetPosition[]) => {
    if (!form) return;
    setSaving(true);
    setMessage("");
    try {
      const first = next[0];
      await api.updateSettings({
        ...form,
        target_positions: next,
        target_titles: next.map((p) => p.title).filter(Boolean),
        cities: first?.cities ?? [],
        min_salary: first?.min_salary_unlimited ? 0 : first?.min_salary ?? 0,
        max_salary: first?.max_salary_unlimited ? 0 : first?.max_salary ?? 0,
        min_salary_unlimited: first?.min_salary_unlimited ?? true,
        max_salary_unlimited: first?.max_salary_unlimited ?? true,
        include_keywords: first?.include_keywords ?? [],
        exclude_keywords: first?.exclude_keywords ?? [],
        greeting_style: first?.greeting_style ?? form.greeting_style,
        daily_limit: first?.daily_limit ?? form.daily_limit,
      });
      setPositions(next);
      setMessage("保存成功");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <p>加载中...</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">目标岗位</h2>
        <p className="text-slate-500">左侧管理已添加岗位，右侧配置新岗位或编辑选中岗位</p>
      </div>

      <TargetPositionLayers positions={positions} onSave={handleSave} saving={saving} message={message} />
    </div>
  );
}
