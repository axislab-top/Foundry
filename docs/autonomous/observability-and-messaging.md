# 自治与消息运维

## LangGraph Checkpoint

- 生产环境应设置 `WORKER_CHECKPOINT_DATABASE_URL`，否则使用内存 `MemorySaver`（重启丢失）。
- Schema 由 `LANGGRAPH_CHECKPOINT_SCHEMA` 控制（默认 `langgraph_checkpoint`）。

## 心跳多副本

- `task.heartbeat.tick` 按公司发布；多 Worker 实例可能导致 **同一 tick 多次执行** CEO 图。
- 缓解：单调度源、或基于 Redis/DB 的 **租约锁**（按 `companyId`+`tickAt`），后续可增强。

## 关键队列与 DLQ

- RabbitMQ 适配器在 `subscribe` 启用 `retry` 时声明 **主队列 + `.retry` + `.dlq`**（见 `infrastructure/messaging`）。
- 建议对 `template.imported`、`worker-task-heartbeat-tick` 等路径统一开启 `retry`；毒消息自 DLQ 人工检视后回放。

## 可观测性

- CEO 图各节点应携带同一 `traceId`（已在 `AutonomousOrchestratorService` 状态与日志中）。
- 与 OpenTelemetry 集成时，建议以 `traceId` 为 span attribute，在 `ingest` / `plan` / `hierarchicalExpand` / `validatePersist` / `notify` 上分段。

## 危险 Skill 占位

- `WORKER_ALLOW_UNSAFE_SKILL_STUBS`（默认 `false`）：为 `false` 时不注册 `file-read` / `code-run` 占位 builtin，避免误用。
