import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import PaymentQrAdmin from "../components/PaymentQrAdmin";

const WSP_SECRET_KEY = "ja_wsp_secret";
const WSP_UNLOCK_KEY = "ja_wsp_unlocked";

function normalizeAdminSecret(raw: string) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^LICENSE_ADMIN_SECRET\s*=\s*(.+)$/i);
  return (match ? match[1] : trimmed).trim();
}

export default function WspPortal() {
  const [secret, setSecret] = useState(() => sessionStorage.getItem(WSP_SECRET_KEY) || "");
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(WSP_UNLOCK_KEY) === "1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!secret.trim() || !unlocked) return;
    sessionStorage.setItem(WSP_SECRET_KEY, secret.trim());
  }, [secret, unlocked]);

  const unlock = async () => {
    const normalized = normalizeAdminSecret(secret);
    if (!normalized) {
      setError("请输入运营密钥");
      return;
    }
    setSecret(normalized);
    setLoading(true);
    setError("");
    try {
      await api.getAdminQrStatus(normalized);
      sessionStorage.setItem(WSP_SECRET_KEY, normalized);
      sessionStorage.setItem(WSP_UNLOCK_KEY, "1");
      setUnlocked(true);
    } catch (e) {
      sessionStorage.removeItem(WSP_UNLOCK_KEY);
      setUnlocked(false);
      const msg = e instanceof Error ? e.message : "验证失败";
      setError(
        msg.includes("管理员密钥错误")
          ? "密钥错误：请只粘贴 LICENSE_ADMIN_SECRET 等号后面的值"
          : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  const lock = () => {
    sessionStorage.removeItem(WSP_UNLOCK_KEY);
    setUnlocked(false);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">运营后台</h1>
            <p className="text-xs text-slate-500">会员与收款管理（云端）</p>
          </div>
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            返回用户端
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {!unlocked ? (
          <div className="card mx-auto max-w-md space-y-4">
            <h2 className="text-xl font-bold text-slate-900">运营验证</h2>
            <p className="text-sm text-slate-500">输入 `LICENSE_ADMIN_SECRET` 等号后面的值。</p>
            <div>
              <label className="label">运营密钥</label>
              <input
                className="input"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="只粘贴等号后面的密钥值"
                onKeyDown={(e) => {
                  if (e.key === "Enter") unlock();
                }}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="button" className="btn-primary w-full" disabled={loading} onClick={unlock}>
              进入后台
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button type="button" className="btn-secondary text-sm" onClick={lock}>
                锁定后台
              </button>
            </div>
            <div className="card">
              <PaymentQrAdmin initialSecret={secret} onSecretChange={setSecret} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
