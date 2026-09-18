# 求职助手 — 上线部署说明（v1.1 云会员分离版）

> **完整教程见：**
> - [**最新部署方案（你的 IP + 宝塔 + Xftp）**](./DEPLOY-NOW.md) ← **当前用这个**
> - [Xftp + 宝塔全面部署](./DEPLOY-XFTP-BAOTA.md)
> - [安装部署上线教程](./DEPLOY.md)（命令行版）

## 架构

```
用户电脑（本机）                    云服务器（你只部署一次）
─────────────────                  ─────────────────────
SQLite 自动创建                     MySQL
岗位 / 简历 / 插件数据               用户 / 会员 / 订单
http://127.0.0.1:8000              https://会员云域名
无需配置数据库                       /wsp 运营后台
```

**普通用户**：安装即用，SQLite 自动创建，**不用装 MySQL**。  
**你（运营者）**：在云服务器部署会员服务，本机 `.env` 填 `CLOUD_API_URL` 指向云端。

---

## 一、部署会员云（你先做）

1. 上传代码到云服务器  
2. 复制 `.env.cloud.example` → `.env` 并填写 MySQL、域名、密钥  
3. 启动 API：`DEPLOYMENT_ROLE=cloud`  
4. 运营后台：`https://你的域名/wsp`  
5. 上传收款码、管理会员  

云服务器 `.env` 关键项：

```env
DEPLOYMENT_ROLE=cloud
DB_BACKEND=mysql
PUBLIC_BASE_URL=https://你的会员云域名
LOCAL_APP_URL=http://127.0.0.1:8000
JWT_SECRET=随机长字符串
LICENSE_ADMIN_SECRET=随机长字符串
PAYMENT_MOCK=false
```

---

## 二、打包用户本机版（一键安装包）

```powershell
.\scripts\build-user-installer.ps1 -CloudApiUrl https://你的会员云域名
```

**分发给用户的只有一个文件**：`dist\JobAssistant-Setup.exe`

用户安装流程：
1. 双击 `JobAssistant-Setup.exe`
2. 选择安装位置 → 下一步 → 安装
3. 完成（可选：创建桌面快捷方式、立即启动）

无需解压 ZIP、无需运行 bat、无需手动配置。

用户**不需要**配置 MySQL。

---

## 三、用户上手流程

1. 解压 release，双击启动  
2. 浏览器打开 `http://127.0.0.1:8000`  
3. 微信/支付宝登录（走云端）  
4. 设置 → 购买会员（走云端）  
5. 抓岗位、管简历（全在本机 SQLite）  

---

## 四、地址一览

| 谁 | 地址 |
|----|------|
| 用户 | `http://127.0.0.1:8000/` |
| 你管会员 | `https://会员云域名/wsp` |

---

## 五、开发内测（不连云）

`.env` 不填 `CLOUD_API_URL`，`PAYMENT_MOCK=true`：登录和会员全在本地 SQLite 测。
