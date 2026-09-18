import { useState } from "react";

interface Props {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  presets: string[];
  placeholder?: string;
}

export default function MultiChipSelect({
  label,
  value,
  onChange,
  presets,
  placeholder = "输入后回车添加",
}: Props) {
  const [input, setInput] = useState("");

  const toggle = (item: string) => {
    if (value.includes(item)) {
      onChange(value.filter((v) => v !== item));
    } else {
      onChange([...value, item]);
    }
  };

  const addCustom = () => {
    const text = input.trim();
    if (!text || value.includes(text)) {
      setInput("");
      return;
    }
    onChange([...value, text]);
    setInput("");
  };

  const remove = (item: string) => onChange(value.filter((v) => v !== item));

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex flex-wrap gap-2">
        {presets.map((item) => {
          const active = value.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => toggle(item)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                active
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {active ? "✓ " : ""}
              {item}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={placeholder}
        />
        <button type="button" className="btn-secondary shrink-0" onClick={addCustom}>
          添加
        </button>
      </div>
      {value.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-slate-500">已选 {value.length} 项：</span>
          {value.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-700"
            >
              {item}
              <button
                type="button"
                className="text-slate-400 hover:text-red-500"
                onClick={() => remove(item)}
                aria-label={`移除 ${item}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const PRESET_JOB_TITLES = [
  "前端开发",
  "后端开发",
  "Java开发",
  "Python开发",
  "Go开发",
  "全栈工程师",
  "Android开发",
  "iOS开发",
  "测试工程师",
  "运维工程师",
  "产品经理",
  "产品运营",
  "UI设计师",
  "UX设计师",
  "数据分析",
  "数据分析师",
  "算法工程师",
  "项目经理",
  "运营",
  "市场营销",
  "新媒体运营",
  "人力资源",
  "财务",
  "行政",
];

export const PRESET_CITIES = [
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "成都",
  "南京",
  "武汉",
  "西安",
  "苏州",
  "重庆",
  "天津",
  "长沙",
  "郑州",
  "远程",
];
