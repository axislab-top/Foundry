# SkillsModule 验收报告

## 1. 验收范围与目标
- 验收对象：`SkillsModule`（API + Gateway + Worker + `@service/ai` ToolRegistry + Contracts + Migration）
- 核心目标：实现类似 OpenClaw 的可扩展 Skills 系统，支持平台全局 + 公司私有 Skills；实现 Agent 与 Skills 的灵活绑定；提供统一、安全、可审计的 Skill 执行能力；为 LangGraph 多 Agent 自治运行提供 Tool 支持。
- 验收基线：基于已通过的 `TenantModule + CompaniesModule + OrganizationModule + AgentsModule`。
- 验收重点：Skills 注册与执行正确性、租户隔离、Agent 绑定一致性、安全与 Human-in-the-loop、审计与计费集成。

## 2. 实现清单（与仓库一致）

### 2.1 API（apps/api）
- **模块目录**：
  - `entities/`：`skill.entity.ts`、`skill-execution-log.entity.ts`
  - `dto/`：`create-skill.dto.ts`、`update-skill.dto.ts`、`query-skills.dto.ts`、`bind-organization-node-skills.dto.ts`
  - `services/`：`skills.service.ts`、`skill-validator.service.ts`、`effective-skills.service.ts`、`organization-node-skills.service.ts`
  - `controllers/`：`skills.controller.ts`
  - `listeners/`：`skill-executed.listener.ts`（消费 `skill.executed` 写入 `skill_execution_logs`）
  - `default-skills.ts`：按角色默认全局 Skill 名称
- **说明**：设计稿中的 `skill-registry.service.ts` / `skill-executor.service.ts`（API 侧）未单独落地；**平台注册与执行**分别由 **`@service/ai` 的 `ToolRegistry`** 与 **Worker `AgentExecutionService`** 承担。`agent.created` 默认绑定在 **`agents/listeners/agent-created-default-skills.listener.ts`**（非 `skills/` 下 `agent-created.listener.ts` 命名）。

### 2.2 Gateway（apps/gateway）
- **已配置路由与 RPC 白名单**（节选）：
  - `/v1/skills`（CRUD）、`/v1/skills/:id`
  - `/v1/agents/:id/skills`（绑定）、`/v1/agents/:id/skills/unbind`、`/v1/agents/:id/effective-skills`
  - `/v1/organizations/nodes/:id/skills`（列表）、`/v1/organizations/nodes/:id/skills/bind`、`/v1/organizations/nodes/:id/skills/unbind`
- **说明**：未实现独立 `/v1/skills/execute`；Skill 执行在 **Worker** 内通过 `AgentExecutionService` + 消息事件 `skill.executed`，而非经 Gateway 同步 RPC 调试接口（可按需后续增加）。

### 2.3 Worker（apps/worker）
- `ToolRegistry`（`@service/ai`）+ `register-builtins.ts`（builtin 占位实现）
- `AgentExecutionService`：在租户上下文外也可被单测调用；成功/失败均发布 `skill.executed`
- `SkillAwareAiRuntimeAdapter`：订阅 `agent.skills.changed`，用事件内 **`skills` 快照**刷新注册表
- **说明**：`skill.execute` 作为独立 Rabbit 模式未新增；执行入口为服务方法 + 事件驱动。重试/DLQ 沿用现有 Agent 事件队列配置。

### 2.4 @service/ai（infrastructure/ai，等价设计中的 libs/ai）
- `ToolRegistry`：`setAgentTools`、`snapshotsToOpenAiFunctions`、`execute`（builtin 分发）、`requiredPermissions` 与 `ctx.roles` 校验

### 2.5 Contracts（contracts/events）
- `skill.events.ts`：`SkillToolSnapshot`、`SkillExecutedEvent`
- `agent.events.ts`：`agent.skills.changed` 增加可选 `skills[]`
- **说明**：敏感 Skill 专用 **`agent.need_approval`** 沿用 Agents 域既有事件；未新增独立 `agent.need_approval` 副本。

### 2.6 Migration
- `skills` / `agent_skills` / RLS；扩展列与种子；`skill_execution_logs`、`organization_node_skills`

---

## 3. 验收测试结果

### 3.1 已执行命令与结果（本仓库实测）

在项目根目录或各 app 目录执行：

```bash
# API：Skills 校验 + skillToSnapshot
pnpm --filter @service/api exec jest src/modules/skills/skills.service.spec.ts src/modules/skills/services/skill-validator.service.spec.ts

# Gateway：Skills / 组织节点 Skills 相关 RPC 白名单
pnpm --filter @service/gateway test -- --testPathPattern=routes.skills.spec

# Worker：执行 + skill.executed 发布
pnpm --filter @service/worker exec jest src/modules/agents/services/agent-execution.service.spec.ts

# 补充：既有 agents + gateway agents/skills 路由顺序
pnpm --filter @service/gateway test -- --testPathPattern=routes.agents.spec
pnpm --filter @service/api test -- --testPathPattern="agents.rls|skills"
```

**结果摘要（2026-03-29 执行）**：

| 命令 | 结果 |
|------|------|
| API `skills.service.spec` + `skill-validator.service.spec` | **通过**（5 tests） |
| Gateway `routes.skills.spec` | **通过**（1 test） |
| Worker `agent-execution.service.spec` | **通过**（1 test） |
| 构建 `nest build`（api / gateway / worker）+ `@service/ai` tsc | **通过** |

数据库迁移：需已在目标库执行 `pnpm run migrate:run`（含 `ExtendSkillsTable`、`SeedPlatformSkills`、`SkillExecutionLogsAndOrgNodeSkills` 等）。

### 3.2 覆盖的关键验证点（实测填写）

| 验证点 | 结果 |
|--------|------|
| `skillToSnapshot` 与契约字段一致 | 已通过单测 |
| `tool_schema` 基础校验（object / type） | 已通过 `SkillValidatorService` 单测 |
| Gateway RPC 白名单含 skills + agents 绑定 + org 节点 skills | 已通过 `routes.skills.spec` |
| Worker 执行 builtin 并发布 `skill.executed` | 已通过 `agent-execution.service.spec` |
| RLS / 跨租户 | 依赖 `agents.rls.integration` 等集成测试 + 迁移策略，未在本次单元测试中全覆盖 |

---

## 4. 对照验收清单（核心验收标准）

### 4.1 功能正确性
- [x] **Skill 管理**：创建、查询（category / 名称搜索）、更新、删除；支持全局 + 公司私有（RLS + 服务层校验）
- [x] **Skill 绑定**：Agent 绑定/解绑、批量 skillIds；**部门继承**通过 `organization_node_skills` + `EffectiveSkillsService` + `GET .../effective-skills`
- [x] **Skill 类型与配置**：`tool_schema`、`prompt_template`、`implementation_type`（含 `external`）持久化；创建/更新走校验器
- [x] **Tool Registry**：`agent.skills.changed` 携带快照 → Worker 刷新内存表；OpenAI 形态见 `snapshotsToOpenAiFunctions`
- [x] **Skill 执行**：builtin 在 Worker 注册；langgraph/api/external 为扩展点（未接完整运行时）
- [ ] **模板支持**：与 TemplatesModule 批量导入 **未实现**（后续 Epic）

### 4.2 初始化与事件驱动
- [x] 新 Agent **`agent.created`** / bootstrap 创建 Agent 后按角色绑定默认全局 Skills
- [x] **`agent.skills.changed`** 含 `skillIds` + `skills` 快照并发布；Worker 更新 ToolRegistry
- [x] **`skill.executed`** + API 侧落库 `skill_execution_logs`（监听器）
- [x] Worker 执行路径中 **`companyId`/`agentId` 上下文**由调用方传入；事件消费侧 **`runWithCompanyId`** 见既有 listeners

### 4.3 数据隔离与安全
- [x] **RLS**：迁移中 ENABLE + FORCE；私有 Skill 仅租户可写、全局可读策略
- [x] **跨租户**：`assertSkillUsableByTenant` + 绑定校验
- [~] **HITL / 审批**：敏感 Skill 标记与 **`agent.need_approval`** 流程以 Agents 域为准；Skill 级审批策略 **部分占位**
- [~] **外部 API Skills**：`handler_config` + `implementation_type` 已存储；**沙箱执行未实现**
- [ ] **循环防护**：依赖编排层（LangGraph）配置，**未在模块内单独验收**

### 4.4 架构集成
- [x] Gateway 路由与 **RPC 白名单**（`rpc-patterns.config`）已包含 skills 与 org 节点 skills
- [x] Agent 详情返回 **`skillIds`**（`agents.service`）
- [x] 组织节点 **绑定 Skills API** + **有效 Skills 查询**
- [x] `@service/ai` 与 Worker 集成（单测 + 适配器）
- [~] **AuditModule（Gateway）**：Skill 执行以 **`skill_execution_logs` + `skill.executed`** 为主；Gateway 统一审计扩展 **可选增强**
- [ ] **BillingModule**：**`recordMeteringStub` 占位**，未接真实计费

### 4.5 非功能验收
- [~] **性能**：未做压测；设计建议热路径缓存与 Tool 列表分页
- [~] **事务**：绑定操作为多步写入；关键路径可按需加事务
- [x] **错误处理**：校验器 + Nest 异常码；Worker 执行失败仍发 `skill.executed`（失败摘要）
- [ ] **并发**：未专项压测
- [x] **缓存**：Agent 详情缓存于绑定变更时失效（`AgentSkillService`）
- [~] **可观测性**：`traceId` 字段存在于契约与执行日志；全链路指标 **依赖基础设施**

---

## 5. 风险与剩余建议（非阻塞）
- 自定义 Skill 生成与审核、TemplatesModule 批量导入
- 大规模 Skills 下 ToolRegistry 分片/懒加载
- 外部 Skills 容器化沙箱
- LangGraph 会话内热更新 vs 新会话策略（当前以事件刷新注册表 + 新会话为准）
- 建议补充：**创建公司 → Agent → 绑定 Skill → Worker 执行 → 查 `skill_execution_logs`** 的 E2E

---

## 6. 最终结论
- **结论**：SkillsModule **核心能力已可验收**：数据模型与迁移、Skills CRUD、Agent/组织节点绑定与有效 Skill 合并、契约与事件、`@service/ai` ToolRegistry、Worker 执行与 `skill.executed` 审计落库、Gateway 路由与白名单均已落地；自动化测试覆盖 **校验器、契约快照、路由白名单、执行+事件**。**模板导入、Billing 实装、完整沙箱与全链路 E2E** 列为下一阶段。
- **建议进入下一阶段**：在接入 LangGraph 编排与 Collaboration 群聊前，优先补齐 **E2E** 与 **计费钩子**；模板与社区 Skills 并行规划。
