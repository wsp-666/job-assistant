# 阿里云部署与会员制

详见 [RELEASE.md](./RELEASE.md) 完整上线说明。

## 运营后台地址

- 用户端：`https://你的域名/`
- **运营后台：`https://你的域名/wsp`**（不使用 `/admin`）

## 环境变量（`.env` 生产）

```env
AUTH_ENABLED=true
JWT_SECRET=随机长字符串至少32位
LICENSE_ADMIN_SECRET=随机长字符串
PUBLIC_BASE_URL=https://你的域名
DB_BACKEND=mysql
MYSQL_HOST=...
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=job_assistant

PAYMENT_MODE=personal_qr
PAYMENT_MOCK=false

WECHAT_OAUTH_ENABLED=true
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...

ALIPAY_OAUTH_ENABLED=true
ALIPAY_APP_ID=...
ALIPAY_PRIVATE_KEY=...
ALIPAY_ALIPAY_PUBLIC_KEY=...
```

## 用户流程

1. 打开网站 → 微信/支付宝登录
2. 设置 → 购买会员（扫码付款）
3. Edge 插件连接同一 API 域名

## 运营流程

1. 访问 `/wsp` → 输入 `LICENSE_ADMIN_SECRET`
2. 上传收款码、确认订单、手动开通会员

## 开发内测

`PAYMENT_MOCK=true` 时可用开发登录与模拟支付。
