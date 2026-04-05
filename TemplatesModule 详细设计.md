**TemplatesModule 详细设计**（模板市场 + Agent 商城）

**TemplatesModule** 是你 **AI 公司工厂** 项目中**加速用户上手和商业化变现**的关键模块。它让用户能够“一键导入”现成公司模板或专业 Agent，大幅降低从零搭建的门槛，同时为平台提供重要的付费点（Agent 商城订阅/购买）。

### 1. TemplatesModule 的核心定位与目标
- **定位**：AI 公司工厂的“快捷启动器”与“能力商店”，负责提供可复用的公司模板和预配置 Agent 包。
- **核心价值**：
  - **用户侧**：非技术用户也能快速创建专业 AI 公司（“初创科技公司模板”、“内容创作公司模板”、“咨询服务公司模板”等）。
  - **商业侧**：通过 Agent 商城实现变现（免费基础模板 + 付费高级 Agent / Skills 包）。
  - **生态侧**：未来支持社区贡献模板，经过审核后上架。
- **与前后模块的强绑定**：
  - **CompaniesModule**：一键导入模板 → 自动创建公司 + 初始化组织结构。
  - **OrganizationModule**：模板包含预设组织结构。
  - **AgentsModule**：模板包含预配置 Agent（含性格、Prompt、模型偏好）。
  - **SkillsModule**：模板可包含一组推荐 Skills 包。
  - **MemoryModule / TasksModule**：模板可预置初始记忆和示例任务。
  - **BillingModule**：付费模板/Agent 需要计费。

### 2. TemplatesModule 应该满足的需求（详细拆解）

#### 1. 公司模板市场（Company Templates）
- **模板类型**：
  - 基础模板：初创科技公司、内容创作公司、咨询服务公司、电商运营公司等。
  - 行业模板：按行业分类（科技、金融、营销、教育、医疗等）。
  - 规模模板：小型团队、中型公司模板。
- **模板内容**：
  - 预设组织结构（董事会、CEO、部门设置）
  - 预配置核心 Agent（CEO + 部门主管 + 若干员工）
  - 推荐 Skills 包（按角色绑定）
  - 初始 Memory（示例文档、SOP）
  - 示例任务集（启动引导任务）
  - 默认预算配置建议
- **使用方式**：
  - 浏览市场 → 预览模板详情（结构图、包含 Agent 列表、预计成本）
  - 一键导入：基于模板创建新公司（自动初始化所有关联数据）

#### 2. Agent 商城（Agent Marketplace）
- **Agent 商品形式**：
  - 单个专业 Agent（“资深财务分析师 Agent”、“创意文案 Agent”、“代码架构师 Agent”等）
  - Agent 技能包（“前端开发技能包”、“营销内容生成包”）
  - 完整角色套装（“完整工程团队 Agent 组合”）
- **商品属性**：
  - 名称、描述、专长、预设 System Prompt、推荐 Skills、适用场景、定价（一次性购买或订阅）
  - 预览：可查看 Agent 配置详情、示例对话、预计消耗
- **购买/订阅流程**：
  - 浏览 → 加入购物车 → 支付（集成 Stripe 或其他支付）
  - 购买后可直接应用到已有公司（绑定到指定组织节点）

#### 3. 模板与 Agent 管理（平台侧）
- **模板/Agent 上架流程**：
  - 官方创建 + 社区投稿 → 审核（人工 + 自动安全检查）
  - 上架后支持版本管理（v1.0 → v1.1）
- **搜索与推荐**：
  - 按行业、规模、热度、评分搜索
  - 智能推荐（根据用户公司行业、已有 Agent 补齐建议）
- **使用统计**：
  - 模板使用次数、Agent 安装量、用户反馈评分

#### 4. 非功能需求
- **安全性**：导入的模板/Agent 必须经过沙箱检查（Prompt 注入、恶意 Skill 等）。
- **隔离性**：模板数据与用户公司数据严格分离，导入后才复制到用户 company_id 下。
- **性能**：模板市场浏览、预览响应快。
- **商业合规**：付费流程安全、退款机制、知识产权保护。
- **可扩展性**：未来支持用户自定义模板分享（需审核）。

### 3. 架构建议（与现有 Foundry 架构融合）

#### 模块结构（apps/api）
```
apps/api/src/modules/templates/
├── entities/
│   ├── template.entity.ts              # 公司模板
│   ├── marketplace-agent.entity.ts     # Agent 商城商品
│   ├── template-agent-mapping.entity.ts # 模板包含的 Agent
├── dto/
│   ├── template-preview.dto.ts
│   ├── import-template.dto.ts
│   ├── marketplace-query.dto.ts
├── services/
│   ├── templates.service.ts
│   ├── marketplace.service.ts
│   ├── template-importer.service.ts    # 一键导入逻辑
│   ├── agent-purchase.service.ts
├── controllers/
│   └── templates.controller.ts
├── listeners/
│   └── template-imported.listener.ts   # 导入后触发初始化
├── templates.module.ts
```

#### 数据模型关键点
- `templates`：模板元数据（名称、行业、描述、预览图、价格）
- `marketplace_agents`：Agent 商品（配置快照、价格、订阅类型）
- `template_contents`：模板实际内容（JSON 格式，包含组织结构、Agent 配置、Skills 绑定等）

**导入流程**：
1. 用户选择模板 → 调用 `import` 接口
2. TemplateImporterService 复制模板数据到新公司（company_id）
3. 触发 `template.imported` 事件 → Worker 初始化组织、Agent、Skills 等
4. 返回新公司 ID

#### 与现有架构集成点
- **Gateway**：新增 `/v1/templates/*` 和 `/v1/marketplace/*` 路由。
- **TenantGuard**：浏览市场为平台级（无 company_id），导入时绑定当前公司。
- **Worker**：导入后的重负载初始化（创建大量 Agent、Skills 绑定）放在 Worker 异步执行。
- **BillingModule**：付费模板/Agent 购买时触发计费。
- **Messaging**：发布 `template.imported`、`agent.purchased` 等事件。
- **AuditModule**：记录模板使用和 Agent 购买行为。

### 4. 实施建议与优先级（分阶段）

**阶段 1（基础）**：
- 模板/Agent 实体 + 市场浏览 + 预览接口。

**阶段 2（导入核心）**：
- 一键导入公司模板（自动创建组织 + Agent + Skills）。

**阶段 3（商城与支付）**：
- Agent 商城 + 购买流程 + 支付集成。

**阶段 4（生态与高级）**：
- 社区投稿审核流程、模板版本管理、推荐算法。

**潜在风险与注意事项**：
- 模板数据安全：导入时需校验 Prompt 和 Skills，避免恶意内容。
- 导入一致性：大量实体创建需事务 + 事件最终一致。
- 定价与退款：支付集成需处理失败回滚。
- 性能：热门模板预览缓存。

---

**总结**：  
TemplatesModule 的设计重点是**一键导入的便利性** + **Agent 商城的商业价值** + **与现有模块的无缝初始化联动**。它将显著降低用户上手门槛，同时打开付费转化通道。

做完这个模块后，用户可以：
- “一键创建科技公司模板” → 立即拥有完整 AI 团队
- “购买资深财务分析师 Agent” → 直接增强公司能力

---


TemplatesModule 是用户增长和商业化的重要引擎，做好后你的产品将更具吸引力。告诉我你的选择，我立刻继续！🚀