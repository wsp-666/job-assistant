import { useEffect, useRef, useState } from "react";

type ScrapeLogPanelProps = {
  lines: string[];
  scraping: boolean;
  onClear: () => void;
};

const BOTTOM_THRESHOLD_PX = 48;

export default function ScrapeLogPanel({ lines, scraping, onClear }: ScrapeLogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const followBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const visible = lines.length > 0 ? lines : ["等待抓取…"];

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    followBottomRef.current = true;
    setShowJumpToBottom(false);
  };

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    followBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  };

  useEffect(() => {
    if (followBottomRef.current) {
      scrollToBottom(scraping ? "smooth" : "auto");
    } else {
      setShowJumpToBottom(true);
    }
  }, [lines, scraping]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>抓取日志</span>
          {scraping && <span className="text-blue-500">运行中</span>}
          {showJumpToBottom && (
            <span className="text-amber-600">已暂停自动滚动，可向上查看</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showJumpToBottom && (
            <button
              type="button"
              className="text-[11px] text-blue-600 hover:text-blue-800"
              onClick={() => scrollToBottom("smooth")}
            >
              回到底部
            </button>
          )}
          <button
            type="button"
            className="text-[11px] text-slate-400 hover:text-slate-600"
            onClick={onClear}
          >
            清空
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-48 min-h-24 overflow-y-auto text-[11px] leading-5 text-slate-600"
      >
        {visible.map((line, index) => (
          <div key={`${index}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-words">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
