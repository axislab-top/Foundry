# 01 — 项目真实检查报告

## 1. 检查目的与方法

**目的**：在不做完整 E2E 业务验收的前提下，通过代码与工程事实回答「项目当前是什么、能证明什么」。

**方法**：

1. 阅读根 `package.json`、`turbo.json`、`pnpm-workspace` 所界定的 Monorepo 边界。
2. 核对 `apps/api`、`apps/gateway`、`apps/worker` 的 `app.module` 与领域模块挂载。
3. 枚举 API 侧 `*controller*.ts` 与 Worker 侧 `*.listener.ts`，与 `docs/architecture/implemented-features.md` 对照。
4. 执行 **Turbo 构建**（见第 3 节）作为「当前代码可编译集成」的客观证据。

---

## 2. 仓库客观事实

### 2.1 Monorepo 与应用

| 应用 | 包名（`package.json`） | 角色摘要 |
|------|-------------------------|----------|
| `apps/api` | `@service/api` | 业务与数据控制面：REST/RPC、多租户、领域模块 |
| `apps/gateway` | `@service/gateway` | 统一入口、JWT、动态路由与代理、管理 API、协作 WebSocket、观测 |
| `apps/worker` | `@service/worker` | 消息订阅、领域事件处理、任务/计费/记忆/模板等异步链路 |
| `apps/webhooks` | （独立包） | Webhook 接收、配置、历史与重试 |
| `apps/logging` | （独立包） | 独立日志接收、处理、查询 |

根脚本使用 `deployment/docker/*.yml` 与 `infrastructure/migrations` 管理基础设施与数据库迁移。

### 2.2 API 侧已挂载模块（`apps/api/src/app.module.ts`）

已注册：`UsersModule`、`AuthModule`、`OAuthModule`、`FilesModule`、`CompaniesModule`、`SkillsModule`、`AgentsModule`、`OrganizationModule`、`CollaborationModule`、`MemoryModule`、`TasksModule`、`BillingModule`、`TemplatesModule`，以及 `MessagingModule`、`TenantModule` 等。

领域 HTTP/RPC 控制器分布在各模块（例如 `users`、`files`、`companies`、`organization`、`agents`、`skills`、`collaboration`、`memory`、`tasks`、`billing`、`templates` 的 `*.controller.ts` / `*.rpc.controller.ts`）。

### 2.3 Worker 侧已挂载模块（`apps/worker/src/app.module.ts`）

已注册：`UsersModule`、`AuthModule`、`CompaniesModule`、`OrganizationModule`、`AgentsModule`、`CollaborationModule`、`MemoryWorkerModule`、`TasksWorkerModule`、`BillingWorkerModule`、`TemplatesWorkerModule`，以及 `MessagingModule`、`TenantModule`、`IdempotencyModule`、`MonitoringModule` 等。

### 2.4 Worker 监听器（与 `implemented-features.md` 的差异）

`docs/architecture/implemented-features.md` 第 5 节仅列出 **auth / user** 四类队列监听；**当前代码库中实际存在的监听器更多**，包括但不限于：

- 认证：`login-success`、`login-failed`
- 用户：`user.created` / `updated` / `deleted`
- 公司：`company-created`、`company-updated`、`company-status-changed`
- 组织：`organization-structure-changed`
- Agent：`organization-node-moved`、`agent-events`
- 协作：`collaboration-message-received`、`collaboration-department-joined`、`collaboration-room-member`
- 记忆：`memory-ingest-async`
- 任务：`task-breakdown-requested`、`task-completed-autonomous`、`task-heartbeat-tick`、`budget-warning-autonomous`
- 计费：`billing-consumption-requested`、`task-completed-billing`、`budget-signals-heartbeat`
- 模板：`template-imported`

**结论**：以 `apps/worker/src/modules/**/listeners/*.listener.ts` 为准进行异步能力评估；旧版实现清单需按需同步更新。

---

## 3. 构建验证（客观证据）

**命令**（在仓库根目录，PowerShell）：

```text
pnpm turbo run build --filter=./apps/api --filter=./apps/gateway --filter=./apps/worker
```

**结果**（2026-03-29）：**成功**（14 tasks successful，含 `@contracts/events`、`@service/messaging`、`@service/tenant`、`@service/ai` 等依赖包与三应用 `nest build`）。

**含义**：在当前工作区依赖已安装的前提下，**核心三应用可编译通过**，可作为「集成层面无语法/类型阻断」的基线；**不**等同于生产环境联调或通过全部自动化测试。

---

## 4. 文档与代码一致性建议

1. 将 `docs/architecture/implemented-features.md` 中 Worker 小节扩展为与现有 `listeners` 目录一致，或改为引用本目录与 `docs/features/07-worker-messaging-autonomous.md`。
2. 根目录 `项目功能与能力说明.md` 第 7 节差距分析仍具参考价值；若自治/层级 Supervisor 等已实现变更，应逐项核对 `infrastructure/ai` 与 Worker 编排代码后更新。

---

下一篇：[02-user-needs-matrix.md](./02-user-needs-matrix.md)
