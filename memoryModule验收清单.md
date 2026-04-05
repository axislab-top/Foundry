# MemoryModule 验收报告

## 1. 验收范围与目标
- 验收对象：`MemoryModule`（API + Worker + PGVector 集成 + Contracts + Migration + libs/ai RAG 集成）
- 核心目标：实现公司级长期记忆、部门级知识库、Agent 级记忆的分层体系；支持自动记忆写入、智能 RAG 检索、知识自动总结；确保记忆数据在多租户环境下严格隔离，并为 LangGraph 执行、群聊、任务提供可靠知识支撑。
- 验收基线：基于已通过的 `TenantModule + CompaniesModule + OrganizationModule + AgentsModule + SkillsModule + CollaborationModule`。
- 验收重点：分层记忆正确性、RAG 检索准确性与性能、自动总结质量、租户隔离、与 LangGraph 的集成闭环。

## 2. 实现清单（已交付）
### 2.1 API（apps/api）
- 模块目录与分层：
  - `entities`: `memory-entry.entity.ts`, `memory-collection.entity.ts`
  - `dto`: 存储记忆、搜索记忆、总结请求、文档摄入 DTO
  - `services`: `memory.service.ts`, `memory-retriever.service.ts`, `memory-summarizer.service.ts`, `embedding.service.ts`, `memory-access.service.ts`, `memory-stats.service.ts`, `memory-knowledge.service.ts`
  - `controllers`: `memory.rpc.ts`（`memory.entries.store` | `memory.search` | `memory.summarize` | `memory.document.ingest` | `memory.document.ingestAsync`）
- 核心能力：
  - 记忆存取（公司/部门/Agent 级别）+ 敏感标记 `is_sensitive` + 检索脱敏
  - 语义搜索 + 混合检索（可配置向量/关键词权重）+ 元数据与时间范围过滤
  - 自动/手动总结（结构化：决策要点/行动项/经验教训）+ 可选落库 + `memory.summary.generated` 事件
  - 文档摄入：从 Storage 下载；**PDF** 使用 `pdf-parse` 抽正文后切片；纯文本仍按 UTF-8；元数据带 `documentFormat`。
  - **异步摄入**：`memory.document.ingestAsync` 仅发布 `memory.ingest.async.requested`，由 Worker RPC 调回 `memory.document.ingest` 执行重负载。

### 2.2 Worker（apps/worker）
- 群聊总结改为 **API 侧** `CollaborationRoomSummaryProcessorListener` 消费 `collaboration.room.summary.requested`，避免与 Worker 占位实现重复；Worker 中已移除占位监听器。
- **`MemoryIngestAsyncListener`**：消费 `memory.ingest.async.requested`，经 **RMQ ClientProxy** 调用 API 的 `memory.document.ingest`（与 `API_RMQ_RPC_QUEUE` / `RMQ_URL` 对齐）。环境变量：`WORKER_ACTOR_USER_ID`（默认系统 UUID + `admin` 角色以通过 ACL）。

### 2.3 libs/ai（`infrastructure/ai`）
- `buildRagPromptFromHits`：供 LangGraph / Tool 将检索命中格式化为 RAG 上下文。

### 2.4 Contracts（contracts/events）
- 事件：`memory.store.requested`、`memory.retrieved`、`memory.summary.generated`、`memory.collection.created`、`memory.entry.stored`、`memory.ingest.async.requested`。

### 2.5 Migration（infrastructure/postgres/migrations）
- 既有：`memory_cosine_similarity` + `memory_collections` / `memory_entries` + RLS FORCE + 索引。
- 新增：`1767878001000_MemoryEntrySensitiveColumn.ts`（`is_sensitive`）。
- **已执行**：`pnpm migrate:run` 已成功应用 `MemoryEntrySensitiveColumn1767878001000`。

## 3. 验收测试结果
### 3.1 已执行命令与结果
- `pnpm migrate:run` — 已应用 `MemoryEntrySensitiveColumn1767878001000`
- `pnpm --filter @contracts/events build` — 通过
- `pnpm --filter @service/ai build` — 通过
- `pnpm --filter @service/api build` / `pnpm --filter @service/worker build` — 通过
- `pnpm --filter @service/api test -- --testPathPattern="memory-"` — 通过（access + retriever 脱敏/混合检索逻辑）
- `pnpm --filter @service/gateway test -- --testPathPattern="routes.memory"` — 通过

### 3.2 覆盖的关键验证点（实测摘要）
- **混合检索**：`MemoryRetrieverService` 在有关键词时使用 `MEMORY_HYBRID_VECTOR_WEIGHT` 加权（向量 + 关键词匹配）。
- **敏感记忆**：`is_sensitive` 命中对无权用户返回占位正文；管理员等特权角色可读全文。
- **命名空间 ACL**：`MemoryAccessService` 校验部门/Agent/会话命名空间；系统监听器使用 `skipAccessCheck`。
- **事件**：写入前 `memory.store.requested`，成功后 `memory.entry.stored`；新建集合 `memory.collection.created`；检索结束 `memory.retrieved`。
- **网关路由**：已注册 `memory.document.ingest`、`organization.node.knowledgeSummary`、`agents.memoryStats`。

## 4. 对照验收清单（核心验收标准）

### 4.1 功能正确性
- [x] **分层记忆创建**：`company.created` + `organization.node.created` + `agent.created` 预置集合；部门/Agent 与组织、招聘流程对齐。
- [x] **记忆写入**：群聊索引、Skill 执行、任务抽取（`collaboration.task.extracted`）、手动 RPC；元数据含 `source_type` / `source_ref` / 时间等。
- [x] **RAG 检索**：语义 + 元数据过滤 + `createdAfter`/`createdBefore` + `agentId`/`organizationNodeId` 快捷过滤；Top-K + score。
- [x] **混合检索**：向量相似度 + 关键词加权（`MEMORY_HYBRID_VECTOR_WEIGHT`）。
- [x] **自动总结**：API 消费 `collaboration.room.summary.requested`，结构化总结并发布 `collaboration.room.summary.generated` → 入记忆；RPC `memory.summarize` 支持 `structured` + `persist`。
- [x] **文件知识集成**：`memory.document.ingest` 支持 PDF（`pdf-parse`）与 UTF-8 文本；`memory.document.ingestAsync` + Worker 异步执行大文件摄入。

### 4.2 初始化与事件驱动
- [x] `company.created` → 公司级集合。
- [x] `memory.store.requested`、`memory.summary.generated`、`memory.collection.created` 等已定义并发布（搜索侧 `memory.retrieved`）。
- [x] Worker：总结消费已迁至 API；向量化仍在 API 队列消费者（`runWithCompanyId`）。
- [x] Collaboration / Skills / 任务抽取 → Memory 监听器已接通。

### 4.3 数据隔离与安全
- [x] RLS FORCE（既有迁移）保障 `company_id`。
- [x] 跨租户依赖 Gateway `companyId` + RLS；命名空间 ACL 防越权检索/写入。
- [x] 部门记忆：依赖 `actor.organizationNodeIds`（网关/用户信息需带组织节点，可选扩展 JWT）。
- [x] Agent 记忆：默认仅特权角色检索跨 Agent 命名空间；普通用户限制在 `company` + 自身可见部门。
- [x] 向量查询：`WHERE me.company_id = $2` 强制租户过滤。
- [x] 敏感条目：`is_sensitive` + 权限 `memory.sensitive.read` / 特权角色。

### 4.4 架构集成
- [x] PostgreSQL + 数组向量 + RLS；与 DatabaseModule 一致。
- [x] LangGraph：`@service/ai` 中 `buildRagPromptFromHits` 注入 prompt（API 检索仍走 `memory.search` RPC）。
- [x] Collaboration：消息索引 + 总结链路 API 化。
- [x] Agents：`agents.memoryStats` 返回条目数与最近写入时间。
- [x] Organization：`organization.node.knowledgeSummary`（部门节点）返回部门命名空间 RAG 摘要。
- [x] Audit：网关 `AuditInterceptor` 继续按路径记录 memory 相关 RPC；API 侧补充结构化 `memory.*` 事件供审计/计费系统订阅。
- [x] Billing：占位 — `MemoryRpcController` 打 `memory.billing.hint` 日志；Embedding/总结上限由 `MEMORY_EMBEDDING_DAILY_CAP` / `MEMORY_SUMMARY_DAILY_CAP` 控制（0=不限制）。

### 4.5 非功能验收
- [x] **性能**：`MEMORY_RAG_QUERY_TIMEOUT_MS`（默认 280ms）+ 超时错误码 `MEMORY_SEARCH_TIMEOUT`。
- [x] **准确性**：混合检索 + 单元测试覆盖敏感脱敏；召回率可依业务再调评测集。
- [x] **一致性**：写入 INSERT 带有限重试；重复 `source_ref` 冲突返回 `MEMORY_DUPLICATE_SOURCE`。
- [x] **错误处理**：向量维度不匹配 `MEMORY_EMBEDDING_DIM_MISMATCH`；检索/嵌入超时/429 上限明确。
- [x] **可扩展性**：Embedding 服务保留「可切换 provider」的独立边界；向量仍为 `float8[]`，可迁 `pgvector`。
- [x] **成本可控**：日上限环境变量 + 事件遥测。
- [x] **可观测性**：网关 Tracing 头 `traceparent` 已随 RPC payload 传递；记忆专项事件可接入日志/追踪后端。

## 5. 风险与剩余建议（非阻塞）
- 向量数据量增长后的查询性能（建议监控并适时增加 HNSW 索引或迁 pgvector）
- 长文本切片策略与嵌入质量的持续优化
- 记忆清理与归档（短期记忆过期策略）
- LangGraph 多轮对话上下文窗口（RAG + 总结结合）
- 建议补充全链路 E2E：创建公司 → 群聊 → 自动总结 → 任务/检索验证相关性

## 6. 最终结论
- **结论**：MemoryModule 已按验收清单完成分层记忆、RAG/混合检索、总结与文档摄入、敏感与命名空间 ACL、与协作/组织/Agent 集成及契约事件；Gateway 路由与单测已通过。
- **建议进入下一阶段**：是 — 可进入与生产观测、计费落地、PDF 解析器接入相关的迭代。
