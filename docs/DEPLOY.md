# 求职助手 — 安装部署上线教程

> 适用版本：v1.1 云会员分离版  
> 阅读对象：运营者（你）+ 最终用户

---

## 一、整体架构

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  用户电脑（安装包）            │  HTTPS  │  云服务器（你只部署一次）        │
│  JobAssistant-Setup.exe     │ ──────► │  https://member.你的域名.com   │
│                             │  会员/  │                              │
│  · SQLite 自动创建           │  登录   │  · MySQL 用户/会员/订单         │
│  · 岗位 / 简历 / 插件数据     │         │  · /wsp 运营后台               │
│  · http://127.0.0.1:8000    │         │  · 收款码 / 一键开通会员         │
└─────────────────────────────┘         └──────────────────────────────┘
```

| 角色 | 做什么 | 需要什么 |
|------|--------|----------|
| **你（运营者）** | 部署云会员服务、打包安装包、管会员 | 云服务器 + 域名 + MySQL |
| **用户** | 双击安装包，登录买会员，用插件抓岗位 | 只需 Windows + Edge，**不用装 MySQL** |

---

## 二、上线前准备清单

### 2.1 云服务器

- 系统：推荐 **Ubuntu 22.04** 或 CentOS 7+
- 配置：2 核 2G 起即可（会员服务很轻）
- 开放端口：**80、443**（安全组/防火墙）

### 2.2 域名

- 准备一个子域名，例如：`member.example.com`
- 在域名 DNS 添加 **A 记录** 指向云服务器公网 IP

### 2.3 HTTPS 证书

- 推荐用 **Let's Encrypt**（免费），下面用 `certbot` 自动申请

### 2.4 MySQL

- 云服务器本机 MySQL，或云数据库（阿里云 RDS 等）均可

### 2.5 本机开发环境（打包用）

- Windows 10/11
- 已安装：Python 3.10+、Node.js 18+、Git（可选）
- 项目根目录执行过 `.\scripts\install.ps1`

---

## 三、第一步：部署会员云（你先做）

### 3.1 在本机构建云端产物

```powershell
cd C:\Users\13982\Desktop\自动投递简历项目
.\scripts\build-cloud.ps1
```

产物目录：`dist\cloud-release\`（含 `api/`、`web/`、`.env.example`）

### 3.2 上传到云服务器

```bash
# 本机（PowerShell 有 scp 时）
scp -r dist\cloud-release\* root@你的服务器IP:/opt/job-assistant/

# 或服务器上 git clone 后只替换 api、web
```

### 3.3 配置云端 `.env`

```bash
ssh root@你的服务器IP
cd /opt/job-assistant
cp .env.example .env
nano .env
```

**必须修改的项：**

```env
DEPLOYMENT_ROLE=cloud
DB_BACKEND=mysql

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=job_assistant
MYSQL_PASSWORD=你的强密码
MYSQL_DATABASE=job_assistant

PUBLIC_BASE_URL=https://member.example.com
LOCAL_APP_URL=http://127.0.0.1:8000

JWT_SECRET=随机字符串至少32位
LICENSE_ADMIN_SECRET=运营后台密钥自己记好

AUTH_ENABLED=true
PAYMENT_MODE=personal_qr
PAYMENT_MOCK=false
PAYMENT_PERSONAL_QR=true

API_HOST=0.0.0.0
API_PORT=8000
```

**生成随机密钥（Linux）：**

```bash
openssl rand -hex 32
```

### 3.4 创建 MySQL 数据库

```bash
mysql -u root -p
```

```sql
CREATE DATABASE job_assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'job_assistant'@'localhost' IDENTIFIED BY '你的强密码';
GRANT ALL PRIVILEGES ON job_assistant.* TO 'job_assistant'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3.5 安装依赖并试跑

```bash
cd /opt/job-assistant
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt

uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
```

另开终端测试：

```bash
curl http://127.0.0.1:8000/health
```

### 3.6 配置 Nginx + HTTPS

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

复制项目里的 `deploy/nginx.conf.example` 到 `/etc/nginx/sites-available/job-assistant`，把 `member.example.com` 改成你的域名。

```bash
ln -s /etc/nginx/sites-available/job-assistant /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d member.example.com
```

### 3.7 配置开机自启

复制 `deploy/job-assistant-cloud.service.example` 到 `/etc/systemd/system/job-assistant-cloud.service`，按需改路径。

```bash
chown -R www-data:www-data /opt/job-assistant
systemctl daemon-reload
systemctl enable job-assistant-cloud
systemctl start job-assistant-cloud
```

### 3.8 验证云端

| 检查项 | 地址 | 预期 |
|--------|------|------|
| 健康检查 | `https://member.example.com/health` | 正常 JSON |
| 运营后台 | `https://member.example.com/wsp` | 输入密钥进入 |
| 根路径 | `https://member.example.com/` | 提示会员云服务运行中 |

### 3.9 运营后台首次配置

1. 打开 `https://member.example.com/wsp`
2. 输入 `LICENSE_ADMIN_SECRET`（**只粘贴等号后面的值**）
3. 上传微信、支付宝收款码
4. 用户付款后在「待处理订单」确认，或 **一键开通会员**

---

## 四、第二步：打包用户安装包

```powershell
.\scripts\build-user-installer.ps1 -CloudApiUrl https://member.example.com
```

**只发这一个文件给用户：** `dist\JobAssistant-Setup.exe`

---

## 五、用户安装与使用

### 安装

1. 双击 `JobAssistant-Setup.exe`
2. 选择安装位置 → 下一步 → 安装 → 完成

### 使用

1. 桌面「求职助手」→ 一键启动 → 打开应用
2. 登录并购买会员
3. Edge 加载安装目录下的 `extension` 文件夹

---

## 六、微信 / 支付宝登录（正式上线建议配置）

### 微信

- 回调：`https://member.example.com/api/auth/wechat/callback`
- `.env`：`WECHAT_OAUTH_ENABLED=true` + AppID/Secret

### 支付宝

- 回调：`https://member.example.com/api/auth/alipay/callback`
- `.env`：`ALIPAY_OAUTH_ENABLED=true` + 密钥

修改后：`systemctl restart job-assistant-cloud`

---

## 七、推荐上线顺序

```
□ 1. 云服务器 + 域名解析
□ 2. MySQL 建库
□ 3. build-cloud.ps1 → 上传 → Nginx + HTTPS + systemd
□ 4. /wsp 上传收款码
□ 5. 配置 OAuth（或先 mock 内测）
□ 6. build-user-installer.ps1 打包
□ 7. 自己装一份全流程测试
□ 8. 分发 JobAssistant-Setup.exe
```

---

## 八、地址速查

| 谁 | 地址 |
|----|------|
| 用户本机 | `http://127.0.0.1:8000` |
| 运营后台 | `https://member.example.com/wsp` |
| 用户安装包 | `dist\JobAssistant-Setup.exe` |
