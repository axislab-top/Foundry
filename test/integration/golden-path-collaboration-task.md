# 黄金路径：群聊 → 任务 → 记忆（手动/CI 验收）

自动化全链路依赖 RabbitMQ、Postgres 与 API；本文件作为 **验收清单**。

1. **发送含任务关键词的文本**（如 `[任务]` 或 `TODO`）到某聊天室（见 `ChatMessageService.publishTaskExtractedIfHeuristic`）。
2. **断言** 消息队列出现 `collaboration.task.extracted`。
3. **断言** `tasks` 表出现 `metadata.source = collaboration_extract` 的任务。
4. **断言** Memory 侧写入与房间/组织命名空间相关的条目（`CollaborationTaskExtractedMemoryListener`）。
5. （可选）任务指派为 Agent 后，Worker `PendingAgentTaskExecutionService` 在心跳后执行技能并更新任务状态。

与 [`docs/events-routing-index.md`](../../docs/events-routing-index.md) 对照事件流。

## 扩展验收（Option 2）：WS/Redis + 前端可见状态 + Summary/Memory

目标：验证真实用户链路中，`stream_chunk` 走 WS 实时渲染，但不会污染消息总结与记忆写入。

1. **准备环境**
   - 启动 `gateway/api/worker/redis/rabbitmq/postgres`（建议使用测试 compose 组合）。
   - 准备一个有效登录用户（`owner/admin`）与测试公司、主协作房间。

2. **触发流式输出**
   - 在协作房间发送触发 CEO/Agent 执行的消息（例如 `@CEO` + 明确任务描述）。
   - 观察 WebSocket `message:chunk` 事件持续到达（同一 `streamId`，带 `chunkIndex/chunkCount`）。
   - 前端消息流中出现“正在生成”占位，并随 chunk 更新内容。

3. **验证任务审批（review）**
   - 当任务进入 `review` 时，前端收到 `approval:needed`。
   - 点击“通过/拒绝/修改”之一：
     - 通过：任务进入 `in_progress`，后续可执行。
     - 拒绝：任务进入 `blocked`，不再自动执行。
   - 验证 `approvalId` 不匹配时，API 拒绝请求（防绕过）。

4. **验证 Summary 输入过滤**
   - 触发房间 summary（可等待定时/阈值或人工触发对应流程）。
   - 检查 summary 输入文本仅包含普通消息，不包含 `messageType=stream_chunk` 的内容。

5. **验证 Memory 写入过滤**
   - 触发 memory index/consolidation。
   - 检查 memory 存储条目来自有效文本消息，不包含 `stream_chunk` 片段。

6. **证据清单（最少）**
   - 网关/前端日志：收到多条 `message:chunk`（同一 `streamId`）。
   - 任务状态变更日志：`review -> in_progress` 或 `review -> blocked`。
   - summary 结果或输入快照：无 `stream_chunk` 文本。
   - memory 写入日志/条目：无 `stream_chunk` 文本。

### 自动化回归建议（已落实到代码）

- `apps/worker/src/modules/tasks/pending-agent-tasks.service.spec.ts`
  - 断言：`review + requiresHumanApproval` 不会被 Worker 自动执行。
- `apps/api/src/modules/memory/listeners/collaboration-memory-index.listener.spec.ts`
  - 断言：`stream_chunk` 消息不会触发 memory 存储与 consolidation 发布。
