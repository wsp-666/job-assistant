const API_BASE = import.meta.env.VITE_API_BASE || "";
export const CLOUD_API_BASE = (import.meta.env.VITE_CLOUD_API_URL as string) || "";

export function apiUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

export function cloudWspUrl() {
  const base = CLOUD_API_BASE || API_BASE;
  return `${base.replace(/\/$/, "")}/wsp`;
}

export function adminApiUrl(path: string) {
  const base = (CLOUD_API_BASE || API_BASE).replace(/\/$/, "");
  if (!path) return base;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${base}${path}`;
}

export { API_BASE };