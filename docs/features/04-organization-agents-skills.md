# 4. 组织、Agent 与技能

## 4.1 组织（Organization）

- **OrganizationModule**：组织树、节点、结构变更；配套审计能力（迁移与实体见 `infrastructure/postgres/migrations` 中组织相关脚本）。
- 结构变更事件（如 `organization.structure.changed`）可被 Worker 与其他域消费，用于协作通知等（见 [`events-routing-index.md`](../events-routing-index.md)）。

## 4.2 Agent

- **AgentsModule**：Agent 生命周期、与组织节点联动（例如节点迁移时的同步）、技能绑定与审批等控制面；网关已配置对应 RPC 路由。

## 4.3 技能（Skills）

- **SkillsModule**：平台/组织技能管理、执行与日志等相关表结构（迁移如 `1767873000000`、`1767874000000`、`1767874002000` 等）。
- Worker 侧可将技能与 **Builtin 工具**、LangGraph 编排逐步打通；具体执行链依赖配置与 `infrastructure/ai`。

---

上一篇：[03-tenant-account-companies.md](./03-tenant-account-companies.md)  
下一篇：[05-collaboration-memory-tasks.md](./05-collaboration-memory-tasks.md)
