import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApplicationQueue,
  ApplicationTask,
  claimNextApplicationTask,
  controlApplicationQueue,
  generateGreetingByJobId,
  getApplicationQueue,
  getCurrentApplicationQueue,
  markGreetingSent,
  updateApplicationTask,
} from "../shared/api";
import {
  ensureBossConnection,
  analyzeApplicationPage,
  fillApplicationPage,
  fillToPage,
  openApplicationPage,
  resumeApplicationPage,
  openChatOnTab,
  sendApplicationPageMessage,
  sleep,
} from "./tabBridge";

type AnalyzeResult = {
  loginRequired: boolean;
  url: string;
  title: string;
  inputCount: number;
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

type SubmissionVerification = {
  confirmed: boolean;
  message: string;
};

const QUEUE_STATUS: Record<string, string> = {
  running: "执行中",
  paused: "已暂停",
  waiting_login: "等待登录",
  waiting_confirmation: "等待确认提交",
  completed: "已完成",
  cancelled: "已取消",
};

function currentTask(queue: ApplicationQueue | null): ApplicationTask | null {
  return queue?.tasks.find((task) => ["opening", "waiting_login", "filling", "ready_to_submit", "submitting"].includes(task.status)) || null;
}

function isBossJob(task: ApplicationTask) {
  if (task.job?.platform === "boss") return true;
  try {
    return /(^|\.)zhipin\.com$/i.test(new URL(task.job?.job_url || task.page_url).hostname);
  } catch {
    return false;
  }
}

export default function PriorityApplicationQueue() {
  const [queue, setQueue] = useState<ApplicationQueue | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const runningRef = useRef(false);
  const stopRef = useRef(false);
  const reuseApplicationTabRef = useRef(false);

  const log = useCallback((line: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((current) => [`[${time}] ${line}`, ...current].slice(0, 40));
  }, []);

  const updateTask = useCallback(
    async (task: ApplicationTask, status: string, detail = "", pageUrl = "") => {
      const next = await updateApplicationTask(task.id, status, detail, pageUrl);
      setQueue(next);
      return next;
    },
    [],
  );

  const processBossTask = useCallback(
    async (task: ApplicationTask, autoSubmit: boolean) => {
      const connectionError = await ensureBossConnection();
      if (connectionError) throw new Error(connectionError);
      await updateTask(task, "filling", "正在生成 BOSS 沟通话术", task.page_url);
      const greeting = await generateGreetingByJobId(task.job_id);
      log(`话术已生成：${greeting.content.slice(0, 42)}${greeting.content.length > 42 ? "…" : ""}`);
      log(await openChatOnTab());
      await sleep(1600);
      const result = await fillToPage(greeting.content, autoSubmit);
      log(result);
      const filled = /填入|定制话术|发送/.test(result) && !/失败|未找到|未能/.test(result);
      if (!filled) throw new Error(result || "BOSS 沟通框填写失败");
      const sent = autoSubmit && /已发送|点击发送/.test(result) && !/失败/.test(result);
      if (sent) {
        await updateTask(task, "submitting", "已点击 BOSS 发送按钮", task.page_url);
        await markGreetingSent(greeting.id, greeting.content).catch(() => undefined);
        await updateTask(task, "succeeded", "BOSS 话术已自动发送", task.page_url);
        return "done" as const;
      }
      await updateTask(task, "ready_to_submit", "话术已填入，请核对后手动发送", task.page_url);
      return "wait" as const;
    },
    [log, updateTask],
  );

  const processGenericTask = useCallback(
    async (task: ApplicationTask, profile: NonNullable<Awaited<ReturnType<typeof claimNextApplicationTask>>["profile"]>, autoSubmit: boolean, tabId: number) => {
      await updateTask(task, "filling", "开始识别并填写招聘表单", task.page_url);
      for (let step = 0; step < 8; step += 1) {
        const result = await fillApplicationPage(tabId, profile, autoSubmit, false) as FillResult;
        log(`第 ${step + 1} 步：${result.message}`);
        if (result.loginRequired) {
          await updateTask(task, "waiting_login", "请先在招聘网站完成登录", task.page_url);
          return "wait" as const;
        }
        if (result.advanced) {
          await sleep(1800);
          continue;
        }
        if (result.submitted) {
          await updateTask(task, "submitting", `已点击最终提交：${result.message}`, task.page_url);
          await sleep(1800);
          const verification = await sendApplicationPageMessage<SubmissionVerification>(tabId, {
            type: "APPLICATION_VERIFY_SUBMISSION",
          }).catch(() => ({ confirmed: false, message: "提交后页面无法自动验证" }));
          log(verification.message);
          if (verification.confirmed) {
            await updateTask(task, "succeeded", verification.message, task.page_url);
            return "done" as const;
          }
          await updateTask(task, "ready_to_submit", `已点击提交但结果未确认：${verification.message}`, task.page_url);
          return "wait" as const;
        }
        if (result.filled > 0 || result.uploaded || result.actionFound) {
          const missing = result.requiredEmpty.length ? `；仍需人工确认：${result.requiredEmpty.join("、")}` : "";
          await updateTask(task, "ready_to_submit", `${result.message}${missing}`, task.page_url);
          return "wait" as const;
        }
        throw new Error("当前页面没有识别到可填写的网申表单，请确认岗位链接是否指向申请页面");
      }
      throw new Error("网申步骤超过 8 页，已停止自动跳转，请人工继续");
    },
    [log, updateTask],
  );

  const runQueue = useCallback(
    async (queueId: number) => {
      if (runningRef.current) return;
      runningRef.current = true;
      stopRef.current = false;
      setRunning(true);
      setMessage("");
      log(`开始执行优先级投递任务 #${queueId}`);

      try {
        while (!stopRef.current) {
          const next = await claimNextApplicationTask(queueId);
          setQueue(next.queue);
          if (!next.task) {
            if (next.queue.status === "paused") log("任务已暂停");
            else if (next.queue.status === "completed") log("全部投递任务处理完成");
            break;
          }
          const task = next.task;
          if (["waiting_login", "ready_to_submit"].includes(task.status)) break;
          if (!task.job || !next.profile) {
            await updateTask(task, "failed", "岗位或投递资料缺失");
            continue;
          }

          log(`打开 P${Math.max(0, task.priority - 1)}：${task.job.company} / ${task.job.job_title}`);
          try {
            const targetUrl = task.page_url || task.job.job_url;
            const tab = reuseApplicationTabRef.current
              ? await resumeApplicationPage(targetUrl)
              : await openApplicationPage(targetUrl);
            reuseApplicationTabRef.current = false;
            if (!tab.id) throw new Error("招聘页面标签页创建失败");
            const analysis = await analyzeApplicationPage(tab.id) as AnalyzeResult;
            if (analysis.loginRequired) {
              log("检测到未登录，等待你完成登录");
              await updateTask(task, "waiting_login", "请在当前招聘网站手动登录，完成后点击继续", analysis.url);
              break;
            }

            const outcome = isBossJob(task)
              ? await processBossTask(task, next.queue.auto_submit)
              : await processGenericTask(task, next.profile, next.queue.auto_submit, tab.id);
            if (outcome === "wait") break;
            await sleep(900);
          } catch (error) {
            const detail = error instanceof Error ? error.message : "自动投递失败";
            log(`失败：${detail}`);
            await updateTask(task, "failed", detail, task.page_url).catch(() => undefined);
          }
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "投递队列执行失败";
        setMessage(detail);
        log(detail);
      } finally {
        runningRef.current = false;
        setRunning(false);
        getApplicationQueue(queueId).then(setQueue).catch(() => undefined);
      }
    },
    [log, processBossTask, processGenericTask, updateTask],
  );

  useEffect(() => {
    getCurrentApplicationQueue()
      .then((active) => {
        setQueue(active);
        if (active?.status === "running") window.setTimeout(() => void runQueue(active.id), 300);
      })
      .catch(() => undefined);

    const listener = (event: { type?: string; queueId?: number }) => {
      if (event.type !== "APPLICATION_QUEUE_WAKE" || !event.queueId) return;
      getApplicationQueue(event.queueId)
        .then((next) => {
          setQueue(next);
          void runQueue(event.queueId as number);
        })
        .catch((error) => setMessage(error instanceof Error ? error.message : "读取投递任务失败"));
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [runQueue]);

  useEffect(() => {
    if (!queue || ["completed", "cancelled"].includes(queue.status)) return;
    const timer = window.setInterval(() => {
      getApplicationQueue(queue.id).then(setQueue).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [queue?.id, queue?.status]);

  const resume = async () => {
    if (!queue) return;
    reuseApplicationTabRef.current = true;
    const next = await controlApplicationQueue(queue.id, "resume");
    setQueue(next);
    void runQueue(queue.id);
  };

  const confirm = async (success: boolean) => {
    if (!queue) return;
    const task = currentTask(queue);
    if (!task) return;
    await updateTask(
      task,
      success ? "succeeded" : "skipped",
      success ? "用户已在招聘页面核对并提交" : "用户选择跳过",
      task.page_url,
    );
    const next = await controlApplicationQueue(queue.id, "resume");
    setQueue(next);
    void runQueue(queue.id);
  };

  const pause = async () => {
    if (!queue) return;
    stopRef.current = true;
    setQueue(await controlApplicationQueue(queue.id, "pause"));
  };

  if (!queue) return null;

  const task = currentTask(queue);
  const progress = queue.total ? Math.round((queue.processed / queue.total) * 100) : 0;
  return (
    <div className="card priority-queue-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <strong style={{ fontSize: 14 }}>按优先级投递</strong>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#475569" }}>
            {QUEUE_STATUS[queue.status] || queue.status} · {queue.processed}/{queue.total} · 成功 {queue.succeeded}
          </p>
        </div>
        <span className={`queue-status queue-status-${queue.status}`}>{QUEUE_STATUS[queue.status] || queue.status}</span>
      </div>
      <div className="queue-progress"><span style={{ width: `${progress}%` }} /></div>
      {task?.job && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#1e3a8a" }}>
          当前：P{Math.max(0, task.priority - 1)} · {task.job.company} / {task.job.job_title}
        </p>
      )}
      {queue.status === "waiting_login" && (
        <div className="queue-action-box">
          <p>请在打开的招聘页面完成登录、验证码或滑块验证。</p>
          <button type="button" className="btn btn-primary" onClick={() => void resume()}>登录完成，继续填写</button>
        </div>
      )}
      {queue.status === "waiting_confirmation" && (
        <div className="queue-action-box queue-confirm-box">
          <p>表单已自动填写。请核对页面内容并提交，然后告诉我结果。</p>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-primary" onClick={() => void confirm(true)}>已提交，继续下一个</button>
            <button type="button" className="btn btn-secondary" onClick={() => void confirm(false)}>跳过</button>
          </div>
        </div>
      )}
      {queue.status === "running" && (
        <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} disabled={!running} onClick={() => void pause()}>
          暂停队列
        </button>
      )}
      {message && <p style={{ margin: "8px 0 0", fontSize: 11, color: "#b91c1c" }}>{message}</p>}
      {logs.length > 0 && <div className="log-box" style={{ marginTop: 8 }}>{logs.slice(0, 8).map((line, index) => <div key={index}>{line}</div>)}</div>}
    </div>
  );
}
