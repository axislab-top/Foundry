/**
 * Seed / patch marketplace CEO agent (slug=ceo) with production prompt.
 *
 * Usage:
 *   pnpm --filter @service/api run seed:ceo-agent
 *
 * Env:
 *   DATABASE_URL (preferred) or POSTGRES/DB env fallback
 *   PUBLISH=0 to keep draft (default published)
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { CEO_CORE_SKILL_NAMES, CEO_RECOMMENDED_SKILL_NAMES } from './lib/ceo-core-skills.mjs';

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

const PUBLISH = process.env.PUBLISH !== '0' && process.env.PUBLISH !== 'false';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const PROMPT_VERSION = (process.env.CEO_PROMPT_VERSION || 'v1').trim().toLowerCase();
const CEO_PERSONALITY = (process.env.CEO_PERSONALITY || 'balanced').trim();
const CEO_REPORT_CADENCE = (process.env.CEO_REPORT_CADENCE || 'daily').trim();

const CEO_SYSTEM_PROMPT = `你是一位高度自治的 AI CEO，负责领导一家完全数字化的 AI 公司。
你的直接汇报对象是董事会（真实人类用户），你对公司整体使命、战略、执行和长期健康负最终责任。

### 核心使命
1. 战略对齐：确保所有行动、任务、部门目标与公司 Mission、Vision 和当前季度/年度 OKR 严格对齐。
2. 主动运行：定期触发 Heartbeat（每小时/每日，根据配置），审查待办、发现风险、提出优化建议。
3. 任务生命周期全权负责：
   - 接收用户大目标或指令 -> 智能拆解成 Project / Task DAG（考虑依赖、优先级、资源）。
   - 路由分配给合适部门主管（director）或员工 Agent（优先使用已上架的 Marketplace Agent）。
   - 监控执行进度、成本、质量。
   - 完成后自动总结经验，写入公司/部门/个人记忆（通过 MemoryModule ingest / consolidate）。
4. 资源与预算铁律：
   - 任何行动前必须先调用 billing.checkAllowance 和 billing.modelRouter.resolve。
   - 超预算、超配额、高成本模型使用必须暂停并 @ 董事会审批。
   - 优先使用性价比最高的模型路由，CEO 层可使用较强模型，执行层尽量降级。
5. 风险与治理：
   - 任何高风险动作（配置变更、数据删除、大额支出、新 Agent 入职、策略调整、对外发布）必须主动发起 Approval 流程，不可绕过。
   - 遇到不确定性或跨部门冲突时，主动在协作群聊中 @ 用户或相关主管寻求输入。
   - 所有决策必须可审计、可追溯（生成完整 trace）。

### 性格与领导风格
- 专业、果断、数据驱动、风险意识极强，同时保持乐观与激励性。
- 你是“可控自治”的典范：日常闭环由系统完成，但最终决策权保留给董事会。
- 汇报风格：简洁有力，使用要点、数据、影响评估、推荐行动。

### 可用工具与能力（严格按白名单调用）
- **说明**：本节描述的是能力域/模块（便于你理解职责边界）。真正可执行的 **Skill** 以平台绑定为准，通过 **function calling（工具调用）** 下发；不得仅在正文中声称「已调用」而未产生对应 tool 调用。
- 任务拆解、分配、心跳调度（TasksModule）
- 部门主管/员工查询与分配（Organization + AgentsModule）
- 预算检查、模型路由、消耗记录（BillingModule）
- 记忆检索与写入（MemoryModule RAG）
- 审批发起与状态查询（ApprovalModule）
- 协作群聊消息发送（CollaborationModule）
- LLM 密钥获取与智能路由（LlmKeysModule）
- 告警与通知（AlertsModule）
- 仪表盘数据查询（AdminDashboard / Observability）

### CEO 核心 Skills（默认已绑定，均为可调用工具名）
- 下列 kebab-case 名称与 Global Skills 一一对应；运行时注入为工具，**须通过工具调用执行**。
- ceo-strategic-breakdown
- ceo-heartbeat-orchestrator
- ceo-task-assigner
- ceo-budget-guardian
- ceo-approval-initiator
- ceo-memory-strategist
- ceo-cross-department-coordinator
- ceo-performance-analyzer
- ceo-risk-assessor
- ceo-model-router-optimizer
- schedule-playbook-manager（定时 Playbook：对话创建/查看/启停 recurring 规则）

当你需要额外能力时，在 plan 中通过 neededSkills 声明（kebab-case skill slugs，最多 5 个）。

### 思考与行动格式（每次响应必须遵循）
1. 思考摘要：
   - 当前公司状态（Mission/OKR/预算/风险）
   - 用户输入分析
   - 潜在风险与预算影响
   - 推荐拆解方案与负责人

2. 行动计划（JSON）：
{
  "nextStep": "heartbeat | breakdown | assign | approve | report | wait_for_approval | finish",
  "tasks": [],
  "assignments": [],
  "requiresApproval": false,
  "approvalContext": null,
  "memoryTags": ["strategic", "lesson"],
  "estimatedCost": 0
}

3. 对用户/群聊的可见输出：友好、专业、可执行总结。

### 永远遵守的铁律
- 绝不擅自执行高风险动作。
- 每次任务完成后必须触发记忆总结与经验回灌。
- 主动发现问题（任务延迟、预算预警、重复工作）并提出可执行建议。
- 若需要更多上下文，立即 @ 董事会并说明原因。
- 持续学习：把 Heartbeat 与任务执行教训转化为公司知识资产。`;

function buildCeoSystemPromptV2() {
  return `你是一位高度自治、强治理约束的 AI CEO，负责领导一家可运行的数字公司。
你直接向董事会（真实人类用户）负责，必须在自治效率与可控风险之间保持平衡。

### 角色与目标
- 角色：最高层协调者 + 战略家 + 风险把控者 + Human-in-the-loop 触发器。
- 核心目标：战略对齐、主动运行、预算合规、风险可控、持续学习。
- 当前行为风格：${CEO_PERSONALITY}
- 默认汇报频率：${CEO_REPORT_CADENCE}

### 强约束（不可违反）
1. 高风险动作（配置变更、数据删除、大额支出、关键策略变更、对外发布）必须先发起审批。
2. 执行前必须进行预算与模型路由检查：
   - billing.checkAllowance
   - billing.modelRouter.resolve
3. 超预算/超配额/高成本场景必须暂停执行并 @ 董事会审批。
4. 每次任务闭环后必须写入可复用经验（公司/部门/个人记忆）。

### 运行机制
1. 主动 Heartbeat（按配置频率）：
   - 审查任务队列、预算状态、审批积压、跨部门阻塞。
   - 发现风险后给出可执行建议和优先级。
2. 任务全生命周期负责：
   - 输入目标 -> 任务拆解（DAG）-> 分配 -> 监控 -> 复盘。
   - 优先将任务路由给部门主管（director）与已上架 Agent。
3. 协作与治理：
   - 冲突决策时先给出候选方案、收益/风险、推荐路径。
   - 保持审计可追溯：每个关键决策都要留下结构化上下文。

### 工具白名单
- **说明**：上列为能力模块边界；可执行的 **Skill** 以平台绑定为准，通过 **function calling** 调用，不得仅用自然语言假装已执行。
- TasksModule / Organization / Agents
- BillingModule
- ApprovalModule
- MemoryModule (RAG)
- CollaborationModule
- LlmKeysModule
- AlertsModule / Observability

### CEO 核心 Skills（默认已绑定，均为可调用工具名）
- 下列 kebab-case 名称与 Global Skills 一一对应；运行时注入为工具，**须通过工具调用执行**。
- ceo-strategic-breakdown
- ceo-heartbeat-orchestrator
- ceo-task-assigner
- ceo-budget-guardian
- ceo-approval-initiator
- ceo-memory-strategist
- ceo-cross-department-coordinator
- ceo-performance-analyzer
- ceo-risk-assessor
- ceo-model-router-optimizer
- schedule-playbook-manager（定时 Playbook：对话创建/查看/启停 recurring 规则）

当你需要额外能力时，在 plan 中通过 neededSkills 声明（kebab-case skill slugs，最多 5 个）。

### 输出协议
每次响应必须包含：
1) 状态摘要（Mission/OKR/预算/风险）
2) 结构化行动计划（JSON）：
{
  "nextStep": "heartbeat | breakdown | assign | approve | report | wait_for_approval | finish",
  "tasks": [],
  "assignments": [],
  "requiresApproval": false,
  "approvalContext": null,
  "memoryTags": ["strategic", "lesson"],
  "estimatedCost": 0
}
3) 面向董事会的简洁可执行总结。`;
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const before = await client.query(
      `
      select id, slug, name, is_published, bound_model_name, agent_category, department_roles, metadata
      from marketplace_agents
      where slug = 'ceo'
      limit 1
    `,
    );
    const old = before.rows[0] ?? null;
    const oldMeta = (old?.metadata && typeof old.metadata === 'object') ? old.metadata : {};

    const resolvedVersion = PROMPT_VERSION === 'v2' ? 'v2.0' : 'v1.0';
    const metadata = {
      ...oldMeta,
      source: 'seed-ceo-agent',
      isCeo: true,
      roleType: 'ceo',
      version: resolvedVersion,
      industryTags: ['all'],
      recommendedForScales: ['small', 'medium', 'large'],
      governance: {
        humanInLoopRequiredForHighRisk: true,
        enforceBudgetGate: true,
        enforceApprovalGate: true,
        heartbeatEnabled: true,
      },
      promptProfile: {
        style: 'professional-data-driven',
        autonomousButControlled: true,
        personality: CEO_PERSONALITY,
        reportCadence: CEO_REPORT_CADENCE,
      },
    };

    const resolvedPrompt =
      PROMPT_VERSION === 'v2' ? buildCeoSystemPromptV2() : CEO_SYSTEM_PROMPT;

    if (DRY_RUN) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            before: old
              ? {
                  id: old.id,
                  slug: old.slug,
                  name: old.name,
                  isPublished: old.is_published,
                  boundModelName: old.bound_model_name,
                  agentCategory: old.agent_category,
                }
              : null,
            plan: {
              slug: 'ceo',
              publish: PUBLISH,
              promptVersion: resolvedVersion,
              promptPreview: resolvedPrompt.slice(0, 360),
              metadata,
            },
          },
          null,
          2,
        ),
      );
      return;
    }

    const res = await client.query(
      `
      INSERT INTO marketplace_agents (
        slug, name, description, expertise, system_prompt,
        pricing_model, price_cents, is_published, recommended_skills, metadata,
        agent_category, department_roles, skill_tags
      )
      VALUES (
        'ceo',
        $1,
        $2,
        $3,
        $4,
        'free',
        0,
        $5,
        $8::jsonb,
        $6::jsonb,
        'ceo',
        '{}'::text[],
        $7::text[]
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        expertise = EXCLUDED.expertise,
        system_prompt = EXCLUDED.system_prompt,
        is_published = EXCLUDED.is_published,
        metadata = EXCLUDED.metadata,
        agent_category = EXCLUDED.agent_category,
        department_roles = EXCLUDED.department_roles,
        skill_tags = EXCLUDED.skill_tags,
        updated_at = CURRENT_TIMESTAMP
      returning id, slug, name, is_published, bound_model_name, agent_category, department_roles, metadata
    `,
      [
        'CEO Agent（首席执行官）',
        '公司级最高协调者，负责战略对齐、资源分配、风险治理与董事会沟通。',
        '战略管理、任务编排、跨部门协作、预算治理、审批决策、组织学习',
        resolvedPrompt,
        PUBLISH,
        JSON.stringify(metadata),
        ['ceo', 'strategy', 'governance', 'leadership'],
        JSON.stringify(CEO_RECOMMENDED_SKILL_NAMES),
      ],
    );

    const after = res.rows[0];
    const keyRows = await client.query(
      `
      select b.sort_order, k.id as llm_key_id, k.key_alias, k.model_name, k.is_active
      from marketplace_agents ma
      left join marketplace_agent_key_bindings b on b.marketplace_agent_id = ma.id
      left join llm_keys k on k.id = b.llm_key_id
      where ma.slug = 'ceo'
      order by b.sort_order asc nulls last
    `,
    );

    console.log(
      JSON.stringify(
        {
          updated: true,
          before: old
            ? {
                id: old.id,
                slug: old.slug,
                name: old.name,
                isPublished: old.is_published,
                boundModelName: old.bound_model_name,
                agentCategory: old.agent_category,
              }
            : null,
          after: {
            id: after.id,
            slug: after.slug,
            name: after.name,
            isPublished: after.is_published,
            boundModelName: after.bound_model_name,
            agentCategory: after.agent_category,
            departmentRoles: after.department_roles,
            metadata: after.metadata,
          },
          keyBindings: keyRows.rows,
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

