# 8. 可观测性、周边服务与能力边界

## 8.1 可观测与治理（跨服务）

- **健康检查**：各应用暴露 `/api/health`（以各 `main.ts` 与 Health 模块为准）。
- **指标**：网关等处导出 Prometheus 指标；API/Worker 可按 `MonitoringModule` 配置扩展。
- **审计日志**：网关侧审计拦截器 + 审计实体（含 `companyId` 等字段的迁移扩展）。
- **链路追踪 / 日志拦截**：以各服务 `TracingModule`、`LoggingInterceptor` 等实现为准。

## 8.2 Webhooks 服务

- **apps/webhooks**：`POST /api/webhooks/receive` 接收外部事件；配置 CRUD、历史与带重试的出站转发。详细路由见 [`architecture/implemented-features.md`](../architecture/implemented-features.md) 第 4 节。

## 8.3 独立日志服务（可选）

- **apps/logging**：`POST /api/logs`（含批量）、查询接口；处理链含脱敏与多种存储后端。查询侧在生产环境常需对接 Elasticsearch/Loki 等，而非仅内存查询。

## 8.4 诚实边界

- 本文档系列描述的是**代码库已挂载的模块、路由、迁移与事件契约**所体现的能力；运行需配置 **数据库、消息队列、对象存储、AI 密钥** 等（`.env.shared`）。
- **默认交付**以网关、API、Worker 为核心；前端客户端不在此系列展开。
- **Skills 执行细节、模型选型** 依赖运行时与 `infrastructure/ai`，以环境为准。

---

上一篇：[07-worker-messaging-autonomous.md](./07-worker-messaging-autonomous.md)  
返回索引：[README.md](./README.md)
