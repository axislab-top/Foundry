# TasksModule 验收报告

## 1. 验收范围与目标
- 验收对象：`TasksModule`（API + Worker + LangGraph 集成 + Contracts + Migration + Dashboard）
- 核心目标：实现从用户大目标 → CEO 智能拆解 → 任务分配执行 → 实时进度追踪 → 自动汇报的全闭环；提供公司级仪表盘；支持 Heartbeat 驱动的自治运行；确保任务数据严格租户隔离且可审计。
- 验收基线：基于已通过的 `TenantModule + CompaniesModule + OrganizationModule + AgentsModule + SkillsModule + CollaborationModule + MemoryModule`。
- 验收重点：任务拆解准确性、执行闭环、进度实时性、仪表盘数据一致性、与 LangGraph/Heartbeat 的集成、Human-in-the-loop 机制。

## 2. 实现清单（已交付）

### 2.1 API（apps/api）
- 模块目录与分层：
  - `entities`: `task.entity.ts`, `task-assignment.entity.ts`, `task-execution-log.entity.ts`
  - `dto`: 创建任务、拆解请求、更新进度、查询、分配、执行日志等 DTO
  - `services`: `tasks.service.ts`, `task-orchestrator.service.ts`, `task-execution.service.ts`, `dashboard.service.ts`
  - `controllers`: `tasks.rpc.controller.ts`（RPC MessagePattern，经 Gateway 暴露为 HTTP）
  - `listeners`: `collaboration-task-extracted.listener.ts`, `company-created-tasks.listener.ts`
- 核心能力：
  - 任务树 CRUD（支持父子层级）、`GET` 等价 RPC `tasks.tree`
  - 智能拆解请求：`tasks.requestBreakdown` → 发布 `task.breakdown.requested`
  - 进度更新与状态流转（含合法迁移校验、父任务进度汇总、阻塞/完成事件）
  - 仪表盘数据聚合 `dashboard.companySummary`
  - 任务进度经 Redis `collab:notify` 推送 Gateway WebSocket；若 `metadata.roomId` 存在则同时向协作房间推送
  - `task.completed` 由 Memory 监听器写入公司级记忆

### 2.2 Gateway（apps/gateway）
- 路由（节选，完整见 `routes.config.ts`）：
  - `/v1/dashboard` → `dashboard.companySummary`
  - `/v1/tasks`、`/v1/tasks/breakdown`、`/v1/tasks/:id/tree`、`/v1/tasks/:id/progress`、`/v1/tasks/:id/assign`、`/v1/tasks/:id/execution-logs` 等
- WebSocket（`/collaboration` 命名空间）：
  - `join_company_tasks`：订阅全公司任务进度，事件名 `task:progress`（需 `COLLAB_REDIS_NOTIFY=true` 且 API/Gateway Redis 一致）
  - 群聊房间内同发 `task:progress`（`task:room_progress` Redis 事件）

### 2.3 Worker（apps/worker）
- `TaskBreakdownRequestedListener`：订阅 `task.breakdown.requested`（当前为接入 LangGraph CEO Supervisor 的占位，可在此落子任务 RPC）
- `TaskHeartbeatScheduler`：`company.created` 注册公司 ID，每 120s 发布 `task.heartbeat.tick`
- `TaskHeartbeatTickListener`：消费 `task.heartbeat.tick`（可扩展为拉取待办并调度 Agent）

### 2.4 Contracts（contracts/events）
- `task.created` | `task.updated` | `task.progress.updated` | `task.completed` | `task.blocked` | `task.summary.generated`
- `task.breakdown.requested` | `task.heartbeat.tick`

### 2.5 Migration（infrastructure/postgres/migrations）
- `1767879000000_AddTasksModuleTables.ts`：`tasks` / `task_assignments` / `task_execution_logs`，RLS ENABLE + FORCE + `company_id` 策略，索引见迁移文件

## 3. 验收测试结果

### 3.1 已执行命令与结果（本仓库实测）
- `pnpm --filter @service/api build` — 通过  
- `pnpm --filter @service/worker build` — 通过  
- `pnpm --filter @service/gateway build` — 通过  
- `pnpm --filter @service/api test -- --testPathPattern=tasks.service.spec` — 通过  
- `pnpm --filter @service/gateway test -- --testPathPattern=routes.tasks` — 通过  

### 3.2 覆盖的关键验证点（实测摘要）
- 任务创建权限：仅公司 Owner/Admin（及平台 `admin` 角色）可 `tasks.create`；群聊抽取与 `company.created` 引导任务走内部 `createFromEvent`，不受该限制。
- 进度更新权限：Owner/Admin 或任务创建人可 `updateProgress`；普通成员不可改他人任务进度。
- 状态机：非法迁移返回 400；子任务完成触发父任务进度与完成态汇总；根任务完成发布 `task.summary.generated`。
- 事件：`task.blocked`、`task.progress.updated`、`task.summary.generated` 与 Redis 实时通道按实现发布。
- Worker：`company.created` 后注册 Heartbeat；定时 `task.heartbeat.tick` 发布与消费链路存在。

## 4. 对照验收清单（核心验收标准）

### 4.1 功能正确性
- [x] **任务创建与拆解**：拆解请求发布 `task.breakdown.requested`；CEO LangGraph 子任务落库需在 Worker 监听器内接入 Supervisor 并回调 API（当前监听器为占位）。
- [x] **任务分配**：`assign` 校验 Agent/组织节点；分配后状态 `pending`→`in_progress`（合法迁移内）。
- [ ] **执行流程**：子任务由 Agent 执行（Skills + Memory）依赖 Worker/编排调用 `tasks.executionLog.append` 与进度 RPC；需与 `@service/ai` 编排联调验证。
- [x] **状态流转**：服务端校验 `pending → in_progress → review → completed` / `blocked` / `cancelled` 等迁移。
- [x] **进度追踪**：进度、阻塞原因、执行日志模型与 RPC 具备；WebSocket 实时性依赖 Redis 通知开关。
- [x] **自动汇报**：根任务完成或子任务全部完成时发布 `task.summary.generated`（摘要文案为聚合说明，可再接 CEO 报告服务）。

### 4.2 初始化与事件驱动
- [x] `company.created` 后创建欢迎任务（`CompanyCreatedTasksListener` + `createFromEvent(..., 'bootstrap')`）。
- [x] `task.breakdown.requested`、`task.progress.updated`、`task.completed`、`task.blocked`、`task.summary.generated` 等可经 MQ 发布；Memory 侧消费 `task.completed`。
- [x] Worker Heartbeat 定时发布 `task.heartbeat.tick`（仅注册在创建后进程内出现过的公司；进程冷启动未缓存历史公司 ID，生产可改为持久化注册表）。
- [x] Collaboration 群聊抽取 → `collaboration.task.extracted` → 落地 Task（已有监听器）。

### 4.3 数据隔离与安全
- [x] RLS：迁移层 `FORCE ROW LEVEL SECURITY` + `company_id` 策略（与 `TenantContextService` 会话变量配合）。
- [x] 应用层：`tasks.*` RPC 均在 `runWithCompanyId` 下查询 `company_id`。
- [x] 权限：创建/删除（终止）重要任务为 Owner/Admin；进度更新见 3.2。
- [x] Human-in-the-loop：任务进入 `review` 且 `requiresHumanApproval` 且 `metadata.roomId` 时，经 Redis 推送 `approval:needed` 到协作房间（与现有协作审批一致）。

### 4.4 架构集成
- [ ] **LangGraph**：拆解执行仍在 Worker 占位；需对接 CEO Supervisor 图并写子任务。
- [x] **AgentsModule + OrganizationModule**：分配校验 Agent 存在；组织节点负载在仪表盘聚合。
- [x] **CollaborationModule**：抽取任务落地；进度可推协作房间 WebSocket。
- [x] **MemoryModule**：`task.completed` 写入公司级记忆。
- [ ] **SkillsModule**：任务执行链中 Agent 调 Skill 属运行时编排，需端到端场景验证。
- [x] **DashboardService**：状态分布、逾期、部门负载、执行日志计费汇总等（见 `dashboard.service.ts`）。
- [x] **AuditModule**：Gateway HTTP 审计覆盖经 Gateway 转发的 `/v1/tasks*` 请求；领域级细粒度审计可后续加专用表。

### 4.5 非功能验收
- [x] **实时性**：`task:progress` WebSocket + Redis（受 `COLLAB_REDIS_NOTIFY` 与多实例 Redis Adapter 配置影响）。
- [ ] **性能**：中等规模压测未在本轮执行；任务树使用递归 CTE，超深树建议评估 Closure Table（见第 5 节）。
- [x] **一致性**：父子进度汇总在单事务链路内更新父任务；复杂多子任务并发完成建议后续加锁或重试。
- [ ] **错误处理**：拆解失败、执行异常的重试/DLQ 需在 Worker 编排层补全。
- [x] **自治性**：Heartbeat tick 已发布；自动「执行」待编排扩展。
- [ ] **可观测性**：TracingModule 对任务链路的 `companyId` 贯穿需在网关/服务配置中确认采样规则。

## 5. 风险与剩余建议（非阻塞）
- 大型任务树（深层级、多子任务）时的查询与一致性优化（建议评估 Closure Table）
- Heartbeat 公司注册仅内存：重启后需依赖新 `company.created` 或改为 Redis/DB 注册表
- 任务失败重试 + DLQ 的完整验证
- 与 BillingModule 的深度集成测试（任务级消耗统计）
- 建议补充全链路 E2E：群聊大目标 → 拆解 → 执行 → WS 进度 → 仪表盘 → 汇报

## 6. 最终结论
- **结论**：TasksModule 数据模型、RPC、租户隔离、事件契约、仪表盘、协作与记忆联动、WebSocket 进度推送与 Worker Heartbeat 骨架已按清单落实；CEO LangGraph 自动拆解落库、Agent 端到端执行与全链路压测仍为集成阶段工作。
- **建议进入下一阶段**：在 Worker 中接入 LangGraph Supervisor 拆解并回调 API；补充 E2E 与 Worker 执行器拉取待办；按需将 Heartbeat 公司列表持久化。
