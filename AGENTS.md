# AI 项目协作说明

这是“求职助手”完整源码。开始修改前，请先阅读 `README.md` 和 `docs/PROJECT-HANDOFF.md`，再按当前任务检查相关代码。

## 主要目录

- `apps/api`：FastAPI、SQLAlchemy、SQLite 业务服务与测试。
- `apps/web`：React + TypeScript + Vite 管理台。
- `apps/extension`：Edge Manifest V3 浏览器扩展。
- `scripts`：安装、启动、构建和交付脚本。
- `docs`：架构、使用、发布与交接文档。

## 工作规则

- 保留使用者已有修改；不要为了完成单个需求重置整个仓库。
- `data`、`.env`、数据库、简历和密钥属于使用者个人数据，不要提交或打进源码交付包。
- 修改后至少运行受影响模块的测试或构建；网页修改应执行 `npm run build`。
- 投递工作台字段需要同时核对前端类型、API schema、数据库模型和迁移兼容逻辑。
- 保持最终投递、验证码和登录步骤由用户本人确认，不自动绕过网站限制。

## 常用验证

```powershell
cd apps\api
..\..\.venv\Scripts\python.exe -m unittest discover -s tests -v

cd ..\web
npx tsc --noEmit
npm run build

cd ..\extension
npx tsc --noEmit
npm run build
```

## 交付

- 用户安装包：`scripts/build-user-installer.ps1`
- 朋友源码交付包：`scripts/build-friend-delivery.ps1`
- 安装包升级时递增 `scripts/job-assistant-user.iss` 中的 `MyAppVersion`。

