import { useCallback, useEffect, useRef, useState } from "react";
import {
  ADMIN_BASE,
  checkHealth,
  generateGreeting,
  generateGreetingByJobId,
  getSettings,
  JobData,
  markGreetingSent,
  saveJob,
  updateJobStatus,
} from "../shared/api";
import {
  clickNextJobOnTab,
  ensureBossConnection,
  fillToPage,
  getPageInfoFromTab,
  openChatOnTab,
  refreshCurrentJob,
  resetJobIndexOnTab,
  sleep,
  waitForJobDetailOnTab,
} from "./tabBridge";
import {
  AutoDeliveryConfig,
  acceptDeliveryDisclaimer,
  checkAutoDeliveryScores,
  DEFAULT_AUTO_DELIVERY_CONFIG,
  formatScoreThresholds,
  isDeliveryDisclaimerAccepted,
  loadAutoDeliveryConfig,
  PanelMode,
  saveAutoDeliveryConfig,
} from "./autoDeliveryConfig";
import DeliveryDisclaimerModal from "./DeliveryDisclaimerModal";
import "./style.css";

type BossMessage = { type: string; job?: JobData | null };

type MatchScores = { role: number | null; benefits: number | null; company: number | null };
type WorkspaceMode = "application" | "boss";

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("boss");
  const [apiOk, setApiOk] = useState(false);
  const [job, setJob] = useState<JobData | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [scores, setScores] = useState<MatchScores>({ role: null, benefits: null, company: null });
  const [greeting, setGreeting] = useState("");
  const [greetingId, setGreetingId] = useState<number | null>(null);
  const [modifyInstruction, setModifyInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [bossOk, setBossOk] = useState(false);

  const [autoRunning, setAutoRunning] = useState(false);
  const [autoLogs, setAutoLogs] = useState<string[]>([]);
  const [autoConfig, setAutoConfig] = useState<AutoDeliveryConfig>(DEFAULT_AUTO_DELIVERY_CONFIG);
  const [processedCount, setProcessedCount] = useState(0);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const apiOkRef = useRef(apiOk);
  const autoRunningRef = useRef(autoRunning);
  const stopRef = useRef(false);
  const mountedRef = useRef(false);

  apiOkRef.current = apiOk;
  autoRunningRef.current = autoRunning;

  const applyMatchScores = useCallback(
    (saved: {
      role_match_score?: number;
      benefits_match_score?: number;
      company_match_score?: number;
    }) => {
      setScores({
        role: saved.role_match_score ?? null,
        benefits: saved.benefits_match_score ?? null,
        company: saved.company_match_score ?? null,
      });
    },
    [],
  );

  const updateAutoConfig = useCallback((patch: Partial<AutoDeliveryConfig>) => {
    setAutoConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const setPanelMode = (panelMode: PanelMode) => {
    if (autoRunning) return;
    updateAutoConfig({ panelMode });
  };

  const log = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString();
    setAutoLogs((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 50));
  }, []);

  const refreshHealth = useCallback(async () => {
    setApiOk(await checkHealth());
  }, []);

  const refreshJob = useCallback(async () => {
    setRefreshing(true);
    setMessage("");
    try {
      const { job: scraped, error } = await refreshCurrentJob();
      if (!scraped) {
        setMessage(error || "未能读取岗位信息");
        return;
      }
      setJob(scraped);

      if (apiOkRef.current) {
        const saved = await saveJob(scraped);
        setJobId(saved.id);
        applyMatchScores(saved);
        setMessage("刷新成功，已同步并打分");
      } else {
        setJobId(null);
        setScores({ role: null, benefits: null, company: null });
        setMessage("已读取岗位（本地 API 未连接，未同步打分）");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setRefreshing(false);
    }
  }, [applyMatchScores]);

  useEffect(() => {
    // 本地阶段暂时关闭求职助手账号登录，不再要求从 Web 管理台同步 token。
    refreshHealth();
    setWorkspaceMode("boss");
    chrome.storage.local.set({ workspaceMode: "boss" });
    loadAutoDeliveryConfig().then((config) => setAutoConfig({
      ...config,
      panelMode: config.panelMode === "deliver" ? "manual" : config.panelMode,
    }));
    getSettings()
      .then((s) => updateAutoConfig({ maxCount: s.daily_limit || DEFAULT_AUTO_DELIVERY_CONFIG.maxCount }))
      .catch(() => {});
    const timer = setInterval(refreshHealth, 5000);
    return () => clearInterval(timer);
  }, [refreshHealth, updateAutoConfig]);

  useEffect(() => {
    if (workspaceMode !== "boss") {
      setBossOk(false);
      return;
    }
    void ensureBossConnection().then((err) => {
      setBossOk(!err);
      if (err) setMessage((prev) => prev || err);
    });
    if (!mountedRef.current) {
      mountedRef.current = true;
      void refreshJob();
    }
  }, [refreshJob, workspaceMode]);

  useEffect(() => {
    if (autoRunning) return;
    saveAutoDeliveryConfig(autoConfig);
  }, [autoConfig, autoRunning]);

  useEffect(() => {
    if (workspaceMode !== "boss") return;
    const onMessage = (msg: BossMessage) => {
      if (msg.type !== "PAGE_JOB_DETECTED" || !msg.job) return;
      if (autoConfig.panelMode !== "manual" || autoRunningRef.current) return;
      if (!autoConfig.autoWatch) return;
      setJob(msg.job);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [autoConfig.panelMode, autoConfig.autoWatch, workspaceMode]);

  const switchWorkspace = (mode: WorkspaceMode) => {
    if (autoRunning) return;
    setWorkspaceMode(mode);
    void chrome.storage.local.set({ workspaceMode: mode });
    setMessage("");
  };

  const handleGenerate = async () => {
    if (!job) return;
    setLoading(true);
    setMessage("");
    try {
      const instruction = modifyInstruction.trim();
      const result = jobId
        ? await generateGreetingByJobId(jobId, undefined, instruction || undefined)
        : await generateGreeting(job, undefined, instruction || undefined);
      setGreeting(result.content);
      setGreetingId(result.id);
      if (instruction) setModifyInstruction("");
      if (!jobId && apiOkRef.current) {
        const saved = await saveJob(job);
        setJobId(saved.id);
        applyMatchScores(saved);
      }
      setMessage("话术生成成功");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const handleFill = async () => {
    if (!greeting.trim()) {
      setMessage("请先生成或编辑话术");
      return;
    }
    const result = await fillToPage(greeting, false);
    setMessage(result);
    if (greetingId && (result.includes("填入") || result.includes("定制话术"))) {
      try {
        await markGreetingSent(greetingId, greeting);
      } catch {
        // ignore
      }
    }
  };

  const stopAuto = () => {
    stopRef.current = true;
    setAutoRunning(false);
    log("已停止全自动任务");
  };

  const runAutoScanLoop = async () => {
    stopRef.current = false;
    setAutoRunning(true);
    setProcessedCount(0);
    setAutoLogs([]);

    const connErr = await ensureBossConnection();
    if (connErr) {
      log(connErr);
      setAutoRunning(false);
      return;
    }

    await resetJobIndexOnTab();
    log("全自动爬取已开始（仅同步岗位与打分，不投递）");

    let count = 0;
    const config = autoConfig;
    const crawlLimit = config.crawlMaxCount;
    const seenUrls = new Set<string>();

    while (!stopRef.current && count < crawlLimit) {
      try {
        const pageInfo = await getPageInfoFromTab();
        if (pageInfo.jobCount === 0 && pageInfo.pageType !== "detail") {
          log("未检测到岗位列表，请打开 BOSS 职位搜索/推荐页");
          break;
        }

        log(`切换下一个岗位…（列表约 ${pageInfo.jobCount || "?"} 个，自上而下顺序）`);
        const nextResult = await clickNextJobOnTab();
        log(nextResult.message);
        if (!nextResult.ok) {
          if (nextResult.message.includes("没有更多岗位") || nextResult.message.includes("遍历完")) {
            log("列表已全部遍历，爬取结束");
          }
          break;
        }
        const detailMsg = await waitForJobDetailOnTab();
        if (!detailMsg.ok) {
          log(`${detailMsg.message}，将尝试从列表卡片读取`);
        }

        const { job: scraped, error } = await refreshCurrentJob();
        if (!scraped) {
          log(error || "未能读取岗位详情，跳过");
          await sleep(config.intervalSec * 1000);
          continue;
        }

        const urlKey = scraped.job_url.split("?")[0];
        if (seenUrls.has(urlKey)) {
          log("已采集过该岗位，尝试继续下一个");
          await sleep(config.intervalSec * 1000);
          continue;
        }
        seenUrls.add(urlKey);
        setJob(scraped);

        if (!apiOkRef.current) {
          log("本地 API 未连接，无法同步岗位");
          break;
        }

        const saved = await saveJob(scraped);
        setJobId(saved.id);
        applyMatchScores(saved);
        const composite = Math.round(
          ((saved.role_match_score ?? 0) +
            (saved.benefits_match_score ?? 0) +
            (saved.company_match_score ?? 0)) /
            3,
        );
        log(
          `已爬取：${scraped.job_title} · 综合约 ${composite} · 职责 ${saved.role_match_score ?? 0} · 待遇 ${saved.benefits_match_score ?? 0} · 公司 ${saved.company_match_score ?? 0}`,
        );

        count += 1;
        setProcessedCount(count);
        log(`进度 ${count}/${crawlLimit}`);

        if (count < crawlLimit && !stopRef.current) {
          await sleep(config.intervalSec * 1000);
        }
      } catch (e) {
        log(`出错：${e instanceof Error ? e.message : "未知错误"}`);
        await sleep(config.intervalSec * 1000);
      }
    }

    setAutoRunning(false);
    log(
      stopRef.current
        ? "全自动爬取已停止"
        : `爬取结束，共 ${count} 个岗位。请到管理台「岗位列表」按匹配分排序查看`,
    );
  };

  const runAutoDeliverLoop = async () => {
    stopRef.current = false;
    setAutoRunning(true);
    setProcessedCount(0);
    setAutoLogs([]);

    const connErr = await ensureBossConnection();
    if (connErr) {
      log(connErr);
      setAutoRunning(false);
      return;
    }

    const config = autoConfig;
    await resetJobIndexOnTab();
    log(`全自动投递已开始（投递条件：${formatScoreThresholds(config)}）`);

    let count = 0;

    while (!stopRef.current && count < config.maxCount) {
      try {
        const pageInfo = await getPageInfoFromTab();
        if (pageInfo.jobCount === 0 && pageInfo.pageType !== "detail") {
          log("未检测到岗位列表，请打开 BOSS 职位搜索/推荐页");
          break;
        }

        log(`切换下一个岗位…（列表共 ${pageInfo.jobCount || "?"} 个，自上而下顺序）`);
        const nextResult = await clickNextJobOnTab();
        log(nextResult.message);
        if (!nextResult.ok) {
          if (nextResult.message.includes("没有更多岗位") || nextResult.message.includes("遍历完")) {
            log("列表已全部遍历，投递结束");
          }
          break;
        }

        const detailMsg = await waitForJobDetailOnTab();
        if (!detailMsg.ok) {
          log(`${detailMsg.message}，仍将尝试 AI 打分`);
        }

        const { job: scraped, error } = await refreshCurrentJob();
        if (!scraped) {
          log(error || "未能读取岗位详情，跳过");
          await sleep(config.intervalSec * 1000);
          continue;
        }

        setJob(scraped);

        if (!apiOkRef.current) {
          log("本地 API 未连接，无法全自动投递");
          break;
        }

        const saved = await saveJob(scraped);
        setJobId(saved.id);
        applyMatchScores(saved);
        const roleScore = saved.role_match_score ?? 0;
        const benefitsScore = saved.benefits_match_score ?? 0;
        const companyScore = saved.company_match_score ?? 0;
        log(
          `AI 打分：${scraped.job_title} · 职责 ${roleScore} · 待遇 ${benefitsScore} · 公司 ${companyScore}`,
        );

        const scoreCheck = checkAutoDeliveryScores(roleScore, benefitsScore, companyScore, config);
        if (!scoreCheck.ok) {
          log(`未达投递条件（${formatScoreThresholds(config)}）：${scoreCheck.reason}`);
          await updateJobStatus(saved.id, "skipped");
          await sleep(config.intervalSec * 1000);
          continue;
        }

        log("正在根据 JD 和简历生成话术…");
        const result = await generateGreetingByJobId(saved.id, undefined, undefined, scraped);
        setGreeting(result.content);
        setGreetingId(result.id);
        log(`话术已生成：${result.content.slice(0, 48)}${result.content.length > 48 ? "…" : ""}`);

        log("打开立即沟通…");
        log(await openChatOnTab());
        await sleep(2500);

        const fillMsg = await fillToPage(result.content, config.autoSend);
        log(fillMsg);

        const delivered =
          fillMsg.includes("定制话术") ||
          fillMsg.includes("填入并点击发送") ||
          fillMsg.includes("已填入输入框") ||
          fillMsg.includes("已发送定制话术");
        if (!delivered) {
          log("话术未成功写入或发送，本岗位不计入完成数");
          await sleep(config.intervalSec * 1000);
          continue;
        }

        if (config.autoSend && fillMsg.includes("发送")) {
          await markGreetingSent(result.id, result.content);
          await updateJobStatus(saved.id, "greeted");
        } else if (fillMsg.includes("填入")) {
          await updateJobStatus(saved.id, "greeted");
        }

        count += 1;
        setProcessedCount(count);
        log(`本轮完成（${count}/${config.maxCount}）`);

        if (count < config.maxCount && !stopRef.current) {
          await sleep(config.intervalSec * 1000);
        }
      } catch (e) {
        log(`出错：${e instanceof Error ? e.message : "未知错误"}`);
        await sleep(config.intervalSec * 1000);
      }
    }

    setAutoRunning(false);
    log(stopRef.current ? "全自动投递已停止" : `全自动投递结束，共处理 ${count} 个岗位`);
  };

  const startCrawl = () => {
    void runAutoScanLoop();
  };

  const startDeliver = async () => {
    const accepted = await isDeliveryDisclaimerAccepted();
    if (!accepted) {
      setShowDisclaimer(true);
      return;
    }
    void runAutoDeliverLoop();
  };

  const handleDisclaimerAccept = async () => {
    await acceptDeliveryDisclaimer();
    setShowDisclaimer(false);
    void runAutoDeliverLoop();
  };

  if (workspaceMode === "application") {
    return (
      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>求职助手</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>招聘官网简历信息补充</p>
        </div>

        <div className="card" style={{ padding: 8 }}>
          <div className="workspace-tabs">
            <button type="button" className="workspace-tab active" onClick={() => switchWorkspace("application")}>简历信息补充</button>
            <button type="button" className="workspace-tab" onClick={() => switchWorkspace("boss")}>BOSS 工具</button>
          </div>
        </div>

        <div className="card">
          <p style={{ margin: 0, fontSize: 13 }}>
            本地服务：
            <span className={apiOk ? "status-ok" : "status-bad"}>
              {apiOk ? "已连接" : "未连接（请先启动求职助手）"}
            </span>
          </p>
        </div>

        <p className="card" style={{ fontSize: 12, color: "#64748b" }}>自动填写与自动投递入口已隐藏，请在管理台手动维护投递进度。</p>
      </div>
    );
  }

  const scoreBadges = (
    <p style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
      <span className="badge badge-role">职责 {scores.role ?? "—"}</span>
      <span className="badge badge-benefits">待遇 {scores.benefits ?? "—"}</span>
      <span className="badge badge-company">公司 {scores.company ?? "—"}</span>
    </p>
  );

  return (
    <div style={{ padding: 12, display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18 }}>求职助手</h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>BOSS 岗位采集与沟通</p>
      </div>

      {(!apiOk || !bossOk) && (
        <div className="card" style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
          <strong style={{ display: "block", marginBottom: 6 }}>使用前请确认</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li style={{ color: apiOk ? "#15803d" : "#b45309" }}>
              {apiOk ? "✓" : "○"} 启动器点击「一键启动」，下方 API 显示已连接
            </li>
            <li style={{ color: bossOk ? "#15803d" : "#b45309" }}>
              {bossOk ? "✓" : "○"} Edge 打开 <strong>www.zhipin.com</strong> 岗位详情页
            </li>
            <li>点击工具栏「求职助手」图标即可打开本面板（无需再点弹窗）</li>
          </ul>
        </div>
      )}

      <div className="card" style={{ padding: 8 }}>
        <div className="mode-tabs">
          <button
            type="button"
            className={`mode-tab ${autoConfig.panelMode === "manual" ? "active" : ""}`}
            onClick={() => setPanelMode("manual")}
            disabled={autoRunning}
          >
            手动模式
          </button>
          <button
            type="button"
            className={`mode-tab mode-tab-crawl ${autoConfig.panelMode === "crawl" ? "active" : ""}`}
            onClick={() => setPanelMode("crawl")}
            disabled={autoRunning}
          >
            全自动爬取
          </button>
        </div>
      </div>

      <div className="card">
        <p style={{ margin: 0, fontSize: 13 }}>
          本地 API：
          <span className={apiOk ? "status-ok" : "status-bad"}>
            {apiOk ? "已连接" : "未连接（请启动后端）"}
          </span>
        </p>
      </div>

      {autoConfig.panelMode === "manual" ? (
        <>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong style={{ fontSize: 14 }}>当前岗位</strong>
              <button type="button" className="btn btn-secondary" onClick={() => void refreshJob()} disabled={refreshing}>
                {refreshing ? "刷新中…" : "刷新"}
              </button>
            </div>
            {job ? (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{job.job_title}</p>
                <p style={{ margin: 0, color: "#475569" }}>
                  {job.company} · {job.city} · {job.salary || "薪资面议"}
                </p>
                {(job.company_size || job.company_industry) && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                    {[job.company_industry, job.company_size].filter(Boolean).join(" · ")}
                  </p>
                )}
                {scoreBadges}
              </div>
            ) : (
              <p style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
                打开 BOSS 岗位详情页后点击「刷新」
              </p>
            )}
            <label style={{ marginTop: 10, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={autoConfig.autoWatch}
                onChange={(e) => updateAutoConfig({ autoWatch: e.target.checked })}
              />
              切换岗位时自动更新页面信息（不自动发话术）
            </label>
          </div>

          <div className="card" style={{ display: "grid", gap: 8 }}>
            <strong style={{ fontSize: 14 }}>手动投递</strong>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
              适用于岗位详情页：刷新 → 生成话术 → 打开沟通 → 填入。
            </p>
            <label style={{ fontSize: 12, color: "#475569" }}>修改想法（可选）</label>
            <textarea
              className="textarea"
              style={{ minHeight: 72 }}
              value={modifyInstruction}
              onChange={(e) => setModifyInstruction(e.target.value)}
              placeholder="例如：更简短；突出实习经历；语气更正式…"
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!job || !apiOk || loading}
              onClick={() => void handleGenerate()}
            >
              {loading ? "生成中..." : modifyInstruction.trim() ? "按想法重新生成" : "生成打招呼语"}
            </button>
            <textarea
              className="textarea"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="生成的话术会显示在这里，可手动修改"
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!greeting.trim()}
              onClick={() => void handleFill()}
            >
              填入 BOSS 输入框
            </button>
          </div>
        </>
      ) : autoConfig.panelMode === "crawl" ? (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <strong style={{ fontSize: 14, color: "#047857" }}>全自动爬取岗位</strong>
          <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
            在 BOSS 职位列表页自动切换、滚动浏览岗位，同步 JD 并计算匹配分，写入管理台岗位列表（不生成话术、不打开沟通、不发送消息）。
          </p>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            切换间隔（秒）
            <input
              type="number"
              min={3}
              max={120}
              value={autoConfig.intervalSec}
              onChange={(e) => updateAutoConfig({ intervalSec: Number(e.target.value) })}
              style={{ width: 56, padding: 4, borderRadius: 6, border: "1px solid #cbd5e1" }}
              disabled={autoRunning}
            />
          </label>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            本轮爬取上限
            <input
              type="number"
              min={1}
              max={300}
              value={autoConfig.crawlMaxCount}
              onChange={(e) => updateAutoConfig({ crawlMaxCount: Number(e.target.value) })}
              style={{ width: 56, padding: 4, borderRadius: 6, border: "1px solid #cbd5e1" }}
              disabled={autoRunning}
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {!autoRunning ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!apiOk}
                onClick={startCrawl}
                style={{ flex: 1, background: "#059669" }}
              >
                开始全自动爬取
              </button>
            ) : (
              <button type="button" className="btn btn-danger" onClick={stopAuto} style={{ flex: 1 }}>
                停止爬取（已处理 {processedCount}）
              </button>
            )}
          </div>
          {autoLogs.length > 0 && (
            <div className="log-box">
              {autoLogs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <strong style={{ fontSize: 14, color: "#b45309" }}>全自动投递</strong>
          <p style={{ margin: 0, fontSize: 11, color: "#b45309" }}>
            仅当 AI 打出的职责/待遇/公司三项分数均落在你下方设置的范围内时才会投递。分数由简历、目标岗位与 JD 自动生成，无需你逐个打分。
          </p>

          {["职责", "待遇", "公司"].map((label, idx) => {
            const minKey = (["minRoleScore", "minBenefitsScore", "minCompanyScore"] as const)[idx];
            const maxKey = (["maxRoleScore", "maxBenefitsScore", "maxCompanyScore"] as const)[idx];
            return (
              <div key={label} style={{ fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{label}匹配分</span>
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    最低
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={autoConfig[minKey]}
                      onChange={(e) => updateAutoConfig({ [minKey]: Number(e.target.value) })}
                      style={{ width: 52, padding: 4, borderRadius: 6, border: "1px solid #cbd5e1" }}
                      disabled={autoRunning}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    最高
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={autoConfig[maxKey]}
                      onChange={(e) => updateAutoConfig({ [maxKey]: Number(e.target.value) })}
                      style={{ width: 52, padding: 4, borderRadius: 6, border: "1px solid #cbd5e1" }}
                      disabled={autoRunning}
                    />
                  </label>
                </div>
              </div>
            );
          })}

          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            间隔（秒）
            <input
              type="number"
              min={3}
              max={120}
              value={autoConfig.intervalSec}
              onChange={(e) => updateAutoConfig({ intervalSec: Number(e.target.value) })}
              style={{ width: 56, padding: 4, borderRadius: 6, border: "1px solid #cbd5e1" }}
              disabled={autoRunning}
            />
          </label>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            本轮投递上限
            <input
              type="number"
              min={1}
              max={100}
              value={autoConfig.maxCount}
              onChange={(e) => updateAutoConfig({ maxCount: Number(e.target.value) })}
              style={{ width: 56, padding: 4, borderRadius: 6, border: "1px solid #cbd5e1" }}
              disabled={autoRunning}
            />
          </label>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={autoConfig.autoSend}
              onChange={(e) => updateAutoConfig({ autoSend: e.target.checked })}
              disabled={autoRunning}
            />
            自动点击「发送」（高风险，不推荐）
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            {!autoRunning ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!apiOk}
                onClick={() => void startDeliver()}
                style={{ flex: 1, background: "#d97706" }}
              >
                开始全自动投递
              </button>
            ) : (
              <button type="button" className="btn btn-danger" onClick={stopAuto} style={{ flex: 1 }}>
                停止投递（已处理 {processedCount}）
              </button>
            )}
          </div>

          {autoLogs.length > 0 && (
            <div className="log-box">
              {autoLogs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="card" style={{ fontSize: 12, color: "#334155" }}>
          {message}
        </div>
      )}

      <div className="card" style={{ fontSize: 12, color: "#64748b" }}>
        管理台：
        <a href={`${ADMIN_BASE}/jobs`} target="_blank" rel="noreferrer">
          {ADMIN_BASE}/jobs
        </a>
      </div>

      <DeliveryDisclaimerModal
        open={showDisclaimer}
        onCancel={() => setShowDisclaimer(false)}
        onAccept={() => void handleDisclaimerAccept()}
      />
    </div>
  );
}
