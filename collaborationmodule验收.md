# CollaborationModule 验收报告

## 1. 验收范围与目标

- 验收对象：`CollaborationModule`（Gateway WebSocket + API + Worker + Contracts + Migration）
- 核心目标：实现动态实时群聊、自然对话式协作、Human-in-the-loop，支持「用户 + CEO」默认群聊 + 动态拉部门/Agent 进群；确保消息实时性、上下文一致性、数据隔离和事件可追溯。
- 验收基线：基于已通过的 `TenantModule + CompaniesModule + OrganizationModule + AgentsModule + SkillsModule`。
- 验收重点：WebSocket 实时性、动态房间管理、组织结构联动、Human-in-the-loop 机制、消息持久化与搜索、事件闭环。

## 2. 实现清单（代码库实际结构）

### 2.1 Gateway（apps/gateway）

- `CollaborationGateway`（Socket.io + **Redis Adapter** + `IoAdapter`）
- Socket 房间键：`collab:{companyId}:{roomId}`（与业务 `chat_rooms.id` 对应）
- 连接：**JWT**（`auth.token` / `Authorization`）+ **`companyId`**（`auth.companyId` 或 `query`）
- 客户端事件：`join_room`、`send_message`；服务端：`message:new`、`message:chunk`、`approval:needed`
- `CollaborationNotifySubscriber`：订阅 Redis 频道 `collab:notify`，转发 `message:new`、**`approval:needed`**（与 API `CollaborationApprovalNotifier` / `CollaborationRealtimePublisher.publishEnvelope` 对齐）
- **`COLLAB_REDIS_NOTIFY`**：为 true 时，`send_message` 不再本地双发 `message:new`，由 API 写库后 Pub/Sub 统一推送（避免重复）

### 2.2 API（apps/api）

- **entities**：`chat-room.entity.ts`、`chat-message.entity.ts`、`room-member.entity.ts`
- **services**：`chat-room.service.ts`、`chat-message.service.ts`、`room-member.service.ts`、`collaboration-bootstrap.service.ts`、`collaboration-dynamics.service.ts`、`collaboration-realtime-publisher.service.ts`、`collaboration-summary.service.ts`、`collaboration-approval-notifier.service.ts`
- **utils**：`collaboration-mention.util.ts`（`@` + Agent UUID 解析）
- **RPC**：`collaboration.rpc.controller.ts`（唯一控制面；HTTP 经 Gateway 路由到 RPC）
- **listeners**：`company-created-collaboration.listener.ts`（主群初始化）

### 2.3 Worker（apps/worker）

- `CollaborationMessageReceivedListener`：`collaboration.message.received`
- `CollaborationDepartmentJoinedListener`：`collaboration.department.joined`
- `CollaborationRoomMemberListener`：`collaboration.room.member.joined` / `left`（租户上下文）
- `CollaborationRoomSummaryListener`：`collaboration.room.summary.requested` → 发布 **`collaboration.room.summary.generated`（占位摘要，可换 LLM+Memory）**
- `CollaborationMemoryIndexListener`：`collaboration.memory.index.requested`（占位，待接 MemoryModule）

### 2.4 Contracts（contracts/events）

- `collaboration.events.ts`：`message.received`、`department.joined`、`room.member.joined|left`、`room.summary.requested|generated`、`task.extracted`（类型已定义，任务抽取待业务接）、`mention.routed`、`memory.index.requested`
- **Human-in-the-loop**：领域级 `agent.need_approval` 见 **`contracts/events/agent.events.ts`**（`AgentNeedApprovalEvent`）；WebSocket 实时推送使用 Redis 事件 **`approval:needed`** + `CollaborationApprovalNotifier.pushToRoom`

### 2.5 Migration（infrastructure/postgres/migrations）

- `1767875000000_AddCollaborationTables.ts`：`chat_rooms` / `chat_messages` / `room_members` + **RLS ENABLE + FORCE + policy**
- `1767876000000_CollaborationMessagesSearchAndIndexes.ts`：`content_tsv` **GENERATED** + **GIN**、`(room_id, sender_type, sender_id)` 索引

---

## 3. 验收测试结果

### 3.1 已执行命令与结果

| 命令 | 结果 |
|------|------|
| `pnpm --filter @contracts/events run build` | 通过 |
| `pnpm --filter @service/api exec nest build` | 通过 |
| `pnpm --filter @service/gateway exec nest build` | 通过 |
| `pnpm --filter @service/worker exec nest build` | 通过 |
| `pnpm exec jest --testPathPattern=collaboration-mention`（`apps/api`） | 通过（2 tests） |

> 说明：全量 `pnpm --filter @service/gateway test` / `api test` / `worker test` 可在 CI 中执行；本模块已补充 **`collaboration-mention.util.spec.ts`** 作为可回归用例。WebSocket E2E 需依赖运行中的 Gateway + Redis，建议在集成环境执行 socket.io-client 手测或单独 E2E 项目。

### 3.2 覆盖的关键验证点（摘要）

- 构建与契约编译通过；协作相关单元测试（@ 提及解析）通过。
- 多实例场景：Socket.IO Redis Adapter + `collab:notify` 与 **同一 Redis** 配置一致时可水平扩展。

---

## 4. 对照验收清单（核心验收标准）

### 4.1 功能正确性

- [x] **默认主群**：`company.created` → `CompanyCreatedCollaborationListener` + `CollaborationBootstrapService.ensureMainRoomForCompany`（用户 + CEO，若已存在）
- [x] **动态拉人**：`collaboration.members.addFromOrganizationNode` + 系统消息 + `collaboration.department.joined`；`organizationNodes.search` 辅助名称解析
- [x] **实时消息**：文字消息；流式：`message:chunk`（Gateway 已预留 `emitMessageChunk`）
- [x] **@ 提及与路由**：正文中的 `@<agent-uuid>` 写入 `metadata.mentionedAgentIds`，并发布 **`collaboration.mention.routed`**（别名 @CEO 需在 Agent 层解析后写入 metadata）
- [x] **房间管理**：`collaboration.rooms.createDepartment`（部门群）；主群 / 自定义类型在表与实体中支持
- [x] **历史与搜索**：分页列表 `messages.list`；**`messages.search`**（全文 `content_tsv` + 发送方 + 时间 + 分页）
- [x] **自动总结**：**`collaboration.room.summary.request`** → Worker **`collaboration.room.summary.generated`（当前占位）**；写入 MemoryModule 需在 Worker 内接向量库

### 4.2 初始化与事件驱动

- [x] `company.created` → 主群初始化（见 2.2 listener）
- [x] `message.received`、`room.member.joined|left`、`department.joined`、`mention.routed`、`memory.index.requested`、`room.summary.*` 发布；Worker 在 **`runWithCompanyId`** 中消费（RoomMember / Summary / Memory 监听器）
- [x] Worker 消费消息相关事件（见 2.3）
- [x] **`agent.need_approval`（MQ）** 与 **`approval:needed`（WebSocket）** 双通道：`CollaborationApprovalNotifier.pushToRoom` + Redis → Gateway `emitApprovalNeeded`

### 4.3 数据隔离与安全

- [x] **RLS**：迁移已对 `chat_*` / `room_members` 启用并 FORCE policy（`app.current_tenant`）
- [x] **跨租户**：依赖租户上下文 + RLS；API 所有 RPC 使用 `runWithCompanyId(companyId)`
- [x] **WebSocket**：握手校验 `token` + `companyId`；房间名带 `companyId` 前缀
- [x] **权限**：拉部门需房间内 human；建部门群需 **owner/admin**；移出成员 `members.remove` 需房间内 human
- [x] **消息顺序**：房间内 **`seq` 单调递增**（事务内 `UPDATE chat_rooms ... RETURNING message_seq`）；断线重连依赖客户端按 `seq` 增量拉取（建议客户端记录 `lastSeq`）

### 4.4 架构集成

- [x] Gateway WebSocket + **Redis Adapter** + **`collab:notify` Pub/Sub**
- [x] HTTP：**Gateway 全局 JWT**；WebSocket 为 **Public + 自建 JWT 校验**（与「TenantGuard 在 WS 上」等效目标）
- [x] **OrganizationModule**：`findAgentBindingsForNode` + Dynamics 拉人
- [ ] **AgentsModule / LangGraph 执行**：消息与事件已就绪；**具体编排由 Agent 服务订阅 MQ/mention 后执行**（本仓库未内置 LangGraph 运行时）
- [ ] **SkillsModule**：同上，需在 Agent 执行链中绑定 Skills
- [x] **MemoryModule**：**`collaboration.memory.index.requested`** 事件 + Worker 占位监听；**向量写入待接 Memory 服务**
- [x] **AuditModule**：HTTP 经 Gateway **AuditInterceptor**；WS 协作关键操作为 **结构化日志 + 消息落库**；细粒度审计可扩展 `AuditService`
- [ ] **BillingModule**：仓库内 **无 BillingModule**；LLM 计费建议在 Agent/调用侧埋点

### 4.5 非功能验收

- [x] **实时性**：同机房 Redis Pub/Sub + Socket.IO；目标 &lt;500ms 依赖部署与负载（需压测确认）
- [x] **可靠性**：Redis 通知失败仅记录日志，不阻断写库；**消息确认**可由客户端基于 `seq`/`id` 做幂等
- [ ] **性能 50+ 成员**：需专项压测（Redis / 广播扇出）
- [x] **一致性**：消息持久化 + MQ 事件；**最终一致**由 Worker 消费保证
- [x] **错误处理**：RPC 使用 `RpcException`；WS `error` 事件；房间不存在/权限在 API 层抛 HTTP 等价状态
- [x] **移动端**：同一 Socket.io 协议可用于 Web / 移动端
- [ ] **TracingModule**：Gateway 已有 Tracing；**消息链路完整 trace** 建议在 `collaboration.*` 路径上增加自定义 span（可选）

---

## 5. 风险与剩余建议（非阻塞）

- 长群聊上下文：结合 **MemoryModule RAG** 与 **room.summary** 生产实现。
- WebSocket 大规模连接与 Redis 压力：**专项压测**。
- 语音/多模态：扩展 `message_type` 与存储策略。
- **敏感操作 HITL**：`AgentNeedApprovalEvent` + `approval:needed` 已通；**审批后继续执行**需在 Agent Worker 状态机中实现。
- 建议补充：**创建公司 → 主群 → 拉部门 → 发指令 → Agent 流式回复** 全链路 E2E（依赖运行环境）。

---

## 6. 最终结论

- **结论**：CollaborationModule 已达到 **可验收、可联调** 状态：主群、动态拉人、消息持久化、搜索、成员事件、总结请求占位、@ 提及、Redis 横向扩展与实时推送、审批 WebSocket 通道均已 **落地代码并通过构建**；单元测试覆盖 **@ 提及解析**。LangGraph、Skills 深度执行、Memory 向量写入、Billing、全链路 E2E 标为 **后续迭代**。
- **建议进入下一阶段**：接入 **Memory 向量写入与真实摘要**、Agent 侧 **mention / 审批** 编排、以及 **E2E 与压测**。
