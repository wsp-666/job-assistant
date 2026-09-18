# 求职助手 — 腾讯云宝塔部署教程（最新）

> 适用：会员云服务（FastAPI + Vue）部署到宝塔面板  
> 用户本机仍用 `JobAssistant-Setup.exe`，不在宝塔部署

---

## 架构

```
用户电脑 JobAssistant-Setup.exe
        │ HTTPS（会员/登录）
        ▼
腾讯云 CVM + 宝塔面板
  https://member.你的域名.com
    ├── /api/*     → FastAPI (127.0.0.1:8000)
    ├── /wsp       → 运营后台
    └── /login     → OAuth 回调页
  MySQL（宝塔安装）
```

**宝塔只做一件事**：跑会员云。岗位/简历在用户本机 SQLite。

---

## 工具分工（Xshell + Xftp + 宝塔）

你常用的三个工具这样配合：

| 工具 | 干什么 | 什么时候用 |
|------|--------|-----------|
| **Xshell 8** | SSH 连服务器、敲命令 | 装宝塔、装依赖、排错、重启服务 |
| **Xftp 8** | SFTP 传文件 | 上传 `api/`、`web/`、改 `.env` |
| **宝塔面板** | 图形化管理 | 建库、反代、SSL、Python 项目守护 |

```
本地 build-cloud.ps1
       │
       ▼
  Xftp 8 上传 ──────────► /www/wwwroot/job-assistant/
       │
       ▼
  Xshell 8 执行 ────────► pip install、试跑 curl
       │
       ▼
  宝塔面板 ─────────────► 建库、反代、SSL、Python 项目启动
```

### Xshell 8 新建会话

| 项 | 填写 |
|----|------|
| 协议 | SSH |
| 主机 | 腾讯云公网 IP |
| 端口 | 22 |
| 用户名 | root（或宝塔创建的用户） |
| 密码 | 服务器密码 |

连接后常用命令见下文各步骤。

### Xftp 8 与 Xshell 联动

1. Xshell 连上服务器后，菜单 **工具 → Xftp**（或 `Ctrl+Alt+F`）直接打开文件窗口
2. 左侧本地：`dist\cloud-release\`
3. 右侧服务器：`/www/wwwroot/job-assistant/`
4. 拖拽上传，覆盖即更新

> Xftp 协议选 **SFTP**，和 Xshell 用同一套账号密码。

---

## 一、腾讯云准备

### 1.1 购买云服务器

- 推荐：**2核2G**，系统 **Ubuntu 22.04** 或 **CentOS 7.9**
- 地域选离用户近的（如上海、广州）

### 1.2 安全组放行端口

腾讯云控制台 → 云服务器 → 安全组 → 入站规则：

| 端口 | 用途 |
|------|------|
| 22 | SSH |
| 80 | HTTP |
| 443 | HTTPS |
| 8888 | 宝塔面板（安装后可改） |

### 1.3 域名解析

腾讯云 DNSPod（或其他 DNS）添加 **A 记录**：

```
member.你的域名.com  →  服务器公网 IP
```

---

## 二、安装宝塔面板（用 Xshell）

**用 Xshell 8 连接服务器**，在终端执行（Ubuntu 22.04，以宝塔官网最新为准）：

```bash
wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec
```

安装完成后终端会显示：

```
外网面板地址: http://IP:8888/xxxxxxxx
用户名: xxxxx
密码: xxxxx
```

浏览器打开面板地址，登录并绑定宝塔账号。

### 宝塔里安装软件

进入 **软件商店**，安装：

| 软件 | 版本建议 |
|------|---------|
| **Nginx** | 1.22+ |
| **MySQL** | 5.7 或 8.0 |
| **Python项目管理器** | 最新版（若无则用 Supervisor） |

> 不必装 Apache。PHP 不必装。

---

## 三、本机构建云端产物

在 Windows 项目目录：

```powershell
cd C:\Users\13982\Desktop\自动投递简历项目
.\scripts\build-cloud.ps1
```

产物目录：

```
dist\cloud-release\
├── api\
│   ├── app\
│   └── requirements.txt
├── web\          # Vue 构建产物（/wsp 运营后台）
└── .env.example
```

---

## 四、上传到服务器（Xftp 8 推荐）

### 方式 A：Xftp 8 + Xshell（推荐，和你习惯一致）

1. **Xshell** 连上服务器
2. 先建目录（Xshell 终端）：

```bash
mkdir -p /www/wwwroot/job-assistant
```

3. **Xftp**：`工具 → Xftp` 或 `Ctrl+Alt+F`
4. 左侧：`C:\Users\13982\Desktop\自动投递简历项目\dist\cloud-release\`
5. 右侧：`/www/wwwroot/job-assistant/`
6. 选中 `api`、`web`、`.env.example`，拖到右侧上传

### 方式 B：宝塔文件管理

1. 面板 → **文件**
2. 进入 `/www/wwwroot/`
3. 新建文件夹 `job-assistant`
4. 点击 **上传**，把 `dist\cloud-release\` 里所有内容上传进去

最终服务器目录：

```
/www/wwwroot/job-assistant/
├── api/
├── web/
└── .env.example
```

### 方式 C：宝塔终端 + Git

```bash
cd /www/wwwroot
git clone 你的仓库 job-assistant
cd job-assistant
# 本机 build-cloud.ps1 后只上传 api、web 也行
```

---

## 五、配置 MySQL（宝塔图形界面）

1. 宝塔 → **数据库** → **添加数据库**

| 项 | 值 |
|----|-----|
| 数据库名 | `job_assistant` |
| 用户名 | `job_assistant` |
| 密码 | 强密码（记下来） |
| 访问权限 | 本地服务器 |

2. 字符集选 **utf8mb4**

---

## 六、配置 `.env`（Xftp 或宝塔文件）

**Xftp**：右侧找到 `/www/wwwroot/job-assistant/.env.example`，右键复制为 `.env`，双击用记事本编辑后保存上传。

或在 **宝塔 → 文件** 里在线编辑。

```env
DEPLOYMENT_ROLE=cloud
DB_BACKEND=mysql

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=job_assistant
MYSQL_PASSWORD=你在宝塔建的密码
MYSQL_DATABASE=job_assistant

PUBLIC_BASE_URL=https://member.你的域名.com
LOCAL_APP_URL=http://127.0.0.1:8000

JWT_SECRET=用下面命令生成的随机串
LICENSE_ADMIN_SECRET=运营后台密钥自己保存好

AUTH_ENABLED=true
PAYMENT_MODE=personal_qr
PAYMENT_MOCK=false
PAYMENT_PERSONAL_QR=true

API_HOST=127.0.0.1
API_PORT=8000
```

宝塔终端生成随机密钥（也可在 **Xshell** 里执行）：

```bash
openssl rand -hex 32
```

> **注意**：`API_HOST` 生产环境用 `127.0.0.1`，只让 Nginx 反代，不直接暴露 8000。

---

## 七、安装 Python 依赖并试跑（Xshell）

**Xshell** 连接服务器，执行：

```bash
cd /www/wwwroot/job-assistant

# 宝塔一般自带 python3，确认版本 >= 3.10
python3 --version

python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 试跑
uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
```

另开一个 **Xshell** 窗口测试：

```bash
curl http://127.0.0.1:8000/health
```

看到正常 JSON 后 `Ctrl+C` 停止，改常驻进程。

---

## 八、用宝塔托管 Python 进程（二选一）

### 方案 A：Python 项目管理器（推荐）

1. 软件商店 → 安装 **Python项目管理器**
2. 打开项目管理器 → **添加项目**

| 项 | 填写 |
|----|------|
| 项目名称 | `job-assistant` |
| 项目路径 | `/www/wwwroot/job-assistant` |
| Python 版本 | 3.10+ |
| 启动方式 | 命令行启动 |
| 启动命令 | `/www/wwwroot/job-assistant/.venv/bin/uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000` |
| 端口 | `8000` |

3. 保存 → **启动**

### 方案 B：Supervisor（Python 管理器没有时）

1. 软件商店安装 **Supervisor管理器**
2. 添加守护进程：

```ini
[program:job-assistant]
directory=/www/wwwroot/job-assistant
command=/www/wwwroot/job-assistant/.venv/bin/uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
autostart=true
autorestart=true
user=www
stdout_logfile=/www/wwwlogs/job-assistant.log
```

---

## 九、添加网站 + 反向代理（关键）

FastAPI 已内置托管 `web/` 静态文件，**整站反代到 8000 即可**，不用单独配前端目录。

### 9.1 添加站点

宝塔 → **网站** → **添加站点**

| 项 | 值 |
|----|-----|
| 域名 | `member.你的域名.com` |
| 根目录 | `/www/wwwroot/job-assistant`（随意，反代后不用作静态） |
| PHP | **纯静态** 或 **不创建 PHP** |
| 数据库 | 不创建 |

### 9.2 配置反向代理

1. 点站点 → **设置** → **反向代理** → **添加反向代理**

| 项 | 值 |
|----|-----|
| 代理名称 | `job-api` |
| 目标 URL | `http://127.0.0.1:8000` |
| 发送域名 | `$host` |
| 内容替换 | 不填 |

2. 开启 **缓存** 关闭（API 不要缓存）

3. 若默认配置不生效，点 **配置文件**，确保 `location /` 类似：

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

4. 保存 → Nginx 重载

---

## 十、配置 HTTPS（宝塔一键）

1. 站点设置 → **SSL**
2. 选 **Let's Encrypt**
3. 勾选域名 `member.你的域名.com`
4. 点 **申请**
5. 开启 **强制 HTTPS**

---

## 十一、验证上线

| 检查 | 地址 | 预期 |
|------|------|------|
| 健康检查 | `https://member.你的域名.com/health` | JSON 正常 |
| 运营后台 | `https://member.你的域名.com/wsp` | 密钥登录页 |
| 根路径 | `https://member.你的域名.com/` | 提示会员云服务 |

### 运营后台首次配置

1. 打开 `/wsp`
2. 输入 `LICENSE_ADMIN_SECRET`（**只填等号后面的值**）
3. 上传微信/支付宝收款码
4. 用户付款后确认订单或一键开通会员

---

## 十二、打包用户安装包

云域名可用后，本机执行：

```powershell
.\scripts\build-user-installer.ps1 -CloudApiUrl https://member.你的域名.com
```

分发：`dist\JobAssistant-Setup.exe`

---

## 十三、日常更新流程（Xshell + Xftp + 宝塔）

```
1. 本机  .\scripts\build-cloud.ps1
2. Xftp  覆盖上传 api/ 和 web/ 到 /www/wwwroot/job-assistant/
3. 宝塔  Python项目管理器 → 重启
   或 Xshell: 若用手动 uvicorn，先 kill 再启动
4. Xshell: curl http://127.0.0.1:8000/health
5. 浏览器验证 /wsp
```

### 只改后端

Xftp 上传 `api/` → 宝塔重启 Python 项目

### 只改前端

Xftp 上传 `web/` → 浏览器 Ctrl+F5

### Xshell 常用排错命令

```bash
# 看 8000 是否在监听
ss -lntp | grep 8000

# 看 Python 进程
ps aux | grep uvicorn

# 手动重启试跑（调试用）
cd /www/wwwroot/job-assistant
source .venv/bin/activate
uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000

# 看 Nginx 错误日志（宝塔路径）
tail -f /www/wwwlogs/member.你的域名.com.error.log
```

---

## 十四、微信 / 支付宝 OAuth

在 `.env` 配置后，宝塔重启 Python 项目：

| 平台 | 授权回调地址 |
|------|-------------|
| 微信 | `https://member.你的域名.com/api/auth/wechat/callback` |
| 支付宝 | `https://member.你的域名.com/api/auth/alipay/callback` |

内测可暂设 `PAYMENT_MOCK=true` 走模拟登录。

---

## 十五、常见问题（宝塔版）

| 问题 | 处理 |
|------|------|
| 502 Bad Gateway | Python 项目没启动；查项目管理器日志 |
| 外网打不开 | 腾讯云安全组 + 宝塔防火墙放行 80/443 |
| 数据库连不上 | `.env` 密码与宝塔数据库一致；`MYSQL_HOST=127.0.0.1` |
| /wsp 白屏 | `web/` 未上传或 Python 项目未重启 |
| pip 很慢 | 用清华源 `-i https://pypi.tuna.tsinghua.edu.cn/simple` |
| 8000 被占用 | 项目管理器改端口或 `lsof -i:8000` 查占用 |

### 宝塔防火墙

**安全** → **防火墙** → 放行 `80`、`443`、`8888`

---

## 十六、上线 Checklist

```
□ 腾讯云安全组放行 22/80/443/8888
□ 域名 A 记录指向服务器
□ 宝塔安装 Nginx + MySQL + Python管理器
□ build-cloud.ps1 构建并上传
□ 宝塔建库 job_assistant
□ 配置 .env（PUBLIC_BASE_URL、密钥、数据库）
□ Python 项目启动，curl 127.0.0.1:8000/health 通过
□ 站点反向代理到 8000
□ SSL 证书申请并强制 HTTPS
□ /wsp 上传收款码
□ build-user-installer.ps1 打包安装包
□ 本机安装测试全流程
```

---

## 地址速查

| 谁 | 地址 |
|----|------|
| 宝塔面板 | `http://服务器IP:8888` |
| 运营后台 | `https://member.你的域名.com/wsp` |
| 用户本机 | `http://127.0.0.1:8000`（安装包） |
| 用户安装包 | `dist\JobAssistant-Setup.exe` |
