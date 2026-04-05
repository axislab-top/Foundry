# 03 — 边界、差距与环境依赖（诚实说明）

本节回答「**不能默认成立**」的部分，避免将**代码存在**等同于**生产就绪**。细节与根目录 [`项目功能与能力说明.md`](../../项目功能与能力说明.md) 第 7 节一致处不再展开，此处强调**检查层面的结论**。

---

## 1. 环境依赖（无配置则无能力）

| 依赖 | 影响 |
|------|------|
| PostgreSQL + 迁移 | 多租户 RLS、各域表；未迁移则 API/Worker 行为不可用或异常 |
| 消息队列（如 RabbitMQ） | 事件发布/订阅；Worker 监听器无队列则无异步处理 |
| Redis（若启用） | 缓存、协作 WebSocket 多实例适配等（以实际配置为准） |
| 对象存储（MinIO/S3/OSS 等） | 文件上传下载与 URL |
| AI/向量相关密钥与端点 | 记忆检索质量、LangGraph 调用、摘要等 |
| `WORKER_CHECKPOINT_DATABASE_URL` 等 | LangGraph Checkpointer；未配置可能退化为内存，**不适合多副本生产** |

仓库内可参考 `.env.shared` 与各应用 `config.schema`（以代码为准）。

---

## 2. 安全与网关中间件

Gateway 实现了签名、防重放、CSRF、IP 过滤等中间件，且对**未携带对应 Header 的请求**常采用**跳过**策略以便兼容纯 JWT 调用。

**边界**：「代码已挂载」≠「所有客户端已按严格模式接入」。若产品要求强制签名校验或防重放，需在联调中显式约定 Header 与失败响应，并补充自动化用例。

---

## 3. 自治与 LangGraph

根目录文档已说明：当前 CEO 心跳等图多为**线性流水线**，**层级 Supervisor（多层委派）**若作为卖点需单独设计与实现验证。

**边界**：Heartbeat、预算 RPC、记忆写入等路径在代码中存在，但**调度一致性、故障恢复、多副本幂等**仍需运维与测试加固。

---

## 4. Worker 与「实现清单」文档

`docs/architecture/implemented-features.md` 对 Worker 的描述偏旧；**真实监听器列表**以 `apps/worker/src/modules/**/listeners` 为准（见 [`01-inspection-report.md`](./01-inspection-report.md)）。

**边界**：监听器存在 ≠ 每个监听内的业务都已「完整落库/通知外部」；部分仍为最小可运行实现或依赖后续迭代。

---

## 5. 测试与构建

- **已执行**：2026-03-29 对 `@service/api`、`@service/gateway`、`@service/worker` 的 **Turbo build 成功**。
- **未在本检查中执行**：全仓 `pnpm test`、集成测试、负载与安全渗透测试。

**边界**：通过构建是**必要非充分**条件。

---

## 6. 建议的后续动作（与根文档一致）

1. 选 1～2 条 **E2E 黄金路径**（含事件与计费），固化自动化集成测试。
2. 自治：明确单层 CEO 与多层 Supervisor 的产品边界，并补齐检查点与监控。
3. Skills：从内置占位走向 **DB 技能 → 运行时注册 → LangGraph 工具** 的闭环验收。
4. 同步更新 `implemented-features.md` 中 Worker 小节，避免评审误判。

---

上一篇：[02-user-needs-matrix.md](./02-user-needs-matrix.md)
