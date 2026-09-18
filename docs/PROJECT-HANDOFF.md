# 求职助手 — 项目交接文档



> **用途**：新开对话时先读本文，即可了解项目背景、架构、近期改动、打包部署与待办。  

> **最后更新**：2026-08-31（2.0 投递工作台、优先级队列、通用网申填写、支付状态机与测试）



---



## 0. 新对话怎么开始（复制即用）



```

请先阅读 docs/PROJECT-HANDOFF.md，然后帮我 [具体任务]

```



或：



```

继续求职助手项目，交接文档在 docs/PROJECT-HANDOFF.md

```



---



## 1. 项目是什么



**求职助手**：Edge 浏览器插件 + 本机 API + Web 管理台，在 BOSS 直聘读取 JD、结合简历 AI 生成打招呼语并填入输入框（默认不自动发送）。



**架构（本地求职数据 + 云会员分离版 v2.0）**：



```

用户电脑（本机安装包）              云服务器（运营者部署一次）

─────────────────────              ─────────────────────────

SQLite：岗位/简历/插件数据          MySQL：用户/会员/订单

http://127.0.0.1:8000              http://124.220.48.21（当前 IP）

  ├─ API + 管理台静态页同端口        邮箱注册登录、会员购买

Edge 插件                          /wsp 运营后台

无需 MySQL

```



| 角色 | 说明 |

|------|------|

| **普通用户** | 安装 `JobAssistant-Setup.exe`，SQLite 自动创建，**不需 Python/MySQL** |

| **开发者/运营** | 云服务器跑会员 API；`CLOUD_API_URL` 指向云端 |



> **安装版管理台地址是 `http://127.0.0.1:8000`，不是开发时的 5173。** 5173 仅 `npm run dev` 开发 Web 时使用。



---



## 2. 2026-07-12 ~ 07-13 会话改动摘要（重要）



本节记录最近一轮对话中已落地的改动，新对话请勿重复踩坑。



### 2.1 用户安装包体积：298 MB → ~40 MB



| 项目 | 改前 | 改后 |

|------|------|------|

| `Setup.exe` | ~298 MB | **~40 MB** |

| staging `runtime/base-python` | ~1250 MB（误拷整个 Conda `Library\bin`） | **~33 MB** |



**根因**：`scripts/repair-portable-runtime.ps1` 曾把 Conda 的 MKL/Qt/grpc 等数百个 DLL 全拷进 `base-python`。



**已修复**：

- 只复制 Python 必需 DLL（ssl、zlib、ffi 等白名单）

- stdlib 去掉 `idlelib/test/tkinter` 等

- 新增 `scripts/prune-user-runtime.ps1`：打包时去掉 pip/setuptools/wheel

- 缓存 key 含 `repair-portable-runtime.ps1` 的 hash，脚本变更会强制重建 runtime



### 2.2 覆盖安装 runtime 残留（启动报 Conda 路径错）



**现象**：装了新版 Setup，但 `runtime/pyvenv.cfg` 仍指向 `D:\download\conda`，缺 `base-python`，启动器报「运行环境配置无效」。



**原因**：Inno 覆盖安装时 `runtime/` 未完全替换。



**已修复**（`scripts/job-assistant-user.iss`）：

- `[InstallDelete]` 安装前删除 `{app}\runtime` 整目录

- `CloseApplications=force` 尽量关闭占用进程

- 安装后 `RewritePortablePyvenvCfg` 把 `home` 写成 `{app}\runtime\base-python`

- **检测到已有安装时弹窗**：「覆盖安装前请先关闭求职助手启动器」

- `scripts/launcher.py`：若 `base-python` 存在但 `pyvenv.cfg` 路径错，尝试自动修复



**推荐升级流程**（不必先卸载）：

1. 关闭「求职助手」启动器

2. 双击新版 `JobAssistant-Setup.exe` 覆盖安装

3. 仍失败再卸载重装



**临时修复脚本**（开发机救急）：`scripts/fix-local-install.ps1`



### 2.3 打包脚本在 CMD 里运行会打开记事本



**现象**：双击或在 **cmd** 里跑 `.\scripts\build-user-installer.ps1`，弹出记事本而非打包。



**原因**：Windows 对 `.ps1` 默认是「编辑」不是「执行」。



**正确方式**（三选一）：

```powershell

# PowerShell（提示符 PS C:\...>）

.\scripts\build-user-installer.ps1



# 或双击 BAT（会开 CMD 窗口）

.\scripts\build-user-installer.bat



# 或在 CMD 里

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-user-installer.ps1

```



### 2.4 Edge 插件：点击图标直接打开主面板



**改前**：manifest 有 `default_popup` → 只出小弹窗，需再点「打开侧边栏」；且侧边栏仅在 BOSS 页 load 完后 enable，常「点了没反应」。



**改后**：

- 去掉 `action.default_popup`，删除 `apps/extension/src/popup/`

- `background/index.ts`：`chrome.action.onClicked` → 先 `enableSidePanelForTab` 再 `open`

- 侧边栏顶部增加「使用前请确认」清单（API、BOSS 页、点击图标）

- 管理台链接改为 **`http://127.0.0.1:8000/jobs`**（原错误 5173）



**用户操作**：Edge `edge://extensions` → **重新加载**插件；不要在 `edge://extensions` 页点图标测试，切到普通网页再点。



### 2.5 文档与代码同步（7/13）



已更新：`README.md`、`docs/用户使用手册.md`、`QuickStartGuide.tsx`、`scripts/installer-user-readme.txt`  

已简化：`scripts/sync-web-dist.mjs` / `.ps1`（不再同步废弃的 `release/` 等目录）



---



## 3. 目录结构（关键路径）



| 用途 | 路径 |

|------|------|

| 源码 API | `apps/api/` |

| 源码 Web | `apps/web/` |

| 源码插件 | `apps/extension/` |

| 启动器源码 | `scripts/launcher.py` |

| **推荐打包入口** | `scripts/build-user-installer.bat` |

| 打包 PowerShell | `scripts/build-user-installer.ps1` |

| Inno Setup | `scripts/job-assistant-user.iss` |

| Runtime 便携化 | `scripts/repair-portable-runtime.ps1` |

| Runtime 瘦身 | `scripts/prune-user-runtime.ps1` |

| 云端打包 | `scripts/build-cloud.ps1` → `dist/cloud-release/` |

| **安装包产物** | `dist/JobAssistant-Setup.exe`（~40 MB） |

| 打包 staging | `dist/user-installer-staging/` |

| Runtime 构建缓存 | `dist/cached-user-runtime/`（可删，下次打包会重建） |

| 云端 URL | `scripts/deploy-cloud-url.txt` → `http://124.220.48.21` |

| 清理构建产物 | `scripts/clean-artifacts.ps1`（含 cached-user-runtime） |



**用户安装目录**（例：`%LOCALAPPDATA%\Programs\求职助手`）：



```

{app}/

  api/                 # FastAPI 源码

  web/                 # 管理台静态文件（8000 端口提供）

  runtime/

    base-python/       # 便携 Python（必需）

    Scripts/python.exe

    pyvenv.cfg         # home 应指向 ...\runtime\base-python

  extension/           # Edge 插件（加载此文件夹）

  JobAssistant/        # 启动器 JobAssistant.exe

  data/                # SQLite、日志、简历（升级不删）

  .env

  诊断启动问题.bat

  修复运行环境.bat

  使用说明.txt

```



---



## 4. 常用命令



### 4.1 开发环境



```powershell

cd "C:\Users\13982\Desktop\自动投递简历项目"

.\scripts\install.ps1     # 初始化 .venv + npm

.\scripts\start.ps1       # 开发启动（API 8000 + Web 5173）

```



### 4.2 打用户安装包（发给测试者）



```powershell

.\scripts\build-user-installer.bat

# 或

.\scripts\build-user-installer.ps1 -CloudApiUrl http://124.220.48.21

```



产物：**仅发** `dist\JobAssistant-Setup.exe`



步骤 `[1/6]`~`[6/6]`：web build → extension build → launcher → staging（含 runtime）→ Inno 压缩



**验证 staging runtime**：



```powershell

cd dist\user-installer-staging\api

..\runtime\Scripts\python.exe -c "import app.main; import uvicorn; print('ok')"

```



### 4.3 打云端包



```powershell

.\scripts\build-cloud.ps1

# 上传 dist/cloud-release/ 到服务器

```



### 4.4 云端启动（宝塔）



```bash

cd /www/wwwroot/job-assistant

/opt/job-assistant-venv/bin/uvicorn app.main:app \

  --app-dir /www/wwwroot/job-assistant/api \

  --host 127.0.0.1 --port 8000

```



---



## 5. 历史已修复问题（仍 relevant）



| 问题 | 要点 |

|------|------|

| 邮箱验证码 SMTP 550 | `email_service.py` From 头须与 SMTP_USER 一致；云端要重新 `build-cloud.ps1` 上传 |

| 云端 502 | 宝塔 `--app-dir` 路径错误 |

| 插件「请先登录」 | Web `localStorage` 与插件 `chrome.storage` 需同步；在 8000 登录后重载插件 |

| Conda 路径启动失败 | 见 §2.2；必须新版包 + 关闭启动器后覆盖安装 |

| 快速上手页功能介绍 | `QuickStartGuide.tsx` 四卡片 |



---



## 6. 常见问题 FAQ



### Q: 覆盖安装前要做什么？



**先关闭「求职助手」启动器**，再运行 Setup.exe。会删除并重装整个 `runtime/`，**不删** `data/`。不必先卸载。



### Q: 打包弹出 txt / 记事本？



- **记事本打开 `.ps1`**：在 cmd 里误运行脚本 → 用 §2.3 正确方式

- **Cursor 打开标签**：`.env.production`、`build-version.txt` 等被 IDE 自动打开 → 关掉即可



### Q: 启动器报「运行环境配置无效 / 指向不存在的 Python 路径」？



1. 看 `{app}\runtime\pyvenv.cfg` 的 `home` 是否为 `{app}\runtime\base-python`

2. 看是否存在 `runtime\base-python\python.exe`

3. 若无 `base-python`：关启动器 → 新版 Setup 覆盖安装

4. 有 `base-python` 但 cfg 错：运行「修复运行环境.bat」



### Q: 插件点了没反应？



1. Edge 114+；`edge://extensions` 重新加载插件

2. 不要在 `edge://extensions` 页面点图标

3. 确认用的是去掉 popup 后的新版 extension dist



### Q: 插件 API 未连接？



启动器「一键启动」→ 访问 `http://127.0.0.1:8000/health` 应 `{"status":"ok"}` → 在 8000 登录



### Q: `build-user-installer` 报 `Edit scripts\deploy-cloud-url.txt`？



填写 `scripts/deploy-cloud-url.txt` 或 `-CloudApiUrl http://...`



### Q: 安装包还能再小吗？



主要占用：`pymupdf` ~43MB（PDF 简历）、`python-docx` 等。去掉 PDF 支持可再减，需产品决策。



---



## 7. 环境信息（开发者机器）



| 项 | 值 |

|----|-----|

| OS | Windows 10/11 |

| Python | Conda `D:\download\conda`（**仅开发机**；用户包不得依赖） |

| 项目 venv | `.venv/`，打包时用它创建 runtime |

| 插件 manifest 版本 | 1.1.1 |

| Inno AppVersion | 1.1.0（与 manifest 略不一致，可下次打包时对齐） |

| 云端 | `http://124.220.48.21` |



---



## 8. 待办 / 下一步



- [ ] **重新打包** `JobAssistant-Setup.exe` 并给测试者（含 runtime 瘦身 + 插件 + 升级提示 + readme）

- [ ] 测试机完整流程：安装 → 启动 → 8000 登录 → 重载插件 → BOSS 页生成话术

- [ ] 打包脚本增加验证：`import app.main; import fitz`（pymupdf），避免干净 Windows 缺 DLL

- [ ] 确认云端已部署最新 `email_service.py`

- [ ] （可选）Inno `AppVersion` 与 extension manifest 版本对齐



---



## 9. 相关文档索引



| 文档 | 内容 |

|------|------|

| **`docs/PROJECT-HANDOFF.md`** | **本文 — 新对话必读** |

| `docs/用户使用手册.md` | 面向最终用户（已同步 8000、插件直开） |

| `docs/DEPLOY-NOW.md` | 宝塔 + Xftp 云端部署 |

| `docs/RELEASE.md` | 上线架构与打包概览 |

| `README.md` | 开发者快速开始 |

| `scripts/installer-user-readme.txt` | 安装包内「使用说明.txt」源文件 |



---



## 10. 给 AI 的上下文提示（可选粘贴）



若新对话要立刻接手排查，可补充：



```

- 安装包约 40MB，runtime 含 base-python，覆盖安装会删 runtime 不删 data

- 用户管理台 http://127.0.0.1:8000（不是 5173）

- 插件无 popup，action.onClicked 开 side panel

- 打包用 build-user-installer.bat，勿在 cmd 直接跑 .ps1

- 云端 http://124.220.48.21，本地 CLOUD_API_URL 在安装包 .env

```


