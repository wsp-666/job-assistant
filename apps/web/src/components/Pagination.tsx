interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  const pages: number[] = [];
  const windowSize = 5;
  let from = Math.max(1, safePage - Math.floor(windowSize / 2));
  const to = Math.min(totalPages, from + windowSize - 1);
  from = Math.max(1, to - windowSize + 1);
  for (let i = from; i <= to; i += 1) {
    pages.push(i);
  }

  if (total === 0) {
    return <p className="text-sm text-slate-500">共 0 条</p>;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        共 {total} 条，显示 {start}-{end}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <select
            className="input w-28 text-sm"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                每页 {size} 条
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-sm"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          上一页
        </button>
        {pages.map((num) => (
          <button
            key={num}
            type="button"
            className={`rounded px-3 py-1.5 text-sm ${
              num === safePage
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            onClick={() => onPageChange(num)}
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-sm"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
