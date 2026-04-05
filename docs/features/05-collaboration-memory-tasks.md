# 5. 协作、记忆与任务

## 5.1 协作（Collaboration）

- **CollaborationModule**：房间、消息、成员等控制面 API；网关 HTTP 与 **WebSocket** 配合使用。
- **异步事件**：消息到达、成员进出、部门加入等由 Worker 监听处理；与组织变更通知的联动见事件索引。

## 5.2 记忆（Memory）

- **MemoryModule**：检索、文档摄入、摘要等 RPC 能力；异步 **ingest** 由 Worker（`MemoryWorkerModule`）消费与处理。
- 与 **任务完成** 等事件联动：可将任务结果写入公司级记忆（监听器与契约以 `contracts/events` 与 API/Worker 实现为准）。

## 5.3 任务（Tasks）

- **TasksModule**：任务 OS 相关控制面——仪表盘、拆解、日志等。
- **Worker**：任务拆解、**心跳 tick**（`task.heartbeat.tick`）、与 **Autonomous（LangGraph）** 编排联动；计费前置校验、预算信号等见 [`events-routing-index.md`](../events-routing-index.md) 与自治专项文档。

---

上一篇：[04-organization-agents-skills.md](./04-organization-agents-skills.md)  
下一篇：[06-billing-templates-storage.md](./06-billing-templates-storage.md)
