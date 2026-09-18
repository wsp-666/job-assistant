# 求职助手 — 最新部署方案（你的环境）

> 更新：2026-07-09  
> 服务器 IP：`124.220.48.21`（无域名）  
> 工具：Xftp 8 + 宝塔（不用 Xshell、不用 PHP）

---

## 架构

```
用户电脑 JobAssistant-Setup.exe     云服务器 124.220.48.21
─────────────────────────────      ─────────────────────────
SQLite：岗位/简历/插件              MySQL：会员/登录/订单
http://127.0.0.1:8000    ──HTTP──►  http://124.220.48.21
                                   /wsp 运营后台（仅你）
```

---

## 一、本机已打好包（直接用）

| 文件 | 路径 |
|------|------|
| **ZIP（推荐）** | `dist\cloud-release-124.220.48.21.zip` |
| 文件夹 | `dist\cloud-release\` |

内含：`api/`、`web/`、`.env`、`DEPLOY-README.txt`

重新打包（改代码后）：

```powershell
cd C:\Users\13982\Desktop\自动投递简历项目
.\scripts\build-cloud.ps1
```

---

## 二、宝塔软件（只装这 3 个）

| 软件 | 装不装 |
|------|--------|
| **Nginx** | ✅ |
| **MySQL 8.0 或 5.7** | ✅ |
| **Python 项目管理器** | ✅ |
| PHP（任意版本） | ❌ 不装 |
| Apache | ❌ 不装 |

腾讯云安全组放行：`22`、`80`、`443`、`8888`

---

## 三、MySQL（你已配置）

| 项 | 值 |
|----|-----|
| 数据库名 | `job_assistant` |
| 用户名 | `job_assistant` |
| 密码 | `123456` |
| 字符集 | `utf8mb4` |
| 访问权限 | 本地服务器 |

---

## 四、Xftp 上传

### 连接

| 项 | 值 |
|----|-----|
| 协议 | SFTP |
| 主机 | `124.220.48.21` |
| 端口 | 22 |
| 用户 | root |
| 密码 | 腾讯云服务器密码 |

### 上传

1. 右侧进入 `/www/wwwroot/`，新建 `job-assistant`
2. 左侧打开 `dist\cloud-release\`
3. 上传：`api`、`web`、`.env`（及 `DEPLOY-README.txt` 可选）

或上传 ZIP 后在宝塔 **文件** 里解压到 `job-assistant`。

---

## 五、服务器 `.env`（已预填，核对即可）

路径：`/www/wwwroot/job-assistant/.env`

```env
DEPLOYMENT_ROLE=cloud
DB_BACKEND=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=job_assistant
MYSQL_PASSWORD=123456
MYSQL_DATABASE=job_assistant

PUBLIC_BASE_URL=http://124.220.48.21
LOCAL_APP_URL=http://127.0.0.1:8000

AUTH_ENABLED=true
JWT_SECRET=17bce75ac1c9ae4a76780578fe73b7ed1b96e4f84de60014e200e786f64d5fd9
LICENSE_ADMIN_SECRET=Jc300GgF8VnxlVIvJituS_b7

PAYMENT_MODE=personal_qr
PAYMENT_MOCK=false
PAYMENT_PERSONAL_QR=true

WECHAT_OAUTH_ENABLED=false
ALIPAY_OAUTH_ENABLED=false

API_HOST=127.0.0.1
API_PORT=8000
```

Xftp 编辑 `.env`，确认 `MYSQL_PASSWORD=123456` 与宝塔一致。

---

## 六、宝塔终端 — 安装 Python 依赖

宝塔左侧 **终端**，粘贴执行：

```bash
cd /www/wwwroot/job-assistant
python3 --version
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

无红色报错即成功。

---

## 七、Python 项目管理器

**软件商店** → **Python项目管理器** → **添加项目**

| 配置项 | 值 |
|--------|-----|
| 项目名称 | `job-assistant` |
| 项目路径 | `/www/wwwroot/job-assistant` |
| Python 版本 | 3.10+ |
| 启动命令 | 见下方 |
| 端口 | `8000` |
| 开机启动 | 开 |

**启动命令（整行复制）：**

```
/www/wwwroot/job-assistant/.venv/bin/uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
```

保存 → **启动** → 状态应为「运行中」。

---

## 八、添加网站 + 反向代理

### 8.1 添加站点

**网站** → **添加站点**

| 项 | 值 |
|----|-----|
| 域名 | `124.220.48.21` |
| 根目录 | `/www/wwwroot/job-assistant` |
| PHP | 不创建 |
| 数据库 | 不创建 |

### 8.2 反向代理

站点 **设置** → **反向代理** → **添加**

| 项 | 值 |
|----|-----|
| 代理名称 | `job-assistant` |
| 目标 URL | `http://127.0.0.1:8000` |

关闭缓存 → 保存。

---

## 九、验证

浏览器访问：

| 地址 | 预期 |
|------|------|
| http://124.220.48.21/health | JSON，`deployment_role: cloud` |
| http://124.220.48.21/wsp | 运营后台登录页 |
| http://124.220.48.21/ | 提示会员云服务 |

### 运营后台

1. 打开 http://124.220.48.21/wsp
2. 密钥（只粘贴值）：`Jc300GgF8VnxlVIvJituS_b7`
3. 上传微信/支付宝收款码
4. 用户付款后确认订单或一键开通会员

---

## 十、用户安装包（云端跑通后）

本机 PowerShell：

```powershell
.\scripts\build-user-installer.ps1 -CloudApiUrl http://124.220.48.21
```

分发：`dist\JobAssistant-Setup.exe`（用户双击安装，岗位简历在本地）

---

## 十一、日常更新

```
1. 本机  .\scripts\build-cloud.ps1
2. Xftp  覆盖 api/、web/ 到服务器
3. 宝塔  Python 项目 → 重启
4. 访问  http://124.220.48.21/health
```

---

## 十二、常见问题

| 现象 | 处理 |
|------|------|
| 502 | Python 项目未启动，看项目管理器日志 |
| 数据库连不上 | `.env` 密码与宝塔一致 |
| /wsp 白屏 | 检查 `web/` 是否上传完整 |
| 外网打不开 | 安全组 + 宝塔防火墙放行 80 |
| 要装 PHP 吗 | **不用** |

---

## 十三、Checklist

```
□ Nginx + MySQL + Python管理器 已装
□ 数据库 job_assistant 已建（密码 123456）
□ Xftp 已上传 api、web、.env
□ 宝塔终端 pip install 成功
□ Python 项目运行中（8000）
□ 网站 124.220.48.21 反代到 8000
□ /health 和 /wsp 可访问
□ /wsp 上传收款码
□ （可选）build-user-installer.ps1 打用户安装包
```
