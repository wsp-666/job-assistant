import { Link } from "react-router-dom";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-blue-50 px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-2xl font-bold text-white shadow-lg shadow-blue-500/30">
            职
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/90 p-8 shadow-xl shadow-slate-200/60 backdrop-blur-sm">
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}

        <p className="mt-4 text-center text-xs text-slate-400">
          <Link to="/" className="hover:text-blue-600 hover:underline">
            返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}
