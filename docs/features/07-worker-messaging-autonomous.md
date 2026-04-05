# 7. Worker、消息与自治编排

## 7.1 消息与订阅

- Worker 通过 **`@service/messaging`** 订阅 `contracts/events` 中定义的 routing key；队列命名与监听器分布在 `apps/worker/src/modules/*/listeners`。
- 除用户/认证基础事件外，还包含公司、组织、Agent、协作、记忆、任务、计费、模板等域（以当前 `app.module` 导入的模块为准）。

## 7.2 幂等与配置

- **IdempotencyModule**（Worker 全局）：支撑消费侧幂等键策略（与事件中的 `eventId`、`idempotencyKey` 等字段配合，见 [`events-routing-index.md`](../events-routing-index.md)）。

## 7.3 自治与 LangGraph（要点）

- **CEO 心跳图**等编排位于 `infrastructure/ai`（如 `buildCeoHeartbeatGraph`）：ingest → plan → validatePersist → summarize → notify 等节点；心跳与 **`billing.checkAllowance`**、记忆标签等路径联动。
- **TaskHeartbeatScheduler**、**TaskHeartbeatTickListener**、**AutonomousOrchestratorService** 等与 `task.heartbeat.tick`、`autonomous.ceo.heartbeat.completed` 等事件配合。
- **Checkpointer**：生产需配置 `WORKER_CHECKPOINT_DATABASE_URL` 等；未配置时可能退化为内存型 saver。

更细的差距分析（层级 Supervisor、多副本幂等、观测）见根目录 [`项目功能与能力说明.md`](../../项目功能与能力说明.md) 第 7 节与 [`docs/autonomous/`](../autonomous/) 下专题。

---

上一篇：[06-billing-templates-storage.md](./06-billing-templates-storage.md)  
下一篇：[08-observability-boundaries.md](./08-observability-boundaries.md)
