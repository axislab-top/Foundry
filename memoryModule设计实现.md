MemoryModule 详细设计（记忆与知识管理系统）
MemoryModule 是你 AI 公司工厂 项目中长期价值的核心基础设施。它直接解决“公司能越跑越好，而不是用几次就退化”的关键痛点，让整个 AI 公司具备公司级长期记忆、部门级知识库和Agent 级上下文记忆，实现持续学习和经验积累。
1. MemoryModule 的核心定位与目标

定位：AI 公司的“大脑”和“知识中枢”，负责所有历史信息、决策、文档、对话的存储、检索和智能总结。
核心价值：
公司不会“失忆”：历史决策、项目文档、客户信息长期保留。
避免重复劳动：不同部门/Agent 能共享相关知识。
支持 RAG（Retrieval-Augmented Generation）：让 Agent 在对话、任务执行时能智能调用历史记忆。
实现“知识持续学习”：运行过程中自动总结经验，提升未来表现。

与前后模块的强绑定：
CollaborationModule：群聊消息、总结自动进入记忆。
AgentsModule：每个 Agent 有独立短期记忆 + 共享公司/部门记忆。
OrganizationModule：部门级记忆按组织节点隔离。
TasksModule：任务执行过程、结果、教训存入记忆。
SkillsModule：Skill 执行结果可作为知识沉淀。
Worker + LangGraph：Agent 执行时通过 RAG 检索相关记忆。
CompaniesModule：公司创建时初始化 Memory 空间。


2. MemoryModule 应该满足的需求（详细拆解）
1. 分层记忆体系

公司级长期记忆（Company Memory）：
历史决策、重要会议纪要、战略文档、客户信息、公司规章等。
永久保留，可全局检索。

部门级知识库（Department Memory）：
部门专属文档、项目经验、标准操作流程（SOP）。
部门内 Agent 共享。

Agent 级记忆（Agent Memory）：
每个 Agent 的短期上下文（最近 N 轮对话）。
个人专长积累、过往任务记录。

会话级临时记忆（Session Memory）：单次群聊或任务的实时上下文（可总结后转长期）。

2. 核心功能

自动记忆写入：
群聊消息自动向量化并存储。
任务完成、Skill 执行结果自动总结并写入。
定期/事件触发自动生成公司/部门周报、经验教训。

智能检索（RAG）：
支持语义搜索：给定查询，返回最相关的记忆片段。
支持混合检索（向量 + 关键词 + 元数据过滤，如按 company/department/agent/time）。

知识总结与提炼：
自动生成会议纪要、项目复盘、决策摘要。
支持手动触发总结。

文件与外部知识集成：
复用 StorageModule 存储文档（PDF、Word 等）。
文档上传后自动解析、向量化，存入记忆。
支持连接外部系统（Notion、Google Drive、CRM）通过 Skills 拉取知识。


3. 治理与可控性

访问权限：公司级记忆 Owner 可查看；部门记忆部门成员可见；Agent 记忆仅 Agent + 上级可见。
隐私与隔离：严格按 company_id 隔离（RLS FORCE）。
版本与审计：重要记忆变更保留历史，记录谁、在何时、为什么修改/添加。
清理策略：可配置短期记忆自动清理规则；长期记忆可归档。

4. 非功能需求

性能：检索延迟低（< 300ms），支持高频 RAG 调用。
准确性：向量嵌入质量高，检索相关性好。
可扩展性：支持未来增加更多向量数据库或混合存储。
成本控制：向量存储和 embedding 调用纳入 Billing。
可靠性：记忆写入有重试机制，防止丢失。

3. 架构建议（与现有 Foundry 架构融合）
模块结构（apps/api）
textapps/api/src/modules/memory/
├── entities/
│   ├── memory-entry.entity.ts          # 记忆条目（向量 + 元数据）
│   ├── memory-collection.entity.ts     # 集合（公司/部门/Agent）
├── dto/
│   ├── store-memory.dto.ts
│   ├── search-memory.dto.ts
│   ├── summarize.dto.ts
├── services/
│   ├── memory.service.ts
│   ├── memory-retriever.service.ts     # RAG 检索
│   ├── memory-summarizer.service.ts    # 自动总结
│   └── embedding.service.ts            # 向量化
├── listeners/
│   ├── collaboration-message.listener.ts
│   ├── task-completed.listener.ts
│   └── agent-execution.listener.ts
├── memory.module.ts
存储方案推荐（2026 年主流）

主存储：PostgreSQL + PGVector 扩展（强烈推荐）
优点：与现有 DatabaseModule 无缝集成，支持 RLS，运维简单。
每个记忆条目包含：id、company_id、collection_type（company/department/agent）、collection_id、content、embedding vector、metadata (jsonb)、source_type（chat/task/skill/document）。

备选：Qdrant / Weaviate（如果向量规模极大时再考虑独立服务）。
文件存储：复用 StorageModule（MinIO/S3），文档解析后向量化存 PGVector。

关键流程

记忆写入：
事件触发（如 message.received、task.completed）→ MemoryService → Embedding → 存入对应 collection。

RAG 检索：
Agent 执行时 → MemoryRetriever → 向量相似度搜索 + 元数据过滤 → 返回 Top-K 记忆片段 → 注入 Prompt。

自动总结：
定时任务或事件触发 → Summarizer Service（调用 LLM）→ 生成结构化摘要 → 写入长期记忆。


与现有架构集成点

TenantGuard + RLS：所有记忆操作强制 company_id。
Gateway：提供 HTTP 接口查询记忆（搜索、总结）。
Worker：重负载总结、向量化、批量写入放在 Worker 执行。
Messaging：通过事件解耦（memory.store.requested、memory.search.requested）。
CacheModule：热门记忆片段缓存。
AuditModule：记录记忆写入、检索、总结操作。
BillingModule：Embedding 调用和总结 LLM 消耗计费。

4. 实施建议与优先级（分阶段）
阶段 1（基础）：

PGVector 集成 + MemoryEntry 实体 + 基本存取接口 + RLS。

阶段 2（RAG）：

Embedding Service + Retriever + 与 LangGraph 集成（Agent 执行时注入记忆）。

阶段 3（自动总结）：

Summarizer Service + 群聊/任务总结流程。

阶段 4（高级）：

文件解析集成、外部知识源、知识图谱探索、记忆清理策略。

潜在风险与注意事项：

向量维度与嵌入模型一致性（建议统一使用一个 embedding 模型）。
成本控制：高频 RAG 需要优化检索策略（Hybrid Search +  rerank）。
数据量增长：PGVector 大表查询性能需监控，必要时分区。
隐私：敏感记忆需额外加密或访问控制。


总结：
MemoryModule 的设计重点是分层记忆架构 + 高性能 RAG 检索 + 自动知识提炼。它将让你的 AI 公司具备“学习能力”和“记忆力”，从一次性工具变成可持续运行的智能实体，是实现“公司越跑越好”的关键。
这个模块做好后，结合 Collaboration、Agents、Skills，你的 AI 公司将形成完整的“感知-记忆-思考-行动”闭环。