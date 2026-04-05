# 项目已实现功能清单（实现侧代码梳理）

> **按业务域拆分的功能说明**（多租户、组织、Agent、协作、记忆、任务、计费等）见 [`docs/features/README.md`](../features/README.md)。本文档以 **HTTP 路由与部分 Worker 订阅** 的逐条列举为主，适合联调验收时对照。

本文档基于仓库 `apps/*` 的 NestJS 代码入口与各模块 Controller/Service/Listener 实现，对“当前项目落地了哪些功能”做一次实现层面的归纳总结。

> 说明：本文“实现/未实现”的判断以代码中实际暴露的入口（Controller 路由、消息订阅、核心 Service 逻辑）为准；部分业务处理函数内部可能仍包含 `TODO` 占位。

---

## 1. 仓库整体形态

- Monorepo：`pnpm-workspace.yaml` 指向 `apps/*`、`packages/*`、`packages/core/task`、`contracts/*`、`infrastructure/*`、`tooling/*`
- 核心服务（HTTP + 异步）：
  - `apps/api`：业务 API（文件/用户/认证/OAuth/健康/任务与运行记录等）
  - `apps/gateway`：API Gateway（鉴权、路由转发、管理接口、观测与安全中间件、`X-Run-Id` 生成与透传）
  - `apps/webhooks`：Webhook 配置管理与接收/转发
  - `apps/worker`：异步消息订阅处理（登录/用户事件等）+ **Temporal 触发的内部心跳入口**（见下文 M1）
  - `apps/temporal-worker`：Temporal 工作流与活动（公司心跳扇出等），通过 HTTP 调用现有 Worker/API
  - `apps/logging`：独立日志服务（接收、处理、存储、查询）
- Infra/治理：
  - `turbo`：构建与任务编排（根目录 `package.json`/`turbo.json`）
  - `typeorm` 迁移入口在根目录 scripts

---

## 2. `apps/api`：业务 API

### 2.1 全局运行能力

- 全局前缀：`/api`
- 全局参数校验：`ValidationPipe`（字段白名单/禁止未知字段/自动转换）
- 全局拦截器（实现：`apps/api/src/common/interceptors/*`）：
  - `LoggingInterceptor`：请求/响应日志
  - `TransformInterceptor`：响应转换
  - `TimeoutInterceptor`：超时控制
- Swagger：
  - 非生产环境且 `SWAGGER_ENABLED=true` 才启用

### 2.2 HTTP 路由（Controller）

`apps/api/src/health/health.controller.ts`
- `GET /api/health`：健康检查（包含数据库连接状态等）

`apps/api/src/modules/files/files.controller.ts`（文件管理，对象存储能力）
- `POST /api/files`：上传文件（`multipart/form-data`，`file` + 可选 `path/contentType/public/metadata`）
- `GET /api/files`：列出文件（`prefix/maxKeys/marker/recursive`）
- `GET /api/files/:path/url`：获取文件 URL（`expiresIn` 默认 3600 秒）
- `GET /api/files/:path/info`：获取文件信息
- `GET /api/files/:path`：下载文件（设置 `Content-Type` 与 `Content-Disposition`）
- `DELETE /api/files/:path`：删除文件

`apps/api/src/modules/users/users.controller.ts`（用户管理）
- `POST /api/users/register`：用户注册（`@Public()`）
- `POST /api/users`：创建用户（管理员角色，`@Roles('admin')`）
- `GET /api/users`：用户列表分页查询（支持筛选/搜索/包含 deleted 状态语义）
- `GET /api/users/:id`：查询单个用户
- `PATCH /api/users/:id`：更新用户
- `DELETE /api/users/:id`：删除用户（管理员角色，返回 `204`）

`apps/api/src/modules/auth/auth.controller.ts`（供网关调用的认证校验）
- `POST /api/auth/validate`：验证用户凭证（对 Gateway 的登录验证使用）

`apps/api/src/modules/oauth/oauth.controller.ts`（OAuth 第三方绑定）
- `POST /api/oauth/bind/:userId`：绑定第三方账号（通常由 Gateway 调用，鉴权要求由上层决定）
- `POST /api/oauth/find-or-create`：查找或创建用户（`@Public()`，用于登录回调流程）
- `GET /api/oauth/accounts/:userId`：获取用户第三方账号列表

### 2.3 文件存储适配器（实现：`apps/api/src/modules/files/storage/*`）

- `StorageModule` 按配置选择适配器：
  - `minio`（MinIO）
  - `s3`（AWS S3）
  - `oss`（阿里云 OSS）
  - `local`（本地文件系统）
- 统一能力接口（每个适配器实现）：
  - `upload` / `download` / `getUrl` / `delete`
  - `exists` / `getFileInfo` / `list`
- URL/签名：
  - S3/MinIO/OSS：实现预签名/签名 URL 或回退到公共 URL

### 2.4 中间件（工程基础能力）

在 `apps/api/src/app.module.ts` 中间件全路由挂载：
- `RequestIdMiddleware`：生成 `X-Request-Id`
- `LoggerMiddleware`：记录请求接收与完成
- `UserContextMiddleware`：从网关注入的头解析用户信息填充 `req.user`
- 测试开关：
  - 当 `TEST_AUTH_ENABLED=true`：使用 `TestUserMiddleware` 通过自定义 Header 注入测试用户

---

## 3. `apps/gateway`：API Gateway 与管理能力

### 3.1 全局运行能力

- 全局前缀：`/api`（`apps/gateway/src/main.ts`）
- 全局守卫：`JwtAuthGuard`（默认所有非 `@Public()` 路由需要 JWT）
- 全局拦截器（`apps/gateway/src/main.ts`）：
  - 日志/转换/超时/性能
  - `MetricsInterceptor`：记录请求指标
  - `AuditInterceptor`：写审计日志（尽力而为）
  - 可选 `CircuitBreakerInterceptor`：断路器（由配置决定是否启用）
- Swagger 在非生产且显式开启时启用

### 3.2 路由转发（核心功能）

`apps/gateway/src/modules/routing/*`
- `ProxyController`：`@All('*')` 捕获全部请求，交给 `RoutingService`
- `RoutingService`：
  - 优先匹配 `DynamicRoutesService` 的动态路由（从数据库加载 + 缓存）
  - 找不到则回退静态路由配置
  - 根据路由 `service` 选择代理到：
    - `api` / `webhooks` / `worker`
  - 可执行 `rewritePath`（支持通配符路径后缀拼接）
- `DynamicRoutesService`：
  - 从数据库加载 `isActive=true` 路由
  - 缓存 `routes:all`（默认 1 小时）
  - 支持 `refreshRoutes()` 热更新

### 3.3 鉴权与业务接口（Gateway）

`apps/gateway/src/modules/auth/auth.controller.ts`
- `POST /api/auth/register`：公开注册（返回 JWT/刷新令牌）
- `POST /api/auth/login`：公开登录（`RateLimitGuard` + `@RateLimit`）
- `POST /api/auth/refresh`：公开刷新令牌
- `POST /api/auth/logout`：需要 JWT（`JwtAuthGuard`）
- 微信 OAuth：
  - `GET /api/auth/wechat/authorize`：获取授权 URL
  - `GET /api/auth/wechat/callback`：微信登录回调（重定向携带 token）

### 3.4 管理 API（admin）

`apps/gateway/src/modules/routing/routes.controller.ts`
- `admin/routes`（管理员 JWT+角色）：
  - `POST/GET/GET/:id/PUT/:id/DELETE/:id`
  - `POST /api/admin/routes/refresh`：刷新动态路由缓存

`apps/gateway/src/modules/api-key/api-key.controller.ts`
- `admin/api-keys`（管理员）：
  - API Key CRUD
  - `POST /api/admin/api-keys/:id/rotate`：轮换

`apps/gateway/src/modules/ip-filter/ip-filter.controller.ts`
- `admin/ip-filter`（管理员）：
  - `POST .../whitelist`、`POST .../blacklist`
  - `DELETE .../whitelist/:ip`、`DELETE .../blacklist/:ip`
  - `GET .../whitelist`、`GET .../blacklist`、`GET ...`（全规则）

`apps/gateway/src/modules/audit/controllers/audit.controller.ts`
- `GET /api/admin/audit-logs`：审计日志查询（支持过滤条件 + 分页）

### 3.5 观测与弹性

`apps/gateway/src/common/monitoring/controllers/metrics.controller.ts`
- `GET /api/metrics`：Prometheus 指标导出（文本格式）

`apps/gateway/src/common/resilience/interceptors/circuit-breaker.interceptor.ts`
- 断路器拦截器（由配置决定是否启用），成功/失败统计与状态更新写入监控

### 3.6 安全中间件（已挂载 + 条件校验）

代码中实现了以下安全中间件类（路径：`apps/gateway/src/common/security/middleware/*`）：
- `SignatureMiddleware`：基于请求头的 HMAC 签名校验
- `ReplayAttackMiddleware`：`x-timestamp` + `x-nonce` 防重放（依赖 `NonceService`）
- `CsrfProtectionMiddleware`：CSRF 防护（依赖 `@service/security` 的 `csrfMiddleware`）
- `IpFilterMiddleware`：黑白名单拦截（已存在模块 `ip-filter.module.ts` 的 providers）

在后续落地实现中，这些中间件已在 `apps/gateway/src/app.module.ts` 里通过 `MiddlewareConsumer.apply(...).forRoutes('*')` 挂载到网关链路。

同时，为避免影响现有的纯 JWT 调用链路，签名/防重放/CSRF 均做了“条件校验/自动跳过”：

- `SignatureMiddleware`：当请求未携带签名相关 header 时直接跳过
- `ReplayAttackMiddleware`：当请求未携带 `x-timestamp`/`x-nonce` 时直接跳过
- `CsrfProtectionMiddleware`：默认未启用，且只有携带 `x-csrf-token` 时才会进行 CSRF 校验

---

## 4. `apps/webhooks`：Webhook 管理与接收/转发

### 4.1 全局前缀

- `/api`（`apps/webhooks/src/main.ts`）

### 4.2 HTTP 路由（Controller）

`apps/webhooks/src/health/health.controller.ts`
- `GET /api/health`

`apps/webhooks/src/common/monitoring/controllers/metrics.controller.ts`
- `GET /api/metrics`

`apps/webhooks/src/modules/webhooks/webhooks.controller.ts`
- 接收外部 Webhook：
  - `POST /api/webhooks/receive`
    - Header：`x-webhook-event`（必需）、`x-webhook-signature`（可选）
    - body：payload（任意 JSON）
    - 行为：异步处理，立即返回 `202 Accepted`
- 配置 CRUD：
  - `POST /api/webhooks`
  - `GET /api/webhooks`
  - `GET /api/webhooks/:id`
  - `PATCH /api/webhooks/:id`
  - `DELETE /api/webhooks/:id`（软删除）
- 历史记录：
  - `GET /api/webhooks/:id/history`

### 4.3 转发与重试（实现：`apps/webhooks/src/modules/webhooks/services/webhook.service.ts`）

- 查找启用的 webhook：按 `enabled=true` 且 `events` 包含该事件
- 可选签名校验：
  - webhook 配了 secret 且请求带 signature 时会做 HMAC-SHA256 校验（`timingSafeEqual`）
- 写入 `WebhookHistory`：
  - `pending/success/failed`、`statusCode/response/error/retryCount/duration`
- 转发：
  - 使用 `WebhookRetryService` 做带重试的转发

---

## 5. `apps/worker`：消息订阅/异步处理

worker 以队列订阅为主（不依赖 HTTP Controller）：

已实现订阅（实现：`apps/worker/src/modules/*/listeners/*.listener.ts`）：
- `auth.login_success` -> `auth-login-success-queue`
- `auth.login_failed` -> `auth-login-failed-queue`
- `user.created` -> `user-created-queue`
- `user.updated` -> `user-updated-queue`
- `user.deleted` -> `user-deleted-queue`

处理逻辑特点：
- 主要记录收到事件与关键字段日志
- 业务动作已替换为可运行的最小实现（结构化日志/告警），用于保证事件消费链路端到端可验证

---

## 6. `apps/logging`：独立日志服务

### 6.1 全局前缀

- `/api`（`apps/logging/src/main.ts`）

### 6.2 HTTP 路由（Controller）

`apps/logging/src/health/health.controller.ts`
- `GET /api/health`

`apps/logging/src/logs/logs.controller.ts`
- 写入日志：
  - `POST /api/logs`：接收单条日志或数组（内部统一为数组处理）
  - `POST /api/logs/batch`：批量日志接口
- 查询日志：
  - `GET /api/logs`：按条件查询（实现为内存查询）
  - `GET /api/logs/:id`：查询单条日志详情

### 6.3 处理链路（Services）

`apps/logging/src/logs/services/*`
- `LogReceiverService`：接收并解析日志条目（message/level/timestamp/context/error 等）
- `LogProcessorService`：
  - 脱敏（如 password/token/secret/apiKey/authorization 等字段名包含关键字）
  - 补充处理时间、hostname 等元信息
- `LogStorageService`：
  - 根据配置选择传输器：Elasticsearch / Loki / 文件 / 控制台回退等
  - 同时可将日志存入 `LogQueryService` 的内存查询缓存
- `LogQueryService`：
  - 当前主要用内存数组存储（开发/测试更合适）
  - 支持筛选 level/service/keyword/time + 分页

---

## 7. M1：可运行数字公司竖切（任务运行记录、DAG、Temporal、董事会视图）

以下对应《执行计划》M1 在代码中的落地点；Postgres 为运行记录真源（ClickHouse 等 OLAP 属后续里程碑）。

### 7.1 数据模型与迁移（Postgres）

- 迁移：`infrastructure/postgres/migrations/1770400000000_AddTaskRunsDependenciesAndRunId.ts`
  - 表 `task_runs`：单次编排/心跳运行的元数据（`run_id`、触发源、Temporal workflow id、状态、时间戳、`metadata` 等）
  - 表 `task_dependencies`：任务依赖边（支持 DAG 校验）
  - `task_execution_logs.run_id`：可选关联到某次 run
  - 任务状态枚举扩展：`awaiting_approval`（与治理阶段对齐的入口状态）

### 7.2 `apps/api`：TaskRun、RPC、执行日志

- `TaskRunService`：`tasks.run.start` / `tasks.run.complete` / `tasks.run.fail`、`tasks.runs.list`（Query 可选 `taskId`，按 `task_execution_logs` 关联筛选 run）、`dashboard.boardRunSummary`（RPC 入口见 `tasks.rpc.controller.ts`）
- `TasksService.listDependencyEdges`：`tasks.dependencies.list`；`TaskExecutionService.listExecutionLogsGroupedByRun`：`tasks.executionLogs.groupedByRun`（GET `/v1/tasks/:id/execution-logs/grouped`）
- `TaskExecutionService.appendLog`：支持可选 `runId`；列表查询可按 `runId` 过滤
- `TasksService`：创建/更新任务时维护依赖行；依赖环检测与进入 `in_progress` 前的依赖完成校验（共享逻辑见 `@foundry/task-core`）

### 7.3 `apps/gateway`：`runId` 与对外路由

- `request-id.middleware`（及相关链路）：请求若无 `X-Run-Id` 则生成 UUID，并回写响应头；转发下游时注入 `x-run-id`（见 `base-proxy.service`）
- 静态路由示例：`GET /v1/dashboard/board-runs`、`GET /v1/task-runs`（支持 `taskId`）、`GET /v1/tasks/dependencies`、`GET /v1/tasks/:id/execution-logs/grouped`（具体路径以 `routes.config.ts` 为准）；RPC 模式在 `rpc-patterns.config.ts` 中注册

### 7.4 `apps/worker`：Temporal 对齐与互斥心跳

- 环境变量：`TASK_HEARTBEAT_SOURCE=nest_timer|temporal`（`temporal` 时 Nest 定时心跳不再发 tick，避免双触发）
- `WORKER_INTERNAL_API_SECRET` + `POST /api/internal/temporal/company-heartbeat`：`X-Internal-Auth` 鉴权，活动内驱动 `tasks.run.*` 与现有 `autonomous` 心跳链路

### 7.5 Temporal 基础设施与应用

- Docker：`deployment/docker/docker-compose.temporal.yml`（建议 `--profile temporal` 与主 compose 合并使用）
- `apps/temporal-worker`：`HeartbeatFanout` 等工作流与活动；README 说明 bundle、地址与 schedule 引导脚本

### 7.6 共享包 `@foundry/task-core`

- 路径：`packages/core/task` — 任务/运行相关字符串联合类型与 `dependencyGraphHasCycle` 等纯函数；`pnpm --filter @foundry/task-core run test` 运行 DAG 单测

### 7.7 管理端「董事会 / 运行」视图

- `admin-system`：公司详情 **董事会视图** Tab（`@xyflow/react`：父子实线 + DAG 依赖橙色虚线；点击节点筛选 runs、拉取按 run 分组的执行日志）；Cypress：`cypress/e2e/board-room.cy.ts`（拦截 API 全链路）、`board-room-smoke.cy.ts`

### 7.8 契约与测试

- **Pact（worker → API，HTTP shim）**：合并后的契约文件 `contracts/pact/pacts/foundry-worker-foundry-api.json`（须提交）；CI 在 `pnpm test` 之后执行 `pnpm test:pact`（根脚本，等同 `@service/api` 的 `test:pact`；`PACT_DO_NOT_TRACK=true`）。日常单测通过 `jest.config.cjs` 的 `testPathIgnorePatterns` 排除 `test/pact/`，Pact 使用 `jest.pact.config.cjs`。
- **更新契约**：`pnpm --filter @service/api run pact:generate`（内部 `PACT_GENERATE=1`，再提交 JSON）。可选 Broker：设置 `PACT_BROKER_BASE_URL`、`PACT_BROKER_TOKEN`、`GITHUB_SHA` 或 `PACT_PROVIDER_VERSION` 后由 `provider.verify.spec.ts` 上报校验结果。
- 根目录另有人读 JSON 样例：`contracts/pact/tasks-run-start.contract.json`、`contracts/pact/tasks-execution-log-append.contract.json`（非 CI 所用文件）。
- API Jest：`jest.config.cjs` 含 `@foundry/task-core` 的 `moduleNameMapper`；勿与已删除的重复 `jest.config.js` 并存

---

## 8. 重要“未完全确认/待补充”的点

1. `apps/gateway` 的 `SignatureMiddleware` / `ReplayAttackMiddleware` / `CsrfProtectionMiddleware` / `IpFilterMiddleware` 已在 `apps/gateway/src/app.module.ts` 挂载，并对“未携带对应 header 的请求”做了自动跳过。建议在联调阶段用真实请求验证：签名校验、nonce 防重放、以及 CSRF token 校验是否符合预期。

2. `apps/worker` 的事件监听框架已实现，并将监听器内的 `TODO` 替换为可运行逻辑；如需落库/外部通知，可继续接入 DB/邮件/告警服务。

---

## 9. 建议你接下来怎么用这份清单

- 如果你要做“功能验收”，可以以本文档中的 Controller 路由为基准逐个联调
- 如果你要做“安全验收”，需要重点确认 `gateway` 安全中间件是否真正挂载生效，并核对 Header 约定（`Signature`/`X-Timestamp`/`X-Nonce`/`X-Api-Secret` 等）
- 如果你要做“异步验收”，需要核对 `worker` 的队列与事件发布方（可能在 `api/gateway` 内触发），并验证对应的结构化日志/指标是否符合预期
