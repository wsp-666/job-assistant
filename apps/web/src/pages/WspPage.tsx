import { Link } from "react-router-dom";

import { CLOUD_API_BASE, cloudWspUrl } from "../utils/apiUrl";

import WspPortal from "./WspPortal";

export default function WspPage() {
  if (CLOUD_API_BASE && typeof window !== "undefined") {
    const here = window.location.origin;
    const cloud = CLOUD_API_BASE.replace(/\/$/, "");
    if (!here.startsWith(cloud) && cloud !== here) {
      return (
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
          <div className="card space-y-4 text-center">
            <h2 className="text-xl font-bold text-slate-900">运营后台在云端</h2>
            <p className="text-sm text-slate-600">
              会员与收款管理部署在云服务器，本机只存岗位和简历数据。
            </p>
            <a href={cloudWspUrl()} className="btn-primary inline-block" target="_blank" rel="noreferrer">
              打开云端运营后台
            </a>
            <p>
              <Link to="/" className="text-sm text-blue-600 hover:underline">
                返回用户端
              </Link>
            </p>
          </div>
        </div>
      );
    }
  }

  return <WspPortal />;
}
