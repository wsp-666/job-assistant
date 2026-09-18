# 求职助手 — 全面部署方案（Xftp 8 + 宝塔，不用 Xshell）

> 云端只存：**登录 + 会员 + 订单**  
> 用户本机存：**岗位 + 简历 + 插件**（`JobAssistant-Setup.exe`）

---

## 一、架构说明

```
┌──────────────────────────────┐
│ 用户电脑                      │
│ JobAssistant-Setup.exe       │
│ SQLite：岗位/简历/话术        │
│ http://127.0.0.1:8000        │
└──────────────┬───────────────┘
               │ HTTPS 仅会员/登录
               ▼
┌──────────────────────────────┐
│ 腾讯云 + 宝塔面板             │
│ https://member.你的域名.com  │
│ MySQL：用户/会员/订单/OAuth   │
│ /wsp 运营后台（仅你使用）      │
└──────────────────────────────┘
```

**云上不放**用户岗位、简历等业务数据。

---

## 二、工具分工（只用两个）

| 工具 | 用途 | 你需要做的 |
|------|------|-----------|
| **Xftp 8** | SFTP 上传文件、编辑 `.env` | 传 `api/`、`web/`、配置文件 |
| **宝塔面板** | 建库、Python 项目、Nginx、SSL、终端 | 浏览器里点选 + 偶尔用「终端」 |

> 全程**不需要 Xshell**。需要敲命令时，用宝塔里的 **终端** 即可。

---

## 三、上线前准备

### 3.1 腾讯云

| 项 | 建议 |
|----|------|
| 配置 | 2核2G 起 |
| 系统 | Ubuntu 22.04 |
| 安全组 | 放行 `22`、`80`、`443`、`8888` |

### 3.2 域名

DNS 添加 A 记录：

```
member.你的域名.com  →  服务器公网 IP
```

### 3.3 本机 Windows

- 已安装 Node.js、Python（项目里跑过 `install.ps1`）
- Xftp 8 能连上服务器（SFTP，端口 22）

### 3.4 安装宝塔（首次，无 Xshell 的三种方式）

**方式 A（推荐）**：买腾讯云轻量时选 **「宝塔面板」应用镜像**，开机即有面板地址。

**方式 B**：腾讯云控制台 → 你的服务器 → **登录** → **OrcaTerm / 网页终端**，粘贴宝塔官方安装命令（仅执行一次）：

```bash
wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec
```

**方式 C**：已让服务商装好宝塔，直接向对方要面板地址、账号、密码。

记下：

```
面板地址：http://你的IP:8888/xxxx
用户名 / 密码
```

### 3.5 宝塔软件商店安装

登录宝塔 → **软件商店** → 安装：

| 软件 | 必须 |
|------|------|
| Nginx | ✅ |
| MySQL 5.7 或 8.0 | ✅ |
| Python 项目管理器 | ✅（没有则装 Supervisor） |

不必装 PHP、Apache。

---

## 四、Xftp 8 配置（独立使用，不依赖 Xshell）

### 4.1 新建会话

打开 Xftp → **文件 → 新建**（或 `Ctrl+N`）

| 项 | 填写 |
|----|------|
| 名称 | `腾讯云-求职助手` |
| 协议 | **SFTP** |
| 主机 | 服务器公网 IP |
| 端口 | `22` |
| 用户名 | `root`（或宝塔 SSH 用户） |
| 密码 | 腾讯云服务器密码 |
| 方法 | Password |

保存 → 双击连接。

> 若弹出免费许可注册：填**姓名 + 邮箱**（不是服务器密码）。官网验证链接 403 可忽略，能连上 SFTP 即可。

### 4.2 界面习惯

```
左侧 = 本机 Windows
右侧 = 服务器 Linux
拖拽 = 上传 / 下载
F5   = 刷新
```

### 4.3 在服务器上建目录（Xftp 即可）

1. 右侧进入 `/www/wwwroot/`
2. 右键 → **新建文件夹** → 输入 `job-assistant`
3. 双击进入该文件夹

最终路径：`/www/wwwroot/job-assistant/`

---

## 五、本机构建云端包

PowerShell：

```powershell
cd C:\Users\13982\Desktop\自动投递简历项目
.\scripts\build-cloud.ps1
```

产物（待上传）：

```
dist\cloud-release\
├── api\
│   ├── app\              # 后端代码（仅会员/登录相关路由在云上启用）
│   └── requirements.txt
├── web\                  # 运营后台 /wsp、登录页 /login
└── .env.example          # 配置模板
```

---

## 六、Xftp 上传（第一次全量）

1. **左侧**进入：`C:\Users\13982\Desktop\自动投递简历项目\dist\cloud-release\`
2. **右侧**进入：`/www/wwwroot/job-assistant/`
3. 选中以下内容，拖到右侧：
   - 文件夹 `api`
   - 文件夹 `web`
   - 文件 `.env.example`
4. 等待上传完成（`api` 和 `web` 可能需几分钟）

上传后右侧结构：

```
/www/wwwroot/job-assistant/
├── api/
├── web/
└── .env.example
```

---

## 七、宝塔：创建 MySQL 数据库

1. 宝塔 → **数据库** → **添加数据库**

| 项 | 值 |
|----|-----|
| 数据库名 | `job_assistant` |
| 用户名 | `job_assistant` |
| 密码 | 自己设强密码（复制保存） |
| 访问权限 | 本地服务器 |

2. 字符集：**utf8mb4**

---

## 八、配置 `.env`（Xftp 或宝塔二选一）

### 方式 A：Xftp 编辑（推荐）

1. 右侧找到 `.env.example`
2. 右键 → **复制** → 粘贴为 `.env`（或下载到本机改名后再上传）
3. 右键 `.env` → **编辑**（或用记事本改完再上传覆盖）

### 方式 B：宝塔在线编辑

**文件** → `/www/wwwroot/job-assistant/` → 复制 `.env.example` 为 `.env` → 点 **编辑**

### `.env` 完整示例（改成你的真实值）

```env
DEPLOYMENT_ROLE=cloud
DB_BACKEND=mysql

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=job_assistant
MYSQL_PASSWORD=宝塔里建库时的密码
MYSQL_DATABASE=job_assistant

PUBLIC_BASE_URL=https://member.你的域名.com
LOCAL_APP_URL=http://127.0.0.1:8000

JWT_SECRET=随机32位字符串
LICENSE_ADMIN_SECRET=运营后台密钥请自己保存

AUTH_ENABLED=true
PAYMENT_MODE=personal_qr
PAYMENT_MOCK=false
PAYMENT_PERSONAL_QR=true

WECHAT_OAUTH_ENABLED=false
WECHAT_APP_ID=
WECHAT_APP_SECRET=

ALIPAY_OAUTH_ENABLED=false
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_ALIPAY_PUBLIC_KEY=

API_HOST=127.0.0.1
API_PORT=8000
```

**JWT_SECRET 生成**：宝塔 → **终端** → 执行：

```bash
openssl rand -hex 32
```

复制输出填到 `.env`。

---

## 九、宝塔：安装 Python 依赖

### 9.1 打开宝塔终端

宝塔左侧 **终端**（或 **文件** 页面上方终端按钮）

### 9.2 执行（复制粘贴）

```bash
cd /www/wwwroot/job-assistant
python3 --version
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

无报错即成功。

### 9.3 试跑（可选）

仍在宝塔终端：

```bash
cd /www/wwwroot/job-assistant
source .venv/bin/activate
uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
```

另开浏览器访问（仅服务器本机可测时）或先跳过，直接配 Python 项目管理器。

按 `Ctrl+C` 停止试跑。

---

## 十、宝塔：Python 项目常驻（核心）

1. **软件商店** → 确认已装 **Python 项目管理器**
2. 打开 **Python 项目管理器** → **添加项目**

| 配置项 | 填写 |
|--------|------|
| 项目名称 | `job-assistant` |
| 项目路径 | `/www/wwwroot/job-assistant` |
| Python 版本 | 3.10 或以上 |
| 框架 | 选「其他」或「FastAPI」 |
| 启动方式 | 自定义 / 命令行 |
| 启动命令 | 见下方 |
| 端口 | `8000` |
| 开机启动 | 开启 |

**启动命令（整行复制）：**

```bash
/www/wwwroot/job-assistant/.venv/bin/uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
```

3. 保存 → 点击 **启动**
4. 状态应为 **运行中**；点 **日志** 看有无报错

> 若项目管理器支持「安装模块」，也可在项目里填 `api/requirements.txt` 一键安装，省掉第九步手动 pip。

---

## 十一、宝塔：添加网站 + 反向代理

FastAPI 会同时提供 API 和 `web/` 前端，**整站反代到 8000** 即可。

### 11.1 添加站点

**网站** → **添加站点**

| 项 | 值 |
|----|-----|
| 域名 | `member.你的域名.com` |
| 根目录 | `/www/wwwroot/job-assistant` |
| FTP、数据库 | 不创建 |
| PHP | 不安装 / 纯静态 |

### 11.2 反向代理

站点 → **设置** → **反向代理** → **添加反向代理**

| 项 | 值 |
|----|-----|
| 代理名称 | `job-assistant` |
| 目标 URL | `http://127.0.0.1:8000` |
| 发送域名 | `$host` |

**关闭** 代理缓存。

### 11.3 若 502，检查 Nginx 配置

站点 **设置** → **配置文件**，`location /` 应类似：

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

保存后 Nginx 会自动重载。

---

## 十二、宝塔：HTTPS 证书

1. 站点 **设置** → **SSL**
2. **Let's Encrypt**
3. 勾选 `member.你的域名.com`
4. **申请**
5. 开启 **强制 HTTPS**

---

## 十三、验证云端上线

用浏览器访问（不用 Xshell）：

| 检查项 | 地址 | 预期 |
|--------|------|------|
| 健康检查 | `https://member.你的域名.com/health` | 返回 JSON，`deployment_role: cloud` |
| 运营后台 | `https://member.你的域名.com/wsp` | 密钥输入页 |
| 首页 | `https://member.你的域名.com/` | 提示会员云服务运行中 |

### 运营后台首次操作

1. 打开 `/wsp`
2. 输入 `LICENSE_ADMIN_SECRET`（**只填等号后面的值**）
3. 上传微信、支付宝**个人收款码**
4. 用户付款后在后台 **确认订单** 或 **一键开通会员**

---

## 十四、打包用户本机安装包

云端可用后，本机 PowerShell：

```powershell
.\scripts\build-user-installer.ps1 -CloudApiUrl https://member.你的域名.com
```

分发给用户：**仅** `dist\JobAssistant-Setup.exe`

用户安装后：

- 岗位、简历 → 本机 SQLite
- 登录、会员 → 自动连你的云

---

## 十五、日常更新（Xftp + 宝塔）

```
① 本机   .\scripts\build-cloud.ps1
② Xftp   覆盖上传 api/ 和/或 web/ 到 /www/wwwroot/job-assistant/
③ 宝塔   Python 项目管理器 → 重启 job-assistant
④ 浏览器 访问 /health 和 /wsp 确认
```

| 改了什么 | Xftp 上传 | 宝塔操作 |
|----------|-----------|----------|
| 后端逻辑 | `api/` | 重启 Python 项目 |
| 运营后台 UI | `web/` | 重启 + 浏览器强刷 Ctrl+F5 |
| 仅改 `.env` | `.env` | 重启 Python 项目 |

---

## 十六、微信 / 支付宝登录（正式环境）

在 `.env` 配置后，Xftp 上传覆盖 `.env`，宝塔重启 Python 项目。

| 平台 | 开放平台回调地址 |
|------|------------------|
| 微信 | `https://member.你的域名.com/api/auth/wechat/callback` |
| 支付宝 | `https://member.你的域名.com/api/auth/alipay/callback` |

内测阶段可设 `PAYMENT_MOCK=true`，用户可走模拟登录。

---

## 十七、常见问题（无 Xshell 版）

| 现象 | 处理 |
|------|------|
| Xftp 连不上 | 腾讯云安全组放行 22；确认 SFTP 协议 |
| Xftp 注册窗关不掉 | 能传文件就先用；或改用宝塔「文件→上传」 |
| 502 Bad Gateway | 宝塔 → Python 项目是否运行；看项目日志 |
| 数据库连接失败 | `.env` 密码与宝塔数据库一致 |
| /wsp 白屏 | Xftp 检查 `web/` 是否上传完整；重启 Python 项目 |
| pip 安装慢 | 宝塔终端加清华源（见第九步） |
| 外网无法访问 | 安全组 80/443 + 宝塔防火墙放行 |
| OAuth 登录后没跳回本机 | `.env` 中 `LOCAL_APP_URL=http://127.0.0.1:8000` |

### 看日志（全在宝塔）

- **Python 项目** → 日志
- **网站** → 日志 → 错误日志
- **终端** → `tail -f /www/wwwlogs/你的域名.error.log`

---

## 十八、完整 Checklist

```
□ 腾讯云服务器 + 安全组 22/80/443/8888
□ 域名 A 记录解析
□ 宝塔已安装，Nginx + MySQL + Python 管理器已装
□ 本机 build-cloud.ps1 成功
□ Xftp 上传 api、web、.env 到 /www/wwwroot/job-assistant/
□ 宝塔创建数据库 job_assistant
□ .env 填好 PUBLIC_BASE_URL、数据库、JWT、LICENSE_ADMIN_SECRET
□ 宝塔终端 pip install 完成
□ Python 项目已启动，端口 8000
□ 网站反向代理到 127.0.0.1:8000
□ SSL 已申请并强制 HTTPS
□ /health、/wsp 浏览器可访问
□ /wsp 上传收款码
□ build-user-installer.ps1 打出安装包
□ 本机安装测试：登录 → 买会员 → 抓岗位
```

---

## 十九、地址速查

| 用途 | 地址 |
|------|------|
| 宝塔面板 | `http://服务器IP:8888` |
| 会员云 API | `https://member.你的域名.com` |
| 运营后台 | `https://member.你的域名.com/wsp` |
| 用户本机软件 | `http://127.0.0.1:8000` |
| 用户安装包 | `dist\JobAssistant-Setup.exe` |
| 服务器项目目录 | `/www/wwwroot/job-assistant/` |
