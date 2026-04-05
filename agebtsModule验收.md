# AgentsModule 验收报告

## 1. 验收范围与目标
- 验收对象：`AgentsModule`（API + Gateway + Worker + Contracts + Migration + 执行面占位）
- 核心目标：实现董事会、CEO、部门主管、普通员工 Agent 的完整生命周期管理；支持配置、招聘、Skills 绑定、与 OrganizationNode 深度绑定；为后续自治运行（LangGraph）、实时协作、记忆系统提供可靠实体基础。
- 验收基线：基于已通过的 `TenantModule + CompaniesModule + OrganizationModule`。
- 验收重点：租户隔离、组织结构绑定一致性、Skills 可扩展性、事件闭环、审计可追溯。

## 2. 实现清单（已交付）
### 2.1 API（apps/api）
- 模块目录与分层：
  - `entities`: `agent.entity.ts`, `agent-skill.entity.ts`, `agent-audit-log.entity.ts`
  - `dto`: 创建/批量招聘/更新/绑定 Skills/查询 DTO
  - `services`: `agents.service.ts`, `agent-recruiter.service.ts`, `agent-skill.service.ts`, `agent-validator.service.ts`, `agents-bootstrap.service.ts`
  - `controllers`: `agents.controller.ts`, `agents.rpc.controller.ts`
  - `listeners`: `company-created-agents.listener.ts`（MQ 未就绪时退避重试订阅，不阻塞启动）
- 核心能力：
  - Agent CRUD + 批量招聘（模板支持）
  - 与 OrganizationNode 绑定/解绑（`organization_nodes.agent_id`）
  - Skills 多对多绑定与解绑
  - LLM 模型、性格、System Prompt 配置；Human-in-the-loop + `pendingConfig` + `agents.approve`
  - 按部门/类型/状态筛选列表；详情返回 `skillIds`（消耗统计见下方「未交付」）
- **说明**：组织结构「拖拽移动」的同步在 **Worker** 侧通过 `organization.node.moved` 消费挂点完成；API 侧未单独实现 `organization-node-moved.listener`（避免与 Worker 重复）。

### 2.2 Gateway（apps/gateway）
- 路由与 RPC 白名单（实际路径以 `routes.config.ts` 为准）：
  - `/v1/agents`、`/v1/agents/:id`、`/v1/agents/batch-recruit`、`/v1/agents/:id/skills`、`/v1/agents/:id/assign-node`、`/v1/agents/:id/approve`、`/v1/agents/audit-logs` 等
  - `/v1/organizations/nodes/:id/agents` → `organization.node.agents`
  - `/v1/skills/*` → `skills.*`

### 2.3 Worker（apps/worker）
- 事件消费者（均使用 `subscribeWithBackoff`，MQ 晚于进程启动时可自动重试订阅）：
  - `agent.created|updated|deleted|status_changed|skills.changed|approved|need_approval`
  - `organization.node.moved` → `OrganizationNodeMovedAgentsListener`（租户 CLS + 幂等 + `AiRuntimeAdapter.onOrganizationNodeMoved` 挂点）

### 2.4 Contracts（contracts/events）
- `agent.created|updated|deleted|status_changed|skills.changed|approved|need_approval`
- 组织侧：`organization.node.moved` 等（见 `organization.events.ts`）

### 2.5 Migration（infrastructure/postgres/migrations）
- `agents`、`skills`、`agent_skills`、`agent_audit_logs`；`organization_nodes.agent_id` FK；RLS 与索引（见迁移文件 `AddAgentsAndSkills`）

### 2.6 执行面 / ToolRegistry 占位
- `apps/worker/src/modules/agents/tools/skill-tool-registry.stub.ts`：`skillIdsToToolDescriptors` 占位，供后续 `libs/ai` 替换。
- `NoopAiRuntimeAdapter` 在 `agent.skills.changed` 时调用上述占位，便于后续接入真实 ToolRegistry。

## 3. 验收测试结果
### 3.1 建议执行命令
- `pnpm --filter @service/api exec jest "agents\\..*\\.spec\\.ts"`
- `pnpm --filter @service/api exec jest agents.rls.integration.spec.ts`
- `pnpm --filter @service/worker test`
- `pnpm --filter @service/gateway test -- routes.agents.spec.ts`
- `pnpm exec nest build`（api / worker / gateway）

### 3.2 本轮已执行与结论（2026-03-28）
- **API 启动**：已修复 — RabbitMQ 未连接时 `subscribe` 不再抛错；`company.created` 相关监听使用 `subscribeWithBackoff`，连接恢复后自动完成订阅。
- **单元测试**：`agents.service.spec.ts` 通过。
- **RLS**：`agents.rls.integration.spec.ts` 在修正 test-database 路径后通过。
- **构建**：api / worker `nest build` 通过。

## 4. 对照验收清单（核心验收标准）

### 4.1 功能正确性
- [x] **Agent 创建与招聘**：单个创建、批量招聘、模板；创建后绑定节点并写回 `organization_nodes.agent_id`
- [x] **CEO 特殊处理**：同公司 CEO 单例校验；性格等为可配置字段（`personality` jsonb）；「汇报习惯」可归入 `metadata`（无单独列）
- [x] **董事会成员**：`board` 节点允许 `board_member`
- [x] **部门主管与员工**：`department` → `director`；`agent` 节点 → `executor` / `board_member`
- [x] **Skills 绑定**：全局 + 公司 Skills（RLS/校验在 `SkillsService`）；详情带 `skillIds`；ToolRegistry 见 2.6 占位
- [ ] **模型路由**：未实现「按角色自动选强/弱模型」的业务规则（仅存储 `llmModel`）
- [x] **列表与详情**：列表支持筛选分页；详情含 **Skills 列表（skillIds）**；**无消耗统计字段**

### 4.2 初始化与事件驱动
- [x] 公司与组织初始化联动默认 Agent（`AgentsBootstrapService` + `company.created` 幂等兜底监听）
- [x] `agent.*` 事件发布（MQ 未连时 publish 静默失败，与现有 Messaging 行为一致）
- [x] Worker 消费 `agent.*` 与 `organization.node.moved`（租户上下文 + 幂等）
- [x] 节点移动：Worker 挂点已接；DB 中 Agent 仍属同一 `nodeId`，汇报链属派生/缓存层语义

### 4.3 数据隔离与安全
- [x] RLS 集成测试覆盖 agents / skills / agent_skills
- [x] Tenant + 查询带 `companyId`
- [x] Owner/Admin 管理 Agent（`AgentValidatorService.assertCanManageAgents`）
- [x] 节点存在性、节点已绑定、CEO 重复等校验
- [x] 缓存键：`company:${companyId}:agent:${id}`；Skills 变更后删除该键

### 4.4 架构集成
- [x] Gateway 路由与 RPC 白名单（agents + skills + organization.node.agents）
- [x] 节点移动 ↔ Worker 侧 Agent 挂点（见上）
- [ ] **AuditModule（网关侧）**：Agent 操作用 **`agent_audit_logs` 表 + AgentsService/AgentSkillService 写入**，未对接独立 AuditModule 服务
- [ ] **BillingModule**：未集成
- [ ] **libs/ai**：仓库内无独立 `libs/ai` 包；Worker 占位见 2.6

### 4.5 非功能验收
- [x] 事务：创建/分配节点、删除等在事务内完成；Skills 绑定与审计一致
- [x] 典型错误码：403/404/409 等
- [x] **Human-in-the-loop**：敏感字段进 `pendingConfig` 并发布 **`agent.need_approval`**
- [ ] 并发与性能：未做专项压测（建议后续）

## 5. 风险与剩余建议（非阻塞）
- Agent 大量增长后的查询性能（建议后续加分页 + 索引优化）
- Agent 删除后的级联处理策略（组织节点、记忆、群聊房间）
- 与 LangGraph 的运行时集成测试（CEO Supervisor 是否正确使用 Agent 配置）
- Agent 商城模板导入的集成验收（待 TemplatesModule 就绪后补充）
- 建议补充全链路 E2E：创建公司 → 初始化组织结构 → 招聘 CEO + 员工 → 绑定 Skills → 查询组织树验证 Agent 显示

## 6. 最终结论
- **结论**：核心 Agents/Skills 能力、RLS、网关路由、Worker 事件链路与 **API 在 MQ 未就绪时的启动稳定性** 已达到阶段交付标准；Billing、网关 Audit 聚合、按角色自动选模型、消耗统计与真实 `libs/ai` 仍为后续迭代项。
- **建议进入下一阶段**：协作/任务/记忆与 LangGraph 运行时对接；补齐 Billing 与统一审计出口。
