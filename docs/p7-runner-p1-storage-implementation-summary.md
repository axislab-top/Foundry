# P7 Runner + P1 存储租户前缀 — 实施总结

**范围**：`apps/runner`（命令执行网关）、`apps/api` 存储层强制多租户路径、`apps/worker` ESLint 与 Runner RPC 客户端。  
**日期参考**：2026-04（与仓库当前实现对齐）。

---

## 1. 目标与架构原则

### 1.1 Runner 唯一入口

- **全平台用户级 shell / 操作系统命令执行**（脚本、构建、`exec` 语义）的合法入口为 **`apps/runner`**：经 RabbitMQ `runner.*` RPC → 策略引擎 →（审批 token）→ Kubernetes Job + gVisor。
- **`apps/worker`、`apps/api` 及业务库**不得新增「在自身进程内执行用户/Agent 提交命令」的路径；Worker 侧通过 ESLint 禁止直接 `import` `child_process`。

**合并前已打标（P8 迁移提醒）**：下列位置已增加统一 TODO，提示后续必须把真实命令执行迁到 `runner.execute` RPC（当前仍为临时路径）：

- [`apps/worker/src/modules/tasks/pending-agent-tasks.service.ts`](apps/worker/src/modules/tasks/pending-agent-tasks.service.ts) — 调用 `agentExecution.executeSkill` 之前  
- [`apps/worker/src/modules/autonomous/autonomous-orchestrator.service.ts`](apps/worker/src/modules/autonomous/autonomous-orchestrator.service.ts) — `graph.invoke`（LangGraph / ToolRegistry）之前  
- [`apps/worker/src/modules/agents/services/agent-execution.service.ts`](apps/worker/src/modules/agents/services/agent-execution.service.ts) — `registry.execute` 之前  
- [`apps/worker/src/modules/company-runtime/company-orchestrator.service.ts`](apps/worker/src/modules/company-runtime/company-orchestrator.service.ts) — `runBreakdown` 委托 `AutonomousOrchestrator` 处  

### 1.2 存储多租户（P1）

- 所有 **StorageService** 操作需显式 **`companyId`**，对象键经 **`storage-tenant-path.util`** 解析。
- **写操作**：统一落在 `companies/{companyId}/...`（含 `.../memory/...`），**禁止**向 legacy `memory/{companyId}/...` 根写入。
- **读操作**：兼容 **新前缀** `companies/{companyId}/memory/...` 与 **旧前缀** `memory/{companyId}/...`；另支持历史 **平台级** 键 `skills/*`、`platform/*`（只读透传，见下文）。

---

## 2. P7：`apps/runner`

| 能力 | 说明 |
|------|------|
| 进程入口 | `src/main.ts`：RMQ 微服务 + 健康检查 HTTP（约 3010） |
| 配置 | `src/config/runner-env.schema.ts`（Joi）：`RMQ_URL`、`RUNNER_RMQ_QUEUE`、`RUNNER_EXEC_MODE`（`mock` \| `kubernetes`）、K8s 命名空间、gVisor `runtimeClassName`、Job 镜像、`API_RMQ_RPC_QUEUE`、`RUNNER_SYSTEM_ACTOR_ID` 等 |
| 策略 | `src/policy/command-policy.engine.ts`：默认拒绝、allow 前缀、高危规则 → `deny` / `needsApproval`，`policyDecisionId` |
| 沙箱 | `src/sandbox/sandbox.service.ts`：mock 合成 ID；K8s 模式确保公司维度 PVC（labels 等） |
| 执行 | `src/runtime/gvisor-job.runner.ts`：Batch Job、`runtimeClassName`、非 root（如 uid 65534）、`/workspace` 挂载 PVC |
| 编排 | `src/execution/execution.service.ts`：`needsApproval` 必须带 **execution token**，经 **`approval.consumeExecutionToken`**（API RMQ）校验后再创建 Job；类顶部 **JSDoc** 写明「不得在本进程执行用户命令」及 **审批令牌从创建 → `executionTokenId` → `consumeExecutionToken` → 成功/失败** 的完整链路 |
| RPC | `src/rpc/runner.rpc.controller.ts`、`runner-dto.ts`：`runner.space.ensure`、`runner.policy.evaluate`、`runner.execute` |
| API 客户端 | `src/clients/api-rpc.client.module.ts`：`API_RPC_CLIENT` → `api-rpc-queue` |
| 常量 | `src/constants/runner.constants.ts`：`RUNNER_EXEC_ACTION = 'runner.exec'`（须与审批 token 的 `action` 一致） |

**运维产物**：根目录构建的 [`apps/runner/Dockerfile`](apps/runner/Dockerfile)；[`infrastructure/k8s/runner/deployment.yaml`](infrastructure/k8s/runner/deployment.yaml)、[`runtimeclass-gvisor.yaml`](infrastructure/k8s/runner/runtimeclass-gvisor.yaml)。

**实现注意**：`@kubernetes/client-node` 0.22 部分 API 为**位置参数**；可选参数末尾需传 `{ headers: {} }` 等形式，避免把普通对象误当作最后一参 options。

**本地无集群**：`RUNNER_EXEC_MODE=mock` 时不创建真实 Job/PVC，仅记录结构化日志并返回合成标识。

---

## 3. Worker 侧

- **RPC 客户端**：[`apps/worker/src/common/rpc/worker-runner-rpc.module.ts`](apps/worker/src/common/rpc/worker-runner-rpc.module.ts) — `RUNNER_RPC_CLIENT` → `RUNNER_RMQ_RPC_QUEUE`（默认 `runner-rpc-queue`）。
- **配置**：`config.schema` / `config.service` — `getRunnerRpcQueue()`。
- **ESLint**：根 [`.eslintrc.cjs`](.eslintrc.cjs) 对 `apps/worker/**/*.ts` 增加 `no-restricted-imports`：`child_process`、`node:child_process`。

---

## 4. P1：`apps/api` 存储与控制器

### 4.1 路径解析

- 核心：[`apps/api/src/modules/files/storage/storage-tenant-path.util.ts`](apps/api/src/modules/files/storage/storage-tenant-path.util.ts)  
  - `resolveTenantObjectKey(companyId, rawPath, 'read'|'write')`  
  - `resolveTenantListPrefix`（列表前缀）  
  - **`PLATFORM_SCOPE_COMPANY_ID`**：占位 UUID，用于 **StorageService** 签名上必须传的 `companyId`；当解析结果为 `skills/*` 或 `platform/*` 读路径时，该 id 不参与键拼接。

### 4.2 StorageService

- [`storage.service.ts`](apps/api/src/modules/files/storage/storage.service.ts)：所有方法带 **`companyId`**；内部统一走 tenant path util。

**写操作强制行为（合并前已用单测固定）**

| 场景 | 行为 |
|------|------|
| `companyId` 缺失或空白 | `assertCompanyId` → **`BadRequestException`**（`companyId is required`）；**不会**调用适配器 |
| `upload` / `delete` 等写路径使用 legacy **`memory/{companyId}/...`** 根 | `resolveTenantObjectKey(..., 'write')` 命中「writes_must_use_companies_prefix」→ **`BadRequestException`**；**不会**写入旧前缀 |
| 正常上传相对路径 `uploads/x` | 解析为 **`companies/{companyId}/uploads/x`** 再交给适配器 |

**用例位置**：[apps/api/src/modules/files/storage/storage.service.spec.ts](apps/api/src/modules/files/storage/storage.service.spec.ts) — `throws without companyId`（upload/delete）、`throws on write path using legacy memory/{companyId}/ root`。

**说明**：未在本文档中单独跑真实 MinIO/S3 集成测试；**单元测试**断言 `StorageService` 传给适配器的 key 已带 `companies/{companyId}/` 前缀，与生产 MinIO 写入路径一致。

### 4.3 HTTP / RPC

- [`files.controller.ts`](apps/api/src/modules/files/files.controller.ts)：`x-company-id` / 上下文 `requireCompanyId`。
- [`files.rpc.controller.ts`](apps/api/src/modules/files/files.rpc.controller.ts)：DTO **必填 `companyId`**；`isTenantMemoryScope` 同时支持 `companies/{id}/memory/...` 与 `memory/{id}/...`；错误通过 `toRpcError` 转为 `RpcException`。

### 4.4 适配器纵深断言

- MinIO / S3 / OSS / Local：对象键须以 **`companies/`**、**`memory/`**（legacy 读）、**`skills/`** 或 **`platform/`** 之一开头，防止裸键落桶。

### 4.5 其他模块调用 StorageService

以下路径在改造后使用 **(companyId, path)** 签名：

- [`memory.service`](apps/api/src/modules/memory/services/memory.service.ts) — `ingestTextFile` 使用 `params.companyId`。
- [`skills.service`](apps/api/src/modules/skills/services/skills.service.ts) — 租户导入 artifact 使用租户 `companyId`。
- [`skills-admin.service`](apps/api/src/modules/skills/services/skills-admin.service.ts) — 全局 Skill 工件使用 **`PLATFORM_SCOPE_COMPANY_ID`** + 存储中的完整键（若为 `skills/...` 则读透传）。

---

## 5. 审批与 Runner 的契约

- 需审批的执行：策略返回 **`needsApproval`** 时，请求必须携带已由 API 签发的 **execution token**，Runner 调用 **`approval.consumeExecutionToken`** 成功后才创建 Job。
- 审批 token 的 **`action`** 须与常量 **`runner.exec`**（`RUNNER_EXEC_ACTION`）一致，否则消费会失败。

**源码级说明（请以代码为准）**：[`apps/runner/src/execution/execution.service.ts`](apps/runner/src/execution/execution.service.ts) 文件头 **JSDoc** 逐步说明：`needsApproval` 时 **`executionTokenId` 的来源与 RPC 载荷**、`approval.consumeExecutionToken` 的调用方式、成功/失败时是否创建 Job。

---

## 6. 验收证据（自动化测试，2026-04-12）

在仓库根目录执行：

```bash
pnpm --filter @service/runner exec jest --config ./jest.config.cjs
pnpm --filter @service/api exec jest src/modules/files/storage/storage.service.spec.ts
```

| 检查项 | 结果 | 证据 |
|--------|------|------|
| **mock 模式** `runner.execute` 等价路径（`ExecutionService.execute`，allowlist 命令 `git status`）返回 **`sandboxId`**、**`jobName`**（`runner-mock-*`）、**`mode: 'mock'`**，且 `GvisorJobRunner` 打 **`mock_job` 结构化日志**（由 `Logger.log` 输出） | 通过 | [`apps/runner/src/execution/execution.service.spec.ts`](apps/runner/src/execution/execution.service.spec.ts)：`mock mode: allowlisted git status returns sandboxId...` |
| 高危命令 **`rm -rf /workspace`**：`PolicyEngine` 判为 **`needsApproval`**；无 **`executionTokenId`** 时 **`RpcException` 403**（`command_requires_approval_token`） | 通过 | [`command-policy.engine.spec.ts`](apps/runner/src/policy/command-policy.engine.spec.ts)：`needsApproval for rm -rf /workspace`；[`execution.service.spec.ts`](apps/runner/src/execution/execution.service.spec.ts)：`rm -rf /workspace is needsApproval without token` |
| **MinIO 写入路径**：`StorageService.upload` 传给适配器的 key **强制** `companies/{companyId}/...` | 通过 | [`storage.service.spec.ts`](apps/api/src/modules/files/storage/storage.service.spec.ts)：`should upload file with tenant prefix`（`expect(adapter.upload).toHaveBeenCalledWith(..., companies/${companyId}/uploads/x, ...)`） |

**全量构建（合并前建议再跑）**

1. `pnpm --filter @service/runner run build`
2. `pnpm --filter @service/api run build`
3. `pnpm --filter @service/worker run build`
4. 联调：`RUNNER_EXEC_MODE=mock` + RMQ 环境下对真实 `runner.execute` RPC 再验一轮（本表为 **无外部依赖的单元/组件测试** 证据）。

---

## 7. 已知后续项（非本次必做）

- **API 网关** `rpc-patterns`：若需从网关转发 `runner.*`，再补白名单与路由（当前设计可为 Worker → Runner 直连队列）。
- 计划文件 [`.cursor/plans/p7_runner_+_p1_minio_68b54244.plan.md`](.cursor/plans/p7_runner_+_p1_minio_68b54244.plan.md) 内 YAML todo 状态可与仓库同步更新。
- **P8**：Worker 执行点迁移至 **`runner.execute`** 的轻量路线图见 [`docs/p8-worker-runner-migration-plan.md`](p8-worker-runner-migration-plan.md)；Billing、VolumeSnapshot 等按路线图迭代。

---

## 8. 相关文档

- 详细设计与规则表：[`.cursor/plans/p7_runner_+_p1_minio_68b54244.plan.md`](.cursor/plans/p7_runner_+_p1_minio_68b54244.plan.md)
- P8 Worker → Runner：[`docs/p8-worker-runner-migration-plan.md`](p8-worker-runner-migration-plan.md)
