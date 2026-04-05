# 领域事件与路由键索引

| routingKey / eventType | 典型发布方 | 典型订阅方 | 幂等建议 |
|------------------------|------------|------------|----------|
| `collaboration.task.extracted` | API `ChatMessageService` | API `CollaborationTaskExtractedTasksListener`、`CollaborationTaskExtractedMemoryListener` | 业务层去重 |
| `task.completed` | API `TasksService` | Worker 计费 / API Memory 等 | `eventId` |
| `task.heartbeat.tick` | Worker `TaskHeartbeatScheduler` | Worker `TaskHeartbeatTickListener`、预算信号 | `companyId+tickAt` |
| `autonomous.ceo.heartbeat.completed` | Worker `AutonomousOrchestratorService` | 审计 / 后续订阅 | `eventId` |
| `billing.consumption.requested` | Worker `AgentExecutionService`、CEO plan | Worker `BillingConsumptionRequestedListener` | `idempotencyKey` |
| `organization.structure.changed` | API `OrganizationService` | Worker 组织监听器；Redis `org:structure_changed` 经 `collab:notify` | `eventId` |
| `template.imported` | API 模板导入流程 | Worker `TemplateImportedListener` | `template.imported:${eventId}` |

完整列表见 [`架构.md`](../架构.md) 中 MQ 一节。
