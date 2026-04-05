# Admin System 仪表盘功能说明

## 1. 文档目的

本文档用于完整说明 `admin-system` 后台管理端仪表盘（`/`，`DashboardPage`）当前实现的功能范围、交互行为、数据来源、实时机制和已知限制，便于产品、测试和研发对齐。

---

## 2. 页面定位与访问条件

- 页面路由：`/`
- 页面组件：`admin-system/src/pages/dashboard/DashboardPage.tsx`
- 布局容器：`MainLayout`（左侧导航 + 顶部栏 + 内容区）
- 访问控制：通过 `ProtectedAdminRoute` 保护，仅认证且角色包含 `admin` 或 `superadmin` 才可访问
- 未满足权限时：重定向到 `/login`

---

## 3. 页面总体结构

仪表盘采用左右分栏布局：

- 左侧主区（核心业务看板）
  - 平台健康概览（KPI + 迷你趋势图）
  - AI 公司列表与健康监控（卡片/表格双视图）
  - 快捷入口与分析（跳转与占位分析模块）
- 右侧边栏（告警中心）
  - 全局风险与告警流
  - 告警处理弹窗
  - 告警分页与统计占位

---

## 4. 功能清单（按模块）

## 4.1 平台健康概览

### 4.1.1 KPI 看板（支持拖拽布局）

使用 `DashboardGridDnD` 渲染，支持持久化布局（`storageKey = admin_dashboard_kpi_layout_v1`）。

默认展示 6 个 KPI：

1. 活跃 AI 公司数
2. 进行中任务（`in_progress + pending`）
3. 在线/活跃 Agent 数
4. 今日 Token 消耗/费用
5. 预算使用率
6. 系统健康度（近似）

### 4.1.2 顶部操作

- `Refresh`：刷新告警列表（`alertsApi.list`）
- `View: Cards/Table`：切换公司监控区展示形态

### 4.1.3 趋势图（Mini Charts）

展示 4 组趋势：

- Token 消耗 24h（近似）
- Token 消耗 7d（近似）
- AI 公司创建趋势（近似）
- 自治完成率（近似）

说明：若后端未返回平台时间序列，则使用 `makeFakeSeries` 生成占位趋势数据。

---

## 4.2 AI 公司列表与健康监控

### 4.2.1 搜索与分页

- 支持关键词搜索：`Search company / CEO...`
- 当前页状态：`page`
- 固定每页数量：`pageSize = 8`
- 支持 `Prev/Next` 翻页

### 4.2.2 双视图

- 卡片视图（默认）：展示公司画像 + 风险标签 + 指标 + 操作按钮
- 表格视图：紧凑展示公司状态、预算、堆积、Agent、风险和操作

### 4.2.3 公司健康信号

系统对每家公司计算风险标签：

- 预算风险（必有）
  - `预算超支`
  - `预算即将超支`
  - `预算健康`
  - `未知`
- 任务堆积风险（条件展示）
  - `任务堆积严重`
  - `任务堆积预警`
  - 低风险不展示（降噪）
- Agent 活跃异常（条件展示）
  - `Agent活跃度异常（近似）`
  - 低风险不展示（降噪）

### 4.2.4 卡片展示指标

每个公司卡片展示：

- 基础信息：名称、slug、行业、状态
- 关键指标：进行中、待处理、Agent 活跃/总量、自治效率
- 预算模块：预算使用率进度条、风险文案、币种、超期数量

### 4.2.5 公司操作入口（当前实现状态）

卡片/表格中的操作按钮包括：

- 查看详情（当前为 `alert` 占位）
- 强制暂停（TODO，后端未接）
- 恢复（TODO，后端未接）
- 模拟群聊（TODO）
- 导出（TODO）

说明：这些按钮已提供交互入口，但多数是占位行为，非完整业务闭环。

---

## 4.3 快捷入口与分析区

### 4.3.1 快捷入口

包含 5 个快捷动作：

1. 创建新 AI 公司模板（TODO）
2. Agent 商城管理（跳转 `/marketplace`）
3. 模板市场审核（TODO）
4. 全局模型路由配置（跳转 `/settings`）
5. 平台定价与计费策略（跳转 `/settings`）

### 4.3.2 分析卡片

- Top 待处理（MVP）：基于 pending 排序取前 5
- 模型/自治分布（TODO）
- 常见瓶颈 Top（TODO）

---

## 4.4 全局风险与告警中心（右侧）

### 4.4.1 告警流展示

按时间倒序展示告警项，包含：

- 严重级别（`low/medium/high`）
- 类型（`type`）
- 时间（`createdAt`）
- 消息内容（`message`）
- 标签（company/agent）
- 状态（open/resolved）

### 4.4.2 告警处理

- 对 `open` 告警提供“已处理”按钮
- 点击后弹出处理弹窗，可填写备注
- 提交后调用：`PATCH /admin/alerts/:id/resolve`
- 完成后刷新列表

### 4.4.3 告警分页

- 支持 `Prev/Next`
- 默认每页 `20`

### 4.4.4 告警统计占位

当前有两个占位卡：

- 今日告警数（TODO）
- 解决率（TODO）

---

## 5. 实时能力（Socket.IO）

## 5.1 连接策略

- 连接命名空间：`/admin-notify`
- 鉴权：通过 `authSession.getAccessToken()` 传 token
- 传输方式：websocket
- 网关地址策略：
  - 若当前端口不是 `3002`，默认拼到 `:3002`
  - 否则使用当前 `origin`

## 5.2 订阅与事件

- 连接成功后，按当前页公司 ID 发送 `alerts:subscribe`
- 监听事件：
  - `alerts:new`：新增或更新告警（插入到列表头部，最多保留 20）
  - `alerts:resolved`：将对应告警项状态更新为已处理

## 5.3 生命周期处理

- 页面卸载时移除监听并断开连接，避免内存泄漏/重复订阅

---

## 6. 数据来源与接口映射

## 6.1 公司与看板数据

- `GET /v1/companies`：公司分页列表
- `GET /v1/dashboard?companyId=...`：公司汇总（任务、组织、Agent、账单聚合）
- `GET /v1/dashboard/billing?companyId=...`：公司预算/计费摘要
- `POST /admin/dashboard/platform-overview`：平台总览聚合（若不可用则前端本地近似计算）

## 6.2 告警数据

- `GET /admin/alerts`：告警列表
- `PATCH /admin/alerts/:id/resolve`：告警处理

## 6.3 鉴权来源

- `authSession` 中的 `accessToken` 用于接口请求与 Socket 连接鉴权

---

## 7. 状态管理与前端逻辑特征

- 主要使用 React Hooks 本地状态（`useState/useEffect/useMemo/useRef`）
- 页面级状态包括：
  - 公司列表、公司摘要、计费摘要
  - 平台总览
  - 告警列表及错误状态
  - 视图模式、搜索词、分页
  - 告警处理弹窗状态
  - Socket 连接状态
- 关键策略：
  - 公司列表更新后，再批量并发拉取当前页公司健康数据
  - 平台总览优先后端聚合，失败回退前端近似聚合
  - 错误统一收敛到 `alertsError` 或对应模块错误框

---

## 8. 异常与容错行为

- 接口失败时：
  - 展示错误提示 `error-box`
  - 部分模块回退为空或占位数据，不阻塞整页渲染
- 平台总览失败时：
  - 回退到前端根据当前页公司数据估算
- 无数据场景：
  - 公司区显示 `Loading...` 或空态
  - 告警区显示 `暂无告警`

---

## 9. 已实现 vs 待实现（MVP 现状）

## 9.1 已实现

- 页面主框架与模块分区
- KPI 与趋势图展示
- 公司列表搜索/分页/双视图
- 风险标签计算与展示
- 告警列表、处理、分页
- Socket 实时告警接入
- 部分快捷入口跳转

## 9.2 待实现 / 占位

- 公司操作按钮（详情、强制暂停、恢复、模拟群聊、导出）多数仅占位
- 多个分析卡片为 TODO
- 告警统计卡（今日告警数、解决率）为 TODO
- 迷你趋势图在缺少后端时序接口时仍为近似数据

---

## 10. 测试建议（供 QA）

- 权限测试：非 admin/superadmin 应跳转登录页
- 数据链路测试：列表、公司摘要、预算摘要、平台总览分别可用/不可用时的退化表现
- 搜索与分页：公司列表翻页、搜索、视图切换一致性
- 告警链路：
  - 拉取列表
  - 告警处理弹窗输入备注并提交
  - 处理后状态变更
- 实时测试：
  - 新告警推送插入
  - 已处理推送刷新对应项
  - 切换公司页后订阅公司 ID 更新
- 边界测试：
  - 无公司、无告警、后端慢响应、网络抖动

---

## 11. 关联文件

- 页面实现：`admin-system/src/pages/dashboard/DashboardPage.tsx`
- 路由：`admin-system/src/modules/app/App.tsx`
- 布局：`admin-system/src/layouts/MainLayout.tsx`
- 权限：`admin-system/src/modules/auth/ProtectedRoute.tsx`
- API：
  - `admin-system/src/services/dashboardApi.ts`
  - `admin-system/src/services/alertsApi.ts`
  - `admin-system/src/services/authSession.ts`
