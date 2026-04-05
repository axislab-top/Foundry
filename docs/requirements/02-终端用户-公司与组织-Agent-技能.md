# 2. 终端用户 — 公司、组织、Agent 与技能

以下能力均经网关 **`/api/v1`** 访问，默认 **需 JWT**（与路由表 `authRequired: true` 一致）。

## 2.1 公司（Companies）

| 需求 ID | 用户故事 | API 形态（网关 → RPC） | 验收要点 |
|---------|----------|------------------------|----------|
| CO-01 | 我能在租户内**列出/查看**公司信息。 | `GET /v1/companies`、`GET /v1/companies/:id` → `companies.findAll` / `findOne` | 分页与筛选符合 DTO；仅本租户数据。 |
| CO-02 | 我能**创建**公司实体（权限以业务规则为准）。 | `POST /v1/companies` → `companies.create` | 必填字段校验；重复或冲突可预期。 |
| CO-03 | 我能**更新**公司信息。 | `PATCH /v1/companies/:id` → `companies.update` | 部分更新生效。 |
| CO-04 | 我能变更公司**状态**（如启用/停用，具体枚举以实现为准）。 | `PATCH /v1/companies/:id/status` → `companies.changeStatus` | 非法状态转换拒绝。 |

## 2.2 组织结构（Organization）

| 需求 ID | 用户故事 | API 形态 | 验收要点 |
|---------|----------|----------|----------|
| ORG-01 | 我能查看组织**树形结构**。 | `GET /v1/organizations/tree` → `organization.tree` | 树结构完整、顺序合理。 |
| ORG-02 | 我能**增删改**组织节点。 | `POST /v1/organizations/nodes`；`PATCH/DELETE .../nodes/:id` | 父子关系与约束校验。 |
| ORG-03 | 我能**移动**节点到新的父节点下。 | `PATCH /v1/organizations/nodes/:id/move` → `organization.node.move` | 成环或非法移动被拒绝。 |
| ORG-04 | 我能查看某节点下的 **Agent 列表**、**汇报链**。 | `GET .../nodes/:id/agents`、`GET .../reportingChain` | 与组织数据一致。 |
| ORG-05 | 我能管理节点与**技能**的绑定关系。 | `GET .../skills`；`POST .../skills/bind`；`POST .../skills/unbind` | 绑定后 Agent/组织视图可见性正确。 |
| ORG-06 | 我能查看组织相关**审计日志**（若启用）。 | `GET /v1/organizations/audit-logs` → `organization.audit.logs` | 过滤与分页。 |
| ORG-07 | 我能获取节点的**知识摘要**（可能为长耗时）。 | `GET .../knowledge-summary`（超时配置较高，如 30s） | 超时与空数据行为可预期。 |

## 2.3 Agent

| 需求 ID | 用户故事 | API 形态 | 验收要点 |
|---------|----------|----------|----------|
| AG-01 | 我能**列表/查看/创建/更新/删除** Agent。 | `/v1/agents` CRUD；`GET /v1/agents/:id` | 租户隔离。 |
| AG-02 | 我能**批量招募** Agent。 | `POST /v1/agents/batch-recruit`（较长超时） | 部分失败时的响应结构。 |
| AG-03 | 我能查看 Agent **生效技能**、**记忆统计**、**审计日志**。 | `.../effective-skills`、`.../memory-stats`、`GET /v1/agents/audit-logs` | 与绑定及记忆模块一致。 |
| AG-04 | 我能对 Agent 执行**审批、状态变更、分配到组织节点**。 | `POST .../approve`；`PATCH .../status`；`PATCH .../assign-node` | 非法状态迁移拒绝。 |
| AG-05 | 我能**绑定/解绑** Agent 与技能。 | `POST .../skills`、`POST .../skills/unbind` | 与 Skills 模块数据一致。 |

## 2.4 技能（Skills）

| 需求 ID | 用户故事 | API 形态 | 验收要点 |
|---------|----------|----------|----------|
| SK-01 | 我能对技能进行 **CRUD 与列表查询**。 | `/v1/skills` 与 `/v1/skills/:id` | 被组织/Agent 引用时的删除约束。 |

---

上一篇：[01-终端用户-账户与租户.md](./01-终端用户-账户与租户.md)  
下一篇：[03-终端用户-协作记忆任务与仪表盘.md](./03-终端用户-协作记忆任务与仪表盘.md)
