# Foundry 已实现功能文档（系列索引）

本目录为**按域拆分的功能说明**，与仓库根目录 [`项目功能与能力说明.md`](../../项目功能与能力说明.md) 互补：根文档提供一页式总览与差距分析；此处便于按主题查阅与评审。

更细的端到端链路与图示见 [`架构.md`](../../架构.md)。网关安全与路由的验收要点另见 [`architecture/overview.md`](../architecture/overview.md)。

---

## 阅读顺序建议

| 序号 | 文档 | 内容摘要 |
|------|------|----------|
| 1 | [01-overview-and-services.md](./01-overview-and-services.md) | 项目定位、Monorepo 服务拆分、contracts / infrastructure |
| 2 | [02-gateway-access-and-realtime.md](./02-gateway-access-and-realtime.md) | 网关、RPC 转发、安全中间件、协作 WebSocket |
| 3 | [03-tenant-account-companies.md](./03-tenant-account-companies.md) | 多租户与 RLS、用户、认证、OAuth |
| 4 | [04-organization-agents-skills.md](./04-organization-agents-skills.md) | 组织树、Agent、技能 |
| 5 | [05-collaboration-memory-tasks.md](./05-collaboration-memory-tasks.md) | 协作房间、记忆、任务 OS |
| 6 | [06-billing-templates-storage.md](./06-billing-templates-storage.md) | 计费、模板与商城、文件存储 |
| 7 | [07-worker-messaging-autonomous.md](./07-worker-messaging-autonomous.md) | Worker、领域事件、自治编排要点 |
| 8 | [08-observability-boundaries.md](./08-observability-boundaries.md) | 可观测性、Webhooks/日志服务、能力边界 |

---

## 相关索引

- 领域事件与路由键：[`events-routing-index.md`](../events-routing-index.md)
- 协作 WebSocket 约定：[`collaboration-websocket-contract.md`](../collaboration-websocket-contract.md)

---

*若实现演进，请同步更新本系列及根目录《项目功能与能力说明》。*
