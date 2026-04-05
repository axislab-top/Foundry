# 1. 总览与服务拆分

## 1.1 项目定位

**Foundry** 是一套基于 **NestJS + pnpm monorepo（Turbo）** 的微服务风格后端：对外由 **网关** 统一入口，**应用 API** 承载业务与数据访问，**Worker** 异步消费消息并编排长任务与 AI 相关流程，**Webhooks** 服务接收与配置出站回调。底层使用 **PostgreSQL**（迁移与租户 RLS）、消息队列抽象（`@service/messaging`），并共享租户、监控、安全、缓存等基础设施包。

## 1.2 核心应用职责

| 组件 | 路径 | 职责 |
|------|------|------|
| Gateway | `apps/gateway` | HTTP 入口、动态路由与 RPC 转发、JWT 与多层安全中间件、限流与熔断、审计、健康与指标、协作 WebSocket（`/collaboration`） |
| API | `apps/api` | 领域控制面：用户、认证、OAuth、文件、公司、组织、Agent、技能、协作、记忆、任务、计费、模板等；**多租户解析 + Postgres RLS 会话上下文** |
| Worker | `apps/worker` | 订阅领域事件（登录/用户/公司/组织/Agent/协作/记忆/任务/计费/模板等）；**LangGraph 自治编排**与 Agent 执行相关适配 |
| Webhooks | `apps/webhooks` | Webhook 接收、配置 CRUD、历史；经网关 RPC 与下游对齐 |
| Logging（可选） | `apps/logging` | 独立日志接收、处理、查询（见 `08-observability-boundaries.md`） |

## 1.3 共享与契约

- **`contracts/events`**：跨服务事件类型（`auth`、`user`、`company`、`organization`、`agent`、`collaboration`、`memory`、`task`、`billing`、`template`、`autonomous` 等）。
- **`infrastructure/*`**：消息、租户、迁移、缓存、监控、日志、安全、可选 AI 包等可复用实现。

## 1.4 API 侧已挂载领域模块（代码入口）

`apps/api/src/app.module.ts` 中已注册：`UsersModule`、`AuthModule`、`OAuthModule`、`FilesModule`、`CompaniesModule`、`SkillsModule`、`AgentsModule`、`OrganizationModule`、`CollaborationModule`、`MemoryModule`、`TasksModule`、`BillingModule`、`TemplatesModule`，以及 `MessagingModule`、`TenantModule` 等全局能力。

## 1.5 Worker 侧已挂载模块（代码入口）

`apps/worker/src/app.module.ts` 中已注册：`UsersModule`、`AuthModule`、`CompaniesModule`、`OrganizationModule`、`AgentsModule`、`CollaborationModule`、`MemoryWorkerModule`、`TasksWorkerModule`、`BillingWorkerModule`、`TemplatesWorkerModule`，以及 `MessagingModule`、`TenantModule`、`IdempotencyModule` 等。

---

下一篇：[02-gateway-access-and-realtime.md](./02-gateway-access-and-realtime.md)
