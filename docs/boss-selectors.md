# BOSS 直聘页面选择器

页面结构可能变化，失效时优先更新此文件与 `apps/extension/src/content/boss.ts`。

## 岗位详情页

| 字段 | 选择器（按优先级） |
|------|-------------------|
| 岗位名称 | `.job-name`, `.job-title`, `h1.name` |
| 公司名称 | `.company-name a`, `.company-name` |
| 薪资 | `.salary`, `.job-primary .red` |
| 城市 | `.text-city`, `.job-primary .text-address` |
| JD 正文 | `.job-sec-text`, `.detail-content` |
| HR 姓名 | `.boss-info-attr .name`, `.boss-name` |

## 岗位列表（自动投递 / 爬取）

| 用途 | 策略 |
|------|------|
| 岗位卡片 | 含 `a[href*="job_detail"]` 的 `li` / `.job-card-wrapper` / `.job-card-box` |
| **列表直抓** | 从当前选中卡片读岗位名、公司、薪资、城市、标签，**无需进入详情页 URL** |
| 下一岗位 | 按索引点击卡片，列表触底时滚动 `.job-list-box` 等容器 |
| 立即沟通 | 按钮文案：`立即沟通`、`继续沟通`、`聊一聊` |
| 发送 | 按钮文案：`发送` |

列表卡片字段选择器：`.job-name`、`.company-name`、`.salary`、`.job-area`、`.tag-list`

## 反爬说明（薪资方框 / JD 混入 CSS）

BOSS 直聘常见反爬：

| 现象 | 原因 | 处理策略 |
|------|------|----------|
| 薪资显示 `□□□-□□□元/天` | 自定义字体把数字映射到 Unicode 私有区，DOM `textContent` 是乱码 | 优先调页面内 `detail.json` API 取明文 `salaryDesc`；乱码则丢弃 |
| JD 开头有 `.xxx{display:none}` 等 | 页面注入隐藏噪声文本与 `<style>` | 克隆节点时剔除 `style/script` 与隐藏元素，并过滤 CSS 片段 |
| 公司显示「未知公司」 | 详情区选择器未命中且 DOM 公司名为空 | 从 API / 内嵌 JSON 读 `brandName` |

实现见 `apps/extension/src/content/boss-extract.ts`。改插件后需在 `edge://extensions` **重新加载**并刷新 BOSS 页面后重新抓取。

## 聊天/沟通页

| 字段 | 选择器 |
|------|--------|
| 输入框 | `textarea.input-area`, `textarea[class*='input']`, `div[contenteditable='true']` |

## 自动投递说明

侧边栏「自动投递」流程：切换列表岗位 → **优先从左侧卡片抓取**（右侧有 JD 则合并）→ 匹配打分 → 生成话术 → 点击立即沟通 → 填入话术 →（可选）自动发送。

- **推荐页面**：BOSS 职位搜索/推荐页，左侧岗位列表 + 右侧详情
- **自动发送**默认关闭，开启后会自动点击「发送」，存在封号风险，请谨慎使用
- BOSS 页面改版后若失效，需更新 `boss-automation.ts` 中的选择器
