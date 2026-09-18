import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";

const FEATURE_GROUPS = [
  {
    title: "BOSS 直聘 · Edge 插件",
    badge: "核心",
    items: [
      "在岗位详情页自动抓取职位名称、公司、薪资、城市、JD 全文等信息",
      "结合你的简历与目标岗位，对岗位进行职责 / 待遇 / 公司三维 AI 匹配打分（0–100）",
      "根据简历与 JD 自动生成 80–150 字个性化打招呼语，支持修改指令重新生成",
      "一键将话术填入 BOSS 沟通输入框（默认需你手动确认发送，降低误投与风控风险）",
      "手动模式：浏览详情页时刷新同步、可选「浏览时自动同步岗位」",
      "全自动模式：在职位列表页按匹配分范围批量切换岗位 → 打开沟通 → 填入话术（可设间隔与上限）",
    ],
  },
  {
    title: "Web 管理台",
    badge: "管理",
    items: [
      "仪表盘：查看岗位总量、今日新增、平均匹配分、待沟通 / 已沟通等统计",
      "BOSS直聘岗位：集中查看插件采集的岗位，按状态筛选、查看话术与匹配详情",
      "简历管理：上传 PDF / Word，自动解析经历与技能；支持在线编辑、AI 优化与简历模板",
      "目标岗位：配置想投递的岗位类型、城市、关键词，作为 AI 打分与筛选依据",
      "设置：配置 DeepSeek 等 AI 接口 Key、打招呼风格、每日上限等参数",
    ],
  },
  {
    title: "企业官网招聘",
    badge: "扩展",
    items: [
      "官网招聘源：导入精选北森校招等企业源，或手动添加校招页 URL 后抓取",
      "官网岗位：按公司、关键词筛选抓取结果，支持导出 Excel 便于线下投递",
      "与 BOSS 插件岗位分栏管理，覆盖更多招聘渠道",
    ],
  },
  {
    title: "本地模式与数据",
    badge: "说明",
    items: [
      "当前为本地免登录模式，打开管理台即可使用，无需注册账号或开通会员",
      "简历、岗位、话术等核心业务数据保存在本机 SQLite，不上传云端",
      "本机 API + 管理台 + 浏览器插件三部分协同：插件经本机服务调用 AI 与数据库",
      "半自动设计：生成与填入自动化，发送由你确认；AI 调用仅将简历与 JD 片段发给所配置的模型接口",
    ],
  },
] as const;

const STEPS = [
  {
    title: "启动本机服务",
    summary: "双击启动器，一键启动后打开管理台",
    content: (
      <>
        <p>
          双击桌面或开始菜单的 <strong>求职助手</strong> 图标（或安装目录下的{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">JobAssistant.exe</code>）。
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>在启动器窗口点击 <strong>「一键启动」</strong>，等待状态变为「运行中」</li>
          <li>点击 <strong>「打开应用」</strong>（地址一般为 http://127.0.0.1:8000）</li>
          <li>用完后<strong>关闭启动器窗口</strong>即可自动停止服务</li>
        </ol>
      </>
    ),
  },
  {
    title: "上传简历",
    summary: "PDF / Word，供 AI 匹配与生成话术",
    content: (
      <p>
        前往{" "}
        <Link to="/resume" className="font-medium text-blue-600 hover:underline">
          简历管理
        </Link>{" "}
        上传简历。系统会解析经历与技能，用于岗位匹配分和打招呼语生成。
      </p>
    ),
  },
  {
    title: "确认本地模式",
    summary: "无需账号登录，直接配置并使用",
    content: (
      <p>
        当前版本已暂时关闭求职助手账号登录。打开管理台后，可直接前往{" "}
        <Link to="/settings" className="font-medium text-blue-600 hover:underline">
          设置
        </Link>
        配置 AI 接口；岗位、简历和投递进度均保存在本机。BOSS 直聘等招聘网站仍需在浏览器中自行登录。
      </p>
    ),
  },
  {
    title: "配置筛选与 API",
    summary: "目标岗位 + DeepSeek 等 API Key",
    content: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          在{" "}
          <Link to="/target-positions" className="font-medium text-blue-600 hover:underline">
            目标岗位
          </Link>{" "}
          添加想投的岗位类型与关键词
        </li>
        <li>在设置页配置 AI 接口（识图 / 分析）与 API Key</li>
      </ul>
    ),
  },
  {
    title: "官网招聘抓取（可选）",
    summary: "精选北森校招源 + 手动添加",
    content: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          打开{" "}
          <Link to="/career-sites" className="font-medium text-blue-600 hover:underline">
            官网招聘源
          </Link>
          ，导入精选企业或手动填写校招页 URL，再点「仅抓取」
        </li>
        <li>
          在{" "}
          <Link to="/career-jobs" className="font-medium text-blue-600 hover:underline">
            官网岗位
          </Link>{" "}
          按公司、关键词筛选并导出 Excel
        </li>
      </ul>
    ),
  },
  {
    title: "安装 Edge 插件",
    summary: "首次加载解压缩扩展",
    content: <ExtensionInstallSteps />,
  },
  {
    title: "BOSS 直聘使用插件",
    summary: "详情页抓取 + 手动确认沟通",
    content: (
      <ol className="list-decimal space-y-2 pl-5">
        <li>Edge 打开 <strong>zhipin.com</strong> 并登录</li>
        <li>进入<strong>岗位详情页</strong>（URL 含 job_detail）</li>
        <li>打开插件侧边栏，确认 <strong>API 已连接</strong></li>
        <li>生成话术 → 填入 BOSS → 检查后手动发送</li>
      </ol>
    ),
  },
  {
    title: "管理台跟进",
    summary: "BOSS 岗位与官网岗位分栏查看",
    content: (
      <p>
        <Link to="/jobs" className="font-medium text-blue-600 hover:underline">
          BOSS直聘岗位
        </Link>{" "}
        查看插件采集的岗位；
        <Link to="/career-jobs" className="font-medium text-blue-600 hover:underline">
          官网岗位
        </Link>{" "}
        查看企业官网抓取的岗位；仪表盘可看整体统计。
      </p>
    ),
  },
] as const;

function FeatureIntroduction() {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-slate-50 px-6 py-5">
        <h3 className="text-lg font-semibold text-slate-900">功能介绍</h3>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
          <strong>求职助手</strong>是面向个人求职者的本地求职工具，由{" "}
          <strong>Edge 浏览器插件</strong>、<strong>本机 API 服务</strong>与{" "}
          <strong>Web 管理台</strong>三部分组成。它帮你在 BOSS 直聘上自动读取岗位、智能打分、生成个性化打招呼语，
          并统一管理投递记录；同时支持从企业官网招聘页批量抓取校招岗位，覆盖更多投递渠道。
        </p>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-2">
        {FEATURE_GROUPS.map((group) => (
          <div
            key={group.title}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center gap-2">
              <h4 className="font-semibold text-slate-900">{group.title}</h4>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {group.badge}
              </span>
            </div>
            <ul className="space-y-2 text-sm leading-relaxed text-slate-600">
              {group.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-500">
        设计原则：半自动投递（生成与填入自动化，发送由你确认）· 本地优先（核心数据存本机）· 话术可编辑
      </div>
    </section>
  );
}

function ExtensionInstallSteps() {
  const [extensionPath, setExtensionPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getSetupPaths()
      .then((data) => setExtensionPath(data.extension_dir || ""))
      .catch(() => setExtensionPath(""))
      .finally(() => setLoading(false));
  }, []);

  const copyPath = async () => {
    if (!extensionPath) return;
    try {
      await navigator.clipboard.writeText(extensionPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <ol className="list-decimal space-y-2 pl-5">
      <li>
        Edge 地址栏输入{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">edge://extensions</code>
      </li>
      <li>开启 <strong>开发人员模式</strong></li>
      <li>
        点击 <strong>加载解压缩的扩展</strong>，选择目录：
        <div className="mt-2 space-y-2">
          {loading ? (
            <p className="text-xs text-slate-500">正在读取本机安装路径…</p>
          ) : extensionPath ? (
            <div className="flex flex-wrap items-center gap-2">
              <code
                className="max-w-full break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
                title={extensionPath}
              >
                {extensionPath}
              </code>
              <button type="button" onClick={copyPath} className="btn-secondary shrink-0 text-xs">
                {copied ? "已复制" : "复制路径"}
              </button>
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              未检测到插件目录，请确认本机服务已启动，或手动选择安装目录下的 <strong>extension</strong> 文件夹。
            </p>
          )}
          <p className="text-xs text-slate-500">
            路径根据你的实际安装位置自动生成，复制后在 Edge 文件选择框中粘贴即可。
          </p>
        </div>
      </li>
      <li>工具栏出现「求职助手」后，点击图标即可打开插件面板</li>
    </ol>
  );
}

export default function QuickStartGuide() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <div className="space-y-6">
      <FeatureIntroduction />

      <div className="grid min-h-[calc(100vh-10rem)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="card flex flex-col gap-1 p-2 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-10rem)] lg:overflow-auto">
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">步骤导航</p>
          {STEPS.map((item, index) => {
            const selected = index === active;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => setActive(index)}
                className={`rounded-lg px-3 py-3 text-left transition ${
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      selected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium">{item.title}</div>
                    <div className={`mt-0.5 text-xs ${selected ? "text-blue-100" : "text-slate-500"}`}>
                      {item.summary}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        <section className="card flex min-h-[420px] flex-col">
          <div className="border-b border-slate-200 px-6 py-4">
            <p className="text-sm text-blue-600">步骤 {active + 1} / {STEPS.length}</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">{step.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{step.summary}</p>
          </div>
          <div className="flex-1 px-6 py-5 text-sm leading-relaxed text-slate-700">{step.content}</div>
          <div className="flex justify-between border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              className="btn-secondary"
              disabled={active === 0}
              onClick={() => setActive((v) => Math.max(0, v - 1))}
            >
              上一步
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={active === STEPS.length - 1}
              onClick={() => setActive((v) => Math.min(STEPS.length - 1, v + 1))}
            >
              下一步
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
