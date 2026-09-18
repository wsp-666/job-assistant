import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, CareerBackgroundScrapeStatus } from "../api/client";

export default function BackgroundScrapeBanner() {
  const [status, setStatus] = useState<CareerBackgroundScrapeStatus | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const next = await api.getBackgroundCareerScrapeStatus();
        setStatus(next);
      } catch {
        // API 未启动时忽略
      }
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => window.clearInterval(timer);
  }, []);

  if (!status?.running) {
    return null;
  }

  const progress =
    status.total > 0 ? `${status.completed}/${status.total}` : String(status.completed);

  return (
    <div className="border-b border-blue-200 bg-blue-50 px-6 py-2 text-sm text-blue-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          后台抓取进行中 <strong>{progress}</strong>
          {status.current_company ? ` · 当前：${status.current_company}` : ""}
        </span>
        <Link to="/career-sites" className="font-medium text-blue-700 hover:underline">
          查看日志
        </Link>
      </div>
    </div>
  );
}
