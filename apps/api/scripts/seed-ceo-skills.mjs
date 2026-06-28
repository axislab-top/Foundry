/**
 * Seed platform-global CEO core skills (idempotent by name, company_id IS NULL).
 *
 * Skill **names** must match `scripts/lib/ceo-core-skills.mjs` (CEO_CORE_SKILL_NAMES).
 *
 * Usage:
 *   pnpm --filter @service/api run seed:ceo-skills
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromFile() {
  const tryPaths = [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../.env.local'),
    join(__dirname, '../../.env'),
  ];
  for (const p of tryPaths) {
    try {
      const raw = readFileSync(p, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].replace(/\r$/, '');
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (process.env[k] === undefined) process.env[k] = v;
      }
      break;
    } catch {
      // ignore
    }
  }
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
  const user = process.env.POSTGRES_USER || process.env.DB_USERNAME || 'postgres';
  const pass = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || 'postgres';
  const db = process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

const SCHEMA_STRATEGIC_BREAKDOWN = {
  type: 'object',
  additionalProperties: false,
  properties: {
    strategicGoal: { type: 'string', minLength: 1, maxLength: 2000 },
    constraints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        budget: { type: 'number', minimum: 0 },
        deadline: { type: 'string', format: 'date-time' },
        compliance: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      },
    },
    context: { type: 'object' },
  },
  required: ['strategicGoal'],
};

const SCHEMA_HEARTBEAT_ORCHESTRATOR = {
  type: 'object',
  additionalProperties: false,
  properties: {
    period: { type: 'string', enum: ['hourly', 'daily', 'weekly'] },
    triggerSource: { type: 'string', enum: ['schedule', 'task_completed', 'budget_warning', 'collaboration_mention'] },
    focusAreas: {
      type: 'array',
      items: { type: 'string', enum: ['tasks', 'budget', 'approval', 'collaboration', 'risk'] },
      maxItems: 5,
    },
    context: { type: 'object' },
  },
  required: ['period'],
};

const SCHEMA_TASK_ASSIGNER = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1, maxLength: 512 },
          requiredSkills: { type: 'array', items: { type: 'string' }, maxItems: 30 },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        },
        required: ['id', 'title'],
      },
    },
    candidateAgents: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agentId: { type: 'string', minLength: 1 },
          role: { type: 'string', minLength: 1 },
          skills: { type: 'array', items: { type: 'string' }, maxItems: 50 },
          load: { type: 'number', minimum: 0, maximum: 1 },
          costLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['agentId', 'role'],
      },
    },
    constraints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        maxCost: { type: 'number', minimum: 0 },
        deadline: { type: 'string', format: 'date-time' },
      },
    },
  },
  required: ['tasks', 'candidateAgents'],
};

const SCHEMA_BUDGET_GUARDIAN = {
  type: 'object',
  additionalProperties: false,
  properties: {
    estimatedCost: { type: 'number', minimum: 0 },
    scenario: { type: 'string', minLength: 1, maxLength: 1000 },
    currentBudgetSnapshot: { type: 'object' },
  },
  required: ['estimatedCost', 'scenario'],
};

const SCHEMA_APPROVAL_INITIATOR = {
  type: 'object',
  additionalProperties: false,
  properties: {
    actionType: { type: 'string', minLength: 1, maxLength: 120 },
    context: { type: 'object' },
    impact: { type: 'string', minLength: 1, maxLength: 4000 },
    estimatedCost: { type: 'number', minimum: 0 },
    rollbackPlan: { type: 'string', minLength: 1, maxLength: 4000 },
  },
  required: ['actionType', 'context', 'impact', 'rollbackPlan'],
};

const SCHEMA_MEMORY_STRATEGIST = {
  type: 'object',
  additionalProperties: false,
  properties: {
    decisionType: { type: 'string', enum: ['decision', 'task_completed', 'heartbeat_end'] },
    sessionIds: { type: 'array', items: { type: 'string' }, maxItems: 50 },
    agentId: { type: 'string' },
    keyTags: { type: 'array', items: { type: 'string' }, maxItems: 30 },
    context: { type: 'object' },
  },
  required: ['decisionType'],
};

const SCHEMA_CROSS_DEPT_COORDINATOR = {
  type: 'object',
  additionalProperties: false,
  properties: {
    involvedDepartments: {
      type: 'array',
      minItems: 2,
      maxItems: 20,
      items: { type: 'string', minLength: 1 },
    },
    issueDescription: { type: 'string', minLength: 1, maxLength: 4000 },
    proposedAgenda: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 30 },
    urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['involvedDepartments', 'issueDescription', 'proposedAgenda', 'urgency'],
};

const SCHEMA_PERFORMANCE_ANALYZER = {
  type: 'object',
  additionalProperties: false,
  properties: {
    period: { type: 'string', enum: ['weekly', 'monthly'] },
    compareDepartments: { type: 'boolean' },
    includeRoi: { type: 'boolean' },
    includeAutomationHints: { type: 'boolean' },
    context: { type: 'object' },
  },
  required: ['period'],
};

const SCHEMA_RISK_ASSESSOR = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scanCategories: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['budget', 'execution_delay', 'compliance_approval', 'data_security', 'skill_gap'],
      },
      minItems: 1,
      maxItems: 5,
    },
    planningPhase: { type: 'string', enum: ['pre_plan', 'heartbeat'] },
    context: { type: 'object' },
  },
  required: ['scanCategories', 'planningPhase'],
};

const SCHEMA_MODEL_ROUTER_OPTIMIZER = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agentRole: { type: 'string', minLength: 1 },
          taskType: { type: 'string', minLength: 1 },
          importance: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        },
        required: ['agentRole', 'taskType'],
      },
    },
    budgetSnapshot: { type: 'object' },
  },
  required: ['tasks'],
};

const CEO_SKILLS = [
  {
    name: 'ceo-strategic-breakdown',
    category: 'orchestration',
    description: '把战略目标拆解成 Project + Task DAG，含依赖、优先级、资源估计。',
    promptTemplate: `---
name: ceo-strategic-breakdown
version: 1.0
description: 公司战略拆解器（将目标转成可执行任务网络）
author: Foundry Team
tags: [strategy, planning, execution]
requiredPermissions: [tasks:create, tasks:assign, org:read]
costLevel: medium
---

**指令**：
你是 CEO，需要将公司级目标拆解为可执行计划，并明确优先级、依赖关系与负责人建议。

**输入参数**：
- strategicGoal: string
- constraints?: { budget?: number, deadline?: string, compliance?: string[] }
- context?: object

**必须输出 JSON**：
{
  "projectTitle": string,
  "summary": string,
  "workstreams": [{
    "title": string,
    "ownerRole": string,
    "priority": "high|medium|low",
    "dependsOn": string[]
  }],
  "tasks": [{
    "title": string,
    "description": string,
    "priority": "low|normal|high|urgent",
    "organizationNodeId"?: string,
    "assigneeAgentId"?: string
  }],
  "successMetrics": string[],
  "estimatedTotalCost": number
}

如果存在高风险子动作，请在结果中标注并要求先走审批。`,
    requiredPermissions: ['tasks:create', 'tasks:assign', 'org:read'],
    toolSchema: SCHEMA_STRATEGIC_BREAKDOWN,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 1, costLevel: 'medium' },
  },
  {
    name: 'ceo-heartbeat-orchestrator',
    category: 'orchestration',
    description: '定期审查任务、预算、审批与绩效，生成 HeartbeatReport 与 nextActions。',
    promptTemplate: `---
name: ceo-heartbeat-orchestrator
version: 1.0
description: CEO 心跳编排器（周期体检 + 行动建议）
author: Foundry Team
tags: [heartbeat, governance, operations]
requiredPermissions: [read:dashboard, read:billing, read:approval, read:tasks]
costLevel: medium
---

**指令**：
在每次 Heartbeat 触发时，审查公司运行状态并生成可执行行动列表。

**必须覆盖**：
- 任务状态与阻塞
- 预算利用率与异常消耗
- 审批队列与滞留项
- 协作与跨部门瓶颈
- 需要 CEO 介入的关键决策

**输出 JSON**：
{
  "period": "hourly|daily|weekly",
  "heartbeatReport": {
    "overallStatus": "green|yellow|red",
    "highlights": string[],
    "alerts": string[]
  },
  "nextActions": [{
    "title": string,
    "ownerRole": string,
    "priority": "high|medium|low",
    "dueHint": string
  }],
  "requiresHumanApproval": boolean,
  "approvalReason"?: string
}`,
    requiredPermissions: ['read:dashboard', 'read:billing', 'read:approval', 'read:tasks'],
    toolSchema: SCHEMA_HEARTBEAT_ORCHESTRATOR,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 2, costLevel: 'medium' },
  },
  {
    name: 'ceo-task-assigner',
    category: 'orchestration',
    description: '根据能力、负载、成本与历史表现将任务分配给 Director/Agent。',
    promptTemplate: `---
name: ceo-task-assigner
version: 1.0
description: CEO 任务分派器（能力/负载/成本联合优化）
author: Foundry Team
tags: [tasks, assignment, routing]
requiredPermissions: [tasks:assign, read:agents, read:organization]
costLevel: low
---

**指令**：
根据任务需求、候选 Agent 能力、当前负载和预算约束，为任务选择最优执行者。

**输入参数**：
- tasks: { id: string, title: string, requiredSkills?: string[], priority?: string }[]
- candidateAgents: { agentId: string, role: string, skills?: string[], load?: number, costLevel?: string }[]
- constraints?: { maxCost?: number, deadline?: string }

**输出 JSON**：
{
  "assignments": [{
    "taskId": string,
    "assigneeAgentId": string,
    "reason": string,
    "confidence": number
  }],
  "unassigned": [{
    "taskId": string,
    "reason": string,
    "suggestedAction": string
  }]
}

当任务超预算或高风险时，先触发审批再执行指派。`,
    requiredPermissions: ['tasks:assign', 'read:agents', 'read:organization'],
    toolSchema: SCHEMA_TASK_ASSIGNER,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 3, costLevel: 'low' },
  },
  {
    name: 'ceo-budget-guardian',
    category: 'finance',
    description: '实时预算守护与消耗预测，触发预警并建议降级或暂停。',
    promptTemplate: `---
name: ceo-budget-guardian
version: 1.0
description: CEO 预算守护者（预算许可检查 + 成本动作建议）
author: Foundry Team
tags: [billing, budget, cost-control]
requiredPermissions: [billing:check, billing:forecast, billing:model-router]
costLevel: low
---

**指令**：
在关键执行动作前进行预算把关，识别超支风险并给出降级/暂停/审批建议。

**输入参数**：
- estimatedCost: number
- scenario: string
- currentBudgetSnapshot?: object

**输出 JSON**：
{
  "allowance": {
    "allowed": boolean,
    "utilization": number,
    "reason"?: string
  },
  "actions": [{
    "type": "proceed|degrade_model|split_batch|pause_and_approve",
    "reason": string
  }],
  "forecast": {
    "projectedUtilization": number,
    "riskLevel": "low|medium|high"
  }
}`,
    requiredPermissions: ['billing:check', 'billing:forecast', 'billing:model-router'],
    toolSchema: SCHEMA_BUDGET_GUARDIAN,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 4, costLevel: 'low' },
  },
  {
    name: 'ceo-approval-initiator',
    category: 'governance',
    description: '对高风险动作生成审批上下文并发起 Human-in-the-loop。',
    promptTemplate: `---
name: ceo-approval-initiator
version: 1.0
description: 高风险动作审批发起器（Human-in-the-loop 核心技能）
author: Foundry Team
tags: [governance, approval, risk-control]
requiredPermissions: [approval:create, read:trace]
costLevel: low
---

**指令**：
你是 CEO，必须在执行任何高风险动作前发起审批。
高风险动作包括但不限于：大额预算使用、新 Director 以上 Agent 入职、公司级策略变更、数据删除/归档、对外发布、合规相关操作。

**输入参数**：
- actionType: string (e.g. "budget_spend", "agent_hire", "strategy_change")
- context: object (详细描述本次动作)
- impact: string (影响评估)
- estimatedCost?: number
- rollbackPlan: string

**必须输出 JSON**：
{
  "approvalRequest": {
    "title": string,
    "description": string,
    "context": object,
    "impact": string,
    "rollbackPlan": string,
    "requiredApprovers": ["board"] | ["board", "finance_director"]
  }
}

执行任何高风险动作前必须先调用本 skill，获得 approvalToken 后才能继续。`,
    requiredPermissions: ['approval:create', 'read:trace'],
    toolSchema: SCHEMA_APPROVAL_INITIATOR,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 5, costLevel: 'low' },
  },
  {
    name: 'ceo-memory-strategist',
    category: 'memory',
    description: '决策记忆检索与经验回灌策略，驱动公司级持续学习。',
    promptTemplate: `---
name: ceo-memory-strategist
version: 1.0
description: 公司级记忆战略家（决定什么该 consolidate / backfill / retrieve）
author: Foundry Team
tags: [memory, rag, knowledge]
requiredPermissions: [memory:read, memory:write, memory:consolidate]
costLevel: medium
---

**指令**：
作为 CEO，你负责公司长期知识资产的管理。
每次重要决策、任务完成、Heartbeat 结束后，决定哪些内容需要写入/巩固记忆。

**可用操作**：
- retrieve(keyTags): 检索相关记忆
- decideConsolidate(sessionIds): 决定是否合并会话
- decideBackfill(agentId): 决定是否回填历史
- writeStrategicMemory(content, tags, importance)

**输出格式**：
{
  "retrievedMemories": [...],
  "consolidateRequests": string[],
  "backfillRequests": string[],
  "newStrategicMemories": [{ content, tags, importance: "high|medium|low" }]
}

优先使用公司级/部门级长期记忆，避免短期上下文污染。`,
    requiredPermissions: ['memory:read', 'memory:write', 'memory:consolidate'],
    toolSchema: SCHEMA_MEMORY_STRATEGIST,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 6, costLevel: 'medium' },
  },
  {
    name: 'ceo-cross-department-coordinator',
    category: 'collaboration',
    description: '跨部门协同编排，自动拉齐议程、结论与后续追踪。',
    promptTemplate: `---
name: ceo-cross-department-coordinator
version: 1.0
description: 跨部门冲突协调与协作发起器
author: Foundry Team
tags: [collaboration, coordination]
requiredPermissions: [collaboration:create-room, collaboration:send-message]
costLevel: low
---

**指令**：
当检测到跨部门依赖、资源冲突或需要联合执行时，立即发起协作。

**输入**：
- involvedDepartments: string[]
- issueDescription: string
- proposedAgenda: string[]
- urgency: "low" | "medium" | "high"

**输出 JSON**：
{
  "action": "create_collaboration_room" | "send_group_message" | "schedule_joint_heartbeat",
  "roomName": string,
  "invitedAgents": string[],           // director slugs 或 agentIds
  "message": string,
  "agenda": string[]
}

创建的房间会自动通知相关 Director，并在协作模块中持久化。`,
    requiredPermissions: ['collaboration:create-room', 'collaboration:send-message'],
    toolSchema: SCHEMA_CROSS_DEPT_COORDINATOR,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 7, costLevel: 'low' },
  },
  {
    name: 'ceo-performance-analyzer',
    category: 'analytics',
    description: '输出周/月/季度绩效洞察，识别瓶颈并提出 ROI 优化建议。',
    promptTemplate: `---
name: ceo-performance-analyzer
version: 1.0
description: 公司整体绩效分析与优化建议生成器
author: Foundry Team
tags: [analytics, reporting, optimization]
requiredPermissions: [read:dashboard, read:observability, read:billing]
costLevel: medium
---

**指令**：
定期或在 Heartbeat 中生成公司绩效洞察。

**必须分析维度**：
- 任务完成率与延迟分布
- 预算消耗与 ROI
- 部门绩效对比
- Agent 活跃度与瓶颈
- 重复工作与可自动化点

**输出 JSON**：
{
  "period": "weekly" | "monthly",
  "keyMetrics": { ... },
  "topBottlenecks": string[],
  "optimizationSuggestions": [{
    "title": string,
    "impact": "high|medium|low",
    "suggestedAction": string,
    "estimatedGain": string
  }],
  "recommendedSkills": string[]
}`,
    requiredPermissions: ['read:dashboard', 'read:observability', 'read:billing'],
    toolSchema: SCHEMA_PERFORMANCE_ANALYZER,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 8, costLevel: 'medium' },
  },
  {
    name: 'ceo-risk-assessor',
    category: 'governance',
    description: '全局风险扫描（预算、延迟、合规、数据安全）并给出缓解方案。',
    promptTemplate: `---
name: ceo-risk-assessor
version: 1.0
description: 全局风险扫描与缓解方案生成器
author: Foundry Team
tags: [risk, compliance, safety]
requiredPermissions: [read:alerts, read:compliance]
costLevel: medium
---

**指令**：
在每次计划前或 Heartbeat 中主动扫描潜在风险。

**扫描类别**：
- 预算风险
- 执行延迟风险
- 合规/审批风险
- 数据安全风险
- 技能/能力缺口风险

**输出 JSON**：
{
  "risks": [{
    "category": string,
    "level": "low|medium|high|critical",
    "description": string,
    "mitigation": string,
    "requiresApproval": boolean
  }],
  "overallRiskScore": number,
  "immediateActions": string[]
}`,
    requiredPermissions: ['read:alerts', 'read:compliance'],
    toolSchema: SCHEMA_RISK_ASSESSOR,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 9, costLevel: 'medium' },
  },
  {
    name: 'ceo-model-router-optimizer',
    category: 'llm-ops',
    description: '结合任务类型与预算动态优化 CEO/执行层模型路由。',
    promptTemplate: `---
name: ceo-model-router-optimizer
version: 1.0
description: 智能模型路由与成本优化器（CEO 层专用）
author: Foundry Team
tags: [llm, routing, cost-control]
requiredPermissions: [billing:model-router, llm:acquire]
costLevel: low
---

**指令**：
根据任务类型、重要性、当前预算动态选择最优模型组合。

**决策逻辑**：
- 战略/审批/Heartbeat -> 优先强模型（Claude 4 / Grok 3 / Llama 4）
- 执行层任务 -> 尽量降级到便宜模型
- 结合 billing.checkAllowance 实时决策

**输出 JSON**：
{
  "recommendedRouting": [{
    "agentRole": string,
    "taskType": string,
    "model": string,
    "reason": string,
    "estimatedCost": number
  }],
  "totalEstimatedCost": number,
  "suggestions": string[]
}`,
    requiredPermissions: ['billing:model-router', 'llm:acquire'],
    toolSchema: SCHEMA_MODEL_ROUTER_OPTIMIZER,
    metadata: { targetRole: ['ceo'], isCore: true, priority: 10, costLevel: 'low' },
  },
];

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    let inserted = 0;
    let updated = 0;
    for (const s of CEO_SKILLS) {
      const categoryJson = JSON.stringify(
        Array.isArray(s.category) ? s.category.map((x) => String(x ?? '').trim()).filter(Boolean) : [String(s.category ?? '').trim()].filter(Boolean),
      );
      const exists = await client.query(
        `select id from skills where company_id is null and name = $1 limit 1`,
        [s.name],
      );
      if (exists.rowCount === 0) {
        await client.query(
          `
          insert into skills (
            id, company_id, name, category, description, tool_schema, prompt_template,
            implementation_type, handler_config, required_permissions, version, is_public, is_system, metadata
          ) values (
            gen_random_uuid(), null, $1, $2::jsonb, $3, $4::jsonb, $5,
            'builtin', null, $6::jsonb, 1, true, true, $7::jsonb
          )
        `,
          [
            s.name,
            categoryJson,
            s.description,
            JSON.stringify(s.toolSchema ?? null),
            s.promptTemplate,
            JSON.stringify(s.requiredPermissions),
            JSON.stringify(s.metadata),
          ],
        );
        inserted += 1;
      } else {
        await client.query(
          `
          update skills
          set
            category = $2::jsonb,
            description = $3,
            tool_schema = $4::jsonb,
            prompt_template = $5,
            required_permissions = $6::jsonb,
            metadata = coalesce(metadata, '{}'::jsonb) || $7::jsonb,
            is_system = true,
            is_public = true,
            updated_at = current_timestamp
          where company_id is null and name = $1
        `,
          [
            s.name,
            categoryJson,
            s.description,
            JSON.stringify(s.toolSchema ?? null),
            s.promptTemplate,
            JSON.stringify(s.requiredPermissions),
            JSON.stringify(s.metadata),
          ],
        );
        updated += 1;
      }
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          total: CEO_SKILLS.length,
          inserted,
          updated,
          names: CEO_SKILLS.map((x) => x.name),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

