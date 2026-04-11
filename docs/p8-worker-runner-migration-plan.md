# P8 轻量实施计划 — Worker 执行点 → `runner.execute` RPC

> **目标**：将当前 Worker 内标记为临时路径的「命令/执行」能力，统一迁移到 **`apps/runner`** 的 **`runner.execute`**（及必要的 `runner.space.ensure` / `runner.policy.evaluate`），使 **G1「唯一入口」** 与 **G2「策略全覆盖」** 可验收闭环。  
> **范围**：仅 **迁移路径** 与 **防护措施**；不含产品功能扩展。

---

## 1. 迁移路径（建议顺序）

| 阶段 | 内容 | 说明 |
|------|------|------|
| **P8.0 清单** | 全仓 `// TODO: P8`、内置 Skill、ToolRegistry handler、LangGraph tool 节点 | 建立「会触发操作系统级执行」的调用图；区分 **HTTP 外呼** / **本机命令**（仅后者进 Runner）。 |
| **P8.1 封装** | 在 Worker 新增薄封装 `RunnerExecutionClient`（或扩展现有 `RUNNER_RPC_CLIENT` 模块） | 统一传入 `companyId`、`runId`（与任务/trace 对齐）、`commandLine`、`executionTokenId?`；处理 **`RpcException` / 超时 / 重试策略**（谨慎：命令非幂等）。 |
| **P8.2 待办热点** | 已打标文件优先：`pending-agent-tasks.service.ts`、`autonomous-orchestrator.service.ts`、`agent-execution.service.ts`、`company-orchestrator.service.ts` | 将 **`registry.execute` / `graph.invoke` 链路上** 等同于 shell 的路径改为 `runner.execute`；保留纯 LLM/纯 RPC 逻辑不动。 |
| **P8.3 审批衔接** | 策略 **`needsApproval`** 的命令 | 上游在调用 `runner.execute` 前完成 API 审批，拿到 **`executionTokenId`**；与现有 `RUNNER_EXEC_ACTION`（`runner.exec`）对齐。 |
| **P8.4 可观测** | 日志与（可选）OTel | 将 Runner 返回的 **`sandboxId` / `jobName` / `policyDecisionId`** 写入现有 `WorkerExecutionLog` 或 trace 属性，便于 **G5** 后续接线。 |
| **P8.5 开关与灰度** | 配置项如 `WORKER_USE_RUNNER_FOR_SHELL` | 默认逐步打开；mock / staging 先跑通再生产 K8s。 |

---

## 2. 防护措施（必须保留或加强）

| 类别 | 措施 |
|------|------|
| **工程** | 维持 Worker **`no-restricted-imports`**（`child_process`）；PR 中 **禁止** 新增进程内执行用户命令。 |
| **运行时** | 所有用户/Agent 衍生命令 **只** 经 Runner；Runner 内继续 **禁止** `child_process`（仅 K8s Job + gVisor 路径）。 |
| **策略** | 默认 deny + allowlist；高危 **`needsApproval`**；与 **`approval.consumeExecutionToken`** 一致。 |
| **多租户** | `runner.execute` 载荷始终带 **`companyId`**；与 PVC / Job label 一致；存储仍只走 **P1 `StorageService`**，不绕过租户 key。 |
| **滥用面** | 速率/并发配额（按公司）、命令超时、Job activeDeadline；可选审计 RPC（谁发起了 `runner.execute`）。 |
| **测试** | 契约测试：`RUNNER_RPC_CLIENT` → 队列；集成测试 mock 模式；高危命令策略单测已在 Runner，Worker 侧补 **端到端假 Runner** 或 testcontainer。 |

---

## 3. 完成判据（供验收）

- Worker **无** 绕过 Runner 的 shell 执行路径（静态扫描 + 代码审查 + 关键 E2E）。
- **`runner.execute`** 为技能/任务中「命令执行」的 **唯一** 出口；TODO 清除或改为指向封装层。
- 文档：`docs/当前对齐差距报告.md` 中 **G1/G2** 可由「部分修复」更新为「已满足本阶段口径」（与 CPO 约定一致）。

---

## 4. 参考

- Runner RPC 与策略：[`apps/runner/src/rpc/runner.rpc.controller.ts`](../apps/runner/src/rpc/runner.rpc.controller.ts)、[`execution.service.ts`](../apps/runner/src/execution/execution.service.ts)  
- Worker 客户端：[`apps/worker/src/common/rpc/worker-runner-rpc.module.ts`](../apps/worker/src/common/rpc/worker-runner-rpc.module.ts)  
- P7+P1 总结：[`docs/p7-runner-p1-storage-implementation-summary.md`](p7-runner-p1-storage-implementation-summary.md)
