import ApiProfilesManager from "../components/ApiProfilesManager";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">设置</h2>
        <p className="text-slate-500">本地模式与 API 配置</p>
      </div>

      {/* 账号与会员模块暂时停用，组件源码保留，恢复云端模式时重新挂载。 */}
      <div className="card border-green-200 bg-green-50">
        <h3 className="font-semibold text-green-900">本地免登录模式</h3>
        <p className="mt-1 text-sm text-green-800">岗位、简历、投递进度和 API 配置保存在本机，无需注册账号或开通会员。</p>
      </div>

      <div className="card">
        <ApiProfilesManager />
      </div>
    </div>
  );
}
