# Hierarchical Supervisor（层级自治）设计

本文档冻结 **CEO → 部门（组织节点）→ 执行 Agent** 的自治状态机与运行时约定，与 [`infrastructure/ai`](../../infrastructure/ai) 中的 LangGraph 实现及 [`AutonomousOrchestratorService`](../../apps/worker/src/modules/autonomous/autonomous-orchestrator.service.ts) 对齐。

## 图拓扑

在原有 CEO 线性流水线基础上，插入 **`hierarchicalExpand`** 节点：

`ingest` → `plan`（CEO LLM）→ **`hierarchicalExpand`** → `validatePersist` → `summarize` → `notify`

- **plan**：输出 `CeoPlanOutput`（`ceo-plan.schema`），任务可带 `organizationNodeId` / `assigneeAgentId`。
- **hierarchicalExpand**（Worker 注入）：
  - 解析组织树与 CEO 任务列表；
  - 对「有节点、无执行 Agent」的任务，按节点调用 `agents.findAll` 解析 **默认执行 Agent**（取列表首项活跃 Agent）；
  - 将结果写回 `planResultJson`，并写入 `hierarchicalMetaJson`（自动指派审计）。
- **validatePersist**：沿用现有 RPC `tasks.create` 批量落库（与组织节点、Agent 校验一致）。

> 说明：完整 **多 LLM 部门子主管**（每节点独立 plan）可作为后续演进，通过替换 `hierarchicalExpand` 实现为「对每个节点调用子 LLM」而不改图外边。

## 标识与幂等

| 字段 | 含义 |
|------|------|
| `traceId` | 单次自治运行 ID；日志、计费、与 Checkpoint `thread_id` 关联。 |
| `supervisorRunId` | 层级展开轮次 ID（可与 `traceId` 相同）；用于扩展多轮委派时区分。 |
| **Checkpoint `thread_id`** | `ceo:{companyId}:{runKind}:{traceId}`（见 `invokeGraph`）。同一 `traceId` 重放为同一检查点线程。 |
| **Heartbeat 幂等** | `task.heartbeat.tick` 携带 `companyId` + `tickAt`；生产多副本时应使用 **单领导者调度** 或 **分布式锁**（见运维文档），避免重复 tick。 |

## 失败策略

- **plan**：预算不足时跳过 LLM（`skipPlanReason`），不抛错中断图。
- **hierarchicalExpand**：RPC 失败时记录 `hierarchicalMetaJson.errors`，不删除原任务；无 Agent 时任务仍可落为 `organization_node` 指派人。
- **validatePersist**：单条任务失败收集到 `persistErrorsJson`，继续处理其他任务。
- **notify**：主群 / Memory / 审批发送失败仅打日志，不回滚已创建任务。

## 与架构事件的关系

- 图完成后发布 `autonomous.ceo.heartbeat.completed`（[`架构.md`](../../架构.md) E21）。
- 执行层：`PendingAgentTaskExecutionService` 在心跳后拉取 `pending` + `assigneeType=agent` 的任务，调用 `AgentExecutionService` 与 Skills，完成后 `tasks.update` 为 `completed` / `blocked`。

## Skills 与 ToolRegistry

执行前通过 RPC `agents.effectiveSkillSnapshots` 将 **有效技能快照** 注入 `ToolRegistry`（与 `agent.skills.changed` 事件路径一致），再调用 `executeSkill`。内置危险能力（如 `code-run`）在未实现前由配置禁用（见 `register-builtins.ts`）。
