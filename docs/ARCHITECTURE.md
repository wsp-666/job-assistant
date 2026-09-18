# 求职助手 2.0 架构说明

## 1. 系统边界

项目按“个人求职数据留在本机、账户与会员可独立上云”拆分：

| 运行角色 | 数据 | 路由 | 存储 |
|---|---|---|---|
| `local` | 简历、岗位、匹配分、投递进度、自动投递队列、AI 设置 | 简历/岗位/投递/招聘源/设置 API | SQLite（默认） |
| `cloud` | 用户、登录、会员、订单、运营管理 | 认证/会员/支付 API | MySQL |

本机配置 `CLOUD_API_URL` 后，认证与会员请求经本机代理转发到云端；岗位和简历不会因此上传。

## 2. 模块职责

```text
React 管理台
  ├─ 岗位池 / 招聘源 / 简历 / 目标岗位
  └─ 投递工作台（进度导入、表格、看板、日历、队列控制）
          │ localhost window message + ACK
Edge 扩展  │
  ├─ background：标签页、侧边栏、队列唤醒、BOSS 标签关联
  ├─ sidepanel：持久队列执行与人工接管
  ├─ boss content：BOSS 采集、聊天打开、话术填写/发送
  └─ generic content：登录识别、语义字段映射、附件上传、提交信号检测
          │ HTTP :8000
FastAPI
  ├─ routers：协议、校验、序列化
  ├─ services：状态机、匹配、AI、支付、解析、抓取
  ├─ models：SQLAlchemy 数据模型
  └─ core：配置、数据库与手工兼容迁移
```

## 3. 投递状态模型

岗位只有一个规范阶段字段 `jobs.status`：

```text
待评估 → 准备材料 → 待投递 → 已沟通 → 已投递
                                   ├→ 笔试 → 面试 → 终面 → Offer → 入职
                                   └→ 未通过 / 已撤回 / 岗位关闭 / 不考虑
```

`job_pipeline.py` 是唯一的状态同步入口，并兼容旧字段：

- 到达“已投递”及以后时同步 `has_applied_resume` 和 `applied_at`。
- 到达面试阶段时同步 `interview_round`。
- 到达 Offer/入职/未通过时同步 `offer_status`。
- 每次状态或详情变化写入 `application_events`，供工作台时间线使用。

优先级内部存为 1–5，对外显示为 P0–P4；队列排序固定为优先级升序、匹配分降序、更新时间降序。

求职进度导入由 `application_import.py` 负责：支持 `.xlsx`、CSV/TSV 和 JSON，统一中英文表头与中文阶段名称；岗位链接是第一去重键，“公司 + 岗位”是兜底键。导入采用非破坏合并，空白单元格不覆盖已有字段，每次实际变更写入 `application_events`。

## 4. 自动投递队列

### 队列状态

`running`、`paused`、`waiting_login`、`waiting_confirmation`、`completed`、`cancelled`。

### 子任务状态

```text
queued → opening → filling → ready_to_submit → submitting → succeeded
                  ├→ waiting_login ───────────────┘
                  └→ failed / skipped / cancelled
```

队列和子任务写入 SQLite，不依赖前端内存。插件关闭或浏览器刷新后，重新打开侧边栏会从当前非终态任务恢复。非法状态跳转由后端返回 409，避免重复提交或把未提交任务记为成功。

通用网申执行顺序：

1. 按优先级取得下一条任务并打开岗位链接。
2. 检测登录页；登录、验证码和滑块交给用户，队列进入 `waiting_login`。
3. 获取统一投递资料，按 label/name/placeholder/aria-label/autocomplete 语义映射原生表单字段。
4. 不覆盖已有值；尝试上传默认 PDF/Word；列出剩余必填项。
5. 可以自动进入“下一步”；默认在最终提交前进入 `waiting_confirmation`。
6. 高风险自动提交只点击明确包含提交语义的按钮，并检查成功文案或成功 URL；无法验证时仍进入人工确认。

## 5. 主要数据表

| 表 | 作用 |
|---|---|
| `jobs` | 岗位主体、匹配分、阶段、优先级、跟进与面试字段 |
| `application_events` | 岗位变更审计时间线 |
| `application_queues` | 一轮投递配置与总体进度 |
| `application_tasks` | 队列内每个岗位的执行状态、错误和结果 |
| `resumes` | 简历解析结果与原文件位置 |
| `settings` | 本机设置与统一投递资料 |
| `users` / `user_memberships` | 云端账户与会员 |
| `payment_orders` | 支付订单状态、有效期、付款申报与确认来源 |

当前项目通过 `create_all` 加幂等列迁移兼容已有 SQLite/MySQL 数据。后续多人协作或频繁演进时，应迁移到 Alembic 版本化迁移。

## 6. 支付状态模型

```text
pending ─→ user_paid ─→ paid
   │            └────→ rejected
   ├→ cancelled
   └→ expired
```

- 创建前验证支付模式和对应收款码，避免产生不可支付订单。
- 待付款订单 30 分钟后惰性过期；刷新页面可恢复未结束订单。
- 用户必须提供付款识别信息后才能进入 `user_paid`。
- 管理员只能确认 `user_paid`；确认过程幂等，重复请求不会重复赠送会员。
- `mock` 必须同时设置 `PAYMENT_MODE=mock` 和 `PAYMENT_MOCK=true`。
- `merchant` 在官方下单、签名和回调未实现前明确禁用，不使用伪链接。

## 7. 安全与隐私

- `.env`、数据库、简历、收款码、运行日志、依赖与构建产物不进入 Git。
- 扩展不读取或保存第三方网站密码，网站登录态仍由浏览器维护。
- 管理密钥使用常量时间比较；云端弱 JWT/管理密钥会阻止启动。
- 收款码上传限制大小并校验真实文件签名，使用临时文件原子替换。
- API 返回基础安全响应头；认证使用 Bearer token，不启用跨域 Cookie 凭证。
- 本机 API 仅允许本机页面和 Chromium 扩展来源跨域访问，避免普通网站读取投递资料与简历文件。

## 8. 验证基线

- 后端：`python -m unittest discover -s tests -v`
- Web：`npx tsc --noEmit`、`npm run build`
- 扩展：`npx tsc --noEmit`、`npm run build`
- 数据库：临时 SQLite 初始化和支付完整状态流测试
