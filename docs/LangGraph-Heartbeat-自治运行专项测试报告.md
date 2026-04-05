# LangGraph + Heartbeat 自治运行专项测试报告

**文档性质**：专项检查报告（自动化可执行部分 + 清单与实现对照 + 人工验收指引）  
**仓库路径**：`D:/Foundry`  
**生成日期**：2026-03-29  

---

## 1. 执行摘要

- **已执行**：`apps/worker` 下与 Heartbeat、LangGraph CEO 编排、任务心跳调度相关的 **Jest 单元/组件测试**，以及 Worker **全量测试**；结果均为 **通过**。
- **未执行**：清单要求的 **双公司真实数据、全栈运行（API + Worker + RabbitMQ + Postgres）、WebSocket 群聊观察、3–5 分钟周期人工盯日志** 等端到端项，需在目标环境由人工或后续自动化脚本完成。
- **主要结论**：核心编排路径（`runWithCompanyId`、`task.heartbeat.tick` → `runHeartbeat`、CEO 图节点、完成事件发布）在 Mock 环境下行为与测试一致；清单中的 **日志文案、事件命名、多层级部门执行** 等与当前代码需按下文「对照表」验收。

---

## 2. 自动化测试结果

### 2.1 执行命令

在 PowerShell 中：

```powershell
Set-Location d:\Foundry\apps\worker
pnpm exec jest --testPathPattern="autonomous|task-heartbeat|langgraph" --no-coverage
pnpm exec jest --no-coverage
```

### 2.2 结果汇总

| 范围 | 套件数 | 用例数 | 结果 |
|------|--------|--------|------|
| `autonomous` / `task-heartbeat` / `langgraph` 相关 | 4 | 6 | 全部通过 |
| Worker 全量 | 11 | 15 | 全部通过 |

**涉及文件（节选）**：

- `apps/worker/src/modules/autonomous/autonomous-orchestrator.service.spec.ts`
- `apps/worker/src/modules/tasks/task-heartbeat.scheduler.spec.ts`
- `apps/worker/src/modules/autonomous/langgraph.build-ceo-heartbeat-graph.spec.ts`
- `apps/worker/src/modules/autonomous/autonomous-trigger.service.spec.ts`

### 2.3 自动化覆盖的边界

上述测试验证的是 **Mock RPC / 消息** 下的行为，**不包括**：

- 真实租户数据与 RLS 下的跨公司隔离（需在集成环境验证）；
- 真实 LLM 调用与结构化输出稳定性；
- Gateway WebSocket 推送与前端群聊 UI。

---

## 3. 测试清单与代码实现对照

| 清单项 | 说明 |
|--------|------|
| **租户上下文** | `AutonomousOrchestratorService.runHeartbeat` / `runBreakdown` 均在 `tenantContext.runWithCompanyId(companyId, …)` 内执行 LangGraph，避免默认上下文下串租户。 |
| **预期日志「Heartbeat started for company」** | 当前代码 **未使用** 该字符串。实际可检索：`CEO graph invoke`、`CEO graph completed`；调度侧有 `task.heartbeat.tick`（多为 debug）。验收时建议以 **上述关键字** 为准，或后续统一增加一行明确文案。 |
| **战略拆解入口** | API 通过 `tasks.requestBreakdown`（RPC）发布 `task.breakdown.requested`；Worker 订阅后走与 Heartbeat **同一 CEO 图**，`runKind = 'breakdown'`。群聊是否自动调用该 RPC 取决于 Gateway/业务接线。 |
| **多层级执行（部门 Supervisor → Skills）** | CEO 图为 **ingest → plan → validatePersist → summarize → notify**，子任务经 **`tasks.create`** 落库。**部门主管再拆解、执行层自动跑 Skills** 是否在独立 Worker 流程中实现，需在运行环境 **单独验证**；本仓库 `tasks` 模块下未见完整「多层 Supervisor」链路的明确实现。 |
| **审批事件名** | 清单若写 `agent.need_approval`，与实现不一致。实现为 **`autonomous.ceo.approval.required`**；API `AutonomousCeoApprovalListener` 消费后推送到协作房间。 |
| **预算与模型** | `plan` 前调用 **`billing.checkAllowance`**；ingest 中 **`billing.modelRouter.resolve`**（如 `budget_warning` 时降低优先级）；心跳周期内 **`BudgetSignalsHeartbeatListener`** 对 `task.heartbeat.tick` 调用 **`billing.signals.refresh`**。80%/100% 告警与「暂停非关键任务」等行为以 Billing 模块 RPC 实现为准，需在运行时核对。 |
| **汇报与 Memory** | `notify` 中 **`collaboration.messages.send`** 向主群发送报告摘要；**`memory.entries.store`** 写入 `ceo_autonomous` 等，`collectionLabel` 形如 `heartbeat:{tickAt}`。 |
| **Checkpoint** | 配置 **`WORKER_CHECKPOINT_DATABASE_URL`** 时使用 Postgres Checkpointer；未配置则图为 **MemorySaver**（见 `infrastructure/ai` 中 `buildCeoHeartbeatGraph`）。 |

---

## 4. 测试前准备（与配置对齐）

| 项目 | 建议 |
|------|------|
| Heartbeat 周期 3–5 分钟 | 设置环境变量 **`TASK_HEARTBEAT_INTERVAL_MS`**。Schema 允许范围 **5000–86400000** ms；例如 3 分钟 = `180000`，5 分钟 = `300000`。 |
| 双公司与初始化 | 至少两家公司（如科技 / 内容），完成组织、CEO + 多 Agent、Memory Collection、预算等；需通过既有产品与数据流程准备，仓库内无单一脚本替代完整准备。 |
| 可观测性 | 开启 Worker/API 结构化日志与 Tracing；WebSocket 客户端连接协作主群便于观察推送。 |

---

## 5. 人工 / 集成验收建议顺序

1. **用例 1（心跳与上下文加载）**：确认 **`CEO graph invoke` / `CEO graph completed`**；消息或日志中 **`autonomous.ceo.heartbeat.completed`**；`task.heartbeat.tick` 按间隔出现（注意日志级别）。
2. **用例 2（CEO 拆解）**：通过 **`tasks.requestBreakdown`** 或已接线的群聊入口提交目标；检查 **`task.breakdown.requested`** 与 Tasks 模块新任务。
3. **用例 4（人在回路）**：当计划 **`requiresHumanApproval`** 为真时，检查 **`autonomous.ceo.approval.required`** 与房间推送及后续状态。
4. **用例 5（预算）**：调低预算后触发心跳或规划，观察 **`billing.checkAllowance`** 跳过 LLM、`modelRouter` 与 **`billing.signals.refresh`**。
5. **用例 6（闭环）**：主群报告与 Memory 写入；下一轮 Heartbeat 是否检索到相关 Memory。
6. **用例 7（稳定性）**：重启 Worker、模拟 RPC 失败，观察单次失败隔离与 Checkpoint 行为。

---

## 6. 用例级结果表（本轮可填部分）

| 用例 | 本轮结果 | 证据 / 说明 |
|------|----------|---------------|
| 1–7（端到端） | **未在本环境执行** | 依赖运行中的全栈与双公司数据 |
| Heartbeat 调度、CEO LangGraph、Orchestrator 单测 | **通过** | 见第 2 节 Jest 结果 |
| 清单与实现差异 | **已记录** | 见第 3 节对照表 |

---

## 7. 优化建议

1. **文档与日志统一**：要么在验收文档中统一采用 **`CEO graph invoke`** 等现有日志关键字，要么在 `runHeartbeat` 入口增加一行 **`Heartbeat started for company: {id}`**，便于运维检索。
2. **集成测试**：为 **`TaskHeartbeatTickListener` → `runHeartbeat`** 增加 **RMQ + API RPC 替身** 的集成测试（如 Testcontainers），固化用例 1 的主路径。
3. **用例 3 明确范围**：在架构文档中说明「部门 Supervisor / Skills 执行」由哪些模块与事件驱动，便于验收分工。
4. **第三轮自动化**：在核心路径稳定后，将「触发 breakdown + 断言任务创建 + 断言完成事件」抽成 **CI 可跑的 E2E 脚本**。

---

## 8. 参考代码位置（便于评审）

| 主题 | 路径 |
|------|------|
| CEO 编排与 Heartbeat | `apps/worker/src/modules/autonomous/autonomous-orchestrator.service.ts` |
| LangGraph 定义 | `infrastructure/ai/src/autonomous/build-ceo-heartbeat-graph.ts` |
| 心跳调度 | `apps/worker/src/modules/tasks/task-heartbeat.scheduler.ts` |
| 心跳监听 | `apps/worker/src/modules/tasks/listeners/task-heartbeat-tick.listener.ts` |
| 预算信号（心跳联动） | `apps/worker/src/modules/billing/listeners/budget-signals-heartbeat.listener.ts` |
| 审批推送（API） | `apps/api/src/modules/collaboration/listeners/autonomous-ceo-approval.listener.ts` |
| Worker 配置 | `apps/worker/src/common/config/config.schema.ts` |

---

*本报告由专项测试与代码对照整理；端到端结果请在部署环境补录「现象、日志片段、截图」后更新第 6 节。*
