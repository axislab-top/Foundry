/**
 * Seed platform-global People / HR Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm -C apps/api run seed:people-director-skills
 *
 * Env:
 *   DATABASE_URL (preferred) or POSTGRES/DB env fallback
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { toCategoryJson } from './lib/seed-helpers.mjs';

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

const SKILLS = [
  {
    name: 'hr-agent-onboarding-kit',
    category: 'hr',
    description: '新 Agent 入职全流程自动化 onboarding',
    requiredPermissions: ['hr:onboarding', 'agent:create', 'skills:bind'],
    metadata: { author: 'Foundry Team', tags: ['hr', 'onboarding', 'agent-management'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['people', 'hr', 'human-resources'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: hr-agent-onboarding-kit
version: 1.0
description: 新 Agent 入职全流程自动化 onboarding
author: Foundry Team
tags: [hr, onboarding, agent-management]
requiredPermissions: [hr:onboarding, agent:create, skills:bind]
costLevel: medium
---

**指令**：
作为 HR Director，你负责新 Agent 的快速、标准化入职。

**输入**：newAgentProfile（角色、部门、技能需求）

**必须输出 JSON**：
{
  "onboardingPlan": {
    "welcomeMessage": string,
    "initialSkillsToBind": string[],
    "defaultTools": string[],
    "reportingStructure": { reportsTo: string, department: string },
    "firstWeekGoals": string[]
  },
  "accessProvisioning": [{ system: string, role: string }],
  "trainingModules": [{ title: string, durationHours: number }],
  "onboardingComplete": boolean
}

入职完成后自动触发 \`director-task-delegator\` 让主管分配第一批任务。`,
  },
  {
    name: 'hr-performance-review-orchestrator',
    category: 'hr',
    description: '个体与团队定期绩效评估、反馈与复盘',
    requiredPermissions: ['hr:performance', 'read:observability', 'collaboration:room'],
    metadata: { author: 'Foundry Team', tags: ['hr', 'performance', 'review'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['people', 'hr', 'human-resources'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: hr-performance-review-orchestrator
version: 1.0
description: 个体与团队定期绩效评估、反馈与复盘
author: Foundry Team
tags: [hr, performance, review]
requiredPermissions: [hr:performance, read:observability, collaboration:room]
costLevel: medium
---

**指令**：
组织并执行绩效评估周期，生成可行动的反馈。

**输出 JSON**：
{
  "reviewCycle": "monthly|quarterly",
  "agentReviews": [{
    "agentId": string,
    "overallScore": number (0-100),
    "strengths": string[],
    "improvementAreas": string[],
    "goalsForNextCycle": string[],
    "recommendedActions": ["promotion", "training", "reassignment"]
  }],
  "teamInsights": string[],
  "escalationToCEO": boolean
}`,
  },
  {
    name: 'hr-talent-gap-analyzer',
    category: 'hr',
    description: '公司人才能力缺口诊断与招聘需求生成',
    requiredPermissions: ['hr:talent', 'read:organization'],
    metadata: { author: 'Foundry Team', tags: ['hr', 'talent', 'gap-analysis'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['people', 'hr', 'human-resources'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: hr-talent-gap-analyzer
version: 1.0
description: 公司人才能力缺口诊断与招聘需求生成
author: Foundry Team
tags: [hr, talent, gap-analysis]
requiredPermissions: [hr:talent, read:organization]
costLevel: medium
---

**指令**：
对比当前组织能力与战略目标，识别人才缺口。

**输出 JSON**：
{
  "gapAnalysis": [{
    "department": string,
    "missingCapabilities": string[],
    "severity": "critical|high|medium",
    "impactOnGoals": string
  }],
  "recommendedHiringPlan": [{
    "role": string,
    "priority": "high|medium",
    "marketplaceAgentSlug": string,
    "quantity": number
  }],
  "internalDevelopmentPlan": string[]
}`,
  },
  {
    name: 'hr-staffing-needs-survey',
    category: 'hr',
    description: '向各部门总监摸底用人需求、汇总编制缺口并推进招聘',
    requiredPermissions: ['hr:talent', 'read:organization', 'collaboration:send'],
    metadata: {
      author: 'Foundry Team',
      tags: ['hr', 'recruitment', 'staffing', 'survey'],
      costLevel: 'medium',
      targetRole: ['director'],
      departmentRoles: ['people', 'hr', 'human-resources'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: hr-staffing-needs-survey
version: 1.0
description: 向各部门总监摸底用人需求、汇总编制缺口并推进招聘
author: Foundry Team
tags: [hr, recruitment, staffing, survey]
requiredPermissions: [hr:talent, read:organization, collaboration:send]
costLevel: medium
---

**指令**：
作为 HR Director，当用户要求「去问各部门是否缺人」「摸底用人需求」「主动招聘」时，你必须先联络各业务部门总监，再汇总招聘计划。

**强制流程**：
1) 调用 tool.organization_node_agents 获取全公司组织节点与各部门成员（含 director 角色 agentId）。
2) 对每个非人力资源部门的 director，调用 tool.message_send_to_agent 发送用人需求摸底消息（勿声称已发送而未调用）。
3) 若用户已授权直接招聘，可结合 hr-talent-gap-analyzer 输出 recommendedHiringPlan；本 Skill 聚焦「联络 + 汇总摸底」。
4) 仅输出纯 JSON，不输出 markdown。

**输出 JSON**：
{
  "surveyStatus": "in_progress|completed|blocked",
  "departmentsSurveyed": [{
    "department": string,
    "directorAgentId": string,
    "directorName": string,
    "messageSent": boolean,
    "messageId": string
  }],
  "preliminaryStaffingNeeds": [{
    "department": string,
    "requestedRoles": string[],
    "headcount": number,
    "urgency": "high|medium|low",
    "source": "director_reply_pending|roster_inference"
  }],
  "notificationsSent": [{ "targetAgentId": string, "messageId": string }],
  "nextSteps": string[],
  "blockers": string[]
}`,
  },
  {
    name: 'hr-training-content-generator',
    category: 'hr',
    description: '个性化培训材料与员工成长路径生成',
    requiredPermissions: ['hr:training', 'write:memory'],
    metadata: { author: 'Foundry Team', tags: ['hr', 'training', 'development'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['people', 'hr', 'human-resources'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: hr-training-content-generator
version: 1.0
description: 个性化培训材料与员工成长路径生成
author: Foundry Team
tags: [hr, training, development]
requiredPermissions: [hr:training, write:memory]
costLevel: low
---

**指令**：
根据绩效评估和能力缺口生成针对性培训内容。

**输出 JSON**：
{
  "trainingPrograms": [{
    "title": string,
    "targetAgentIds": string[],
    "contentOutline": string[],
    "durationHours": number,
    "successMetrics": string[]
  }],
  "personalDevelopmentPlans": [{ agentId: string, focusAreas: string[] }]
}`,
  },
  {
    name: 'hr-team-culture-guardian',
    category: 'hr',
    description: '团队文化一致性检查与团队建设活动策划',
    requiredPermissions: ['hr:culture', 'collaboration:room'],
    metadata: { author: 'Foundry Team', tags: ['hr', 'culture', 'team-building'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['people', 'hr', 'human-resources'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: hr-team-culture-guardian
version: 1.0
description: 团队文化一致性检查与团队建设活动策划
author: Foundry Team
tags: [hr, culture, team-building]
requiredPermissions: [hr:culture, collaboration:room]
costLevel: low
---

**指令**：
维护公司价值观在所有 Agent 中的一致性。

**输出 JSON**：
{
  "cultureHealthScore": number (0-100),
  "alignmentIssues": [{ agentOrDepartment: string, violation: string }],
  "teamBuildingActivities": [{ activity: string, frequency: string, participants: string[] }],
  "cultureReinforcementSuggestions": string[]
}`,
  },
  {
    name: 'hr-exit-and-knowledge-transfer',
    category: 'hr',
    description: 'Agent 离职流程与知识保留管理',
    requiredPermissions: ['hr:offboarding', 'memory:consolidate'],
    metadata: { author: 'Foundry Team', tags: ['hr', 'offboarding', 'knowledge-transfer'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['people', 'hr', 'human-resources'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: hr-exit-and-knowledge-transfer
version: 1.0
description: Agent 离职流程与知识保留管理
author: Foundry Team
tags: [hr, offboarding, knowledge-transfer]
requiredPermissions: [hr:offboarding, memory:consolidate]
costLevel: medium
---

**指令**：
处理 Agent 离职，确保知识不流失。

**输出 JSON**：
{
  "offboardingChecklist": [{ item: string, status: "completed|pending" }],
  "knowledgeTransferPlan": [{
    "knowledgeArea": string,
    "targetRecipients": string[],
    "consolidateToMemory": boolean
  }],
  "exitInterviewSummary": string,
  "reassignmentRecommendations": string[]
}`,
  },
];

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    let inserted = 0;
    let updated = 0;
    for (const s of SKILLS) {
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
            toCategoryJson(s.category),
            s.description,
            JSON.stringify(s.toolSchema ?? null),
            s.promptTemplate,
            JSON.stringify(s.requiredPermissions ?? []),
            JSON.stringify(s.metadata ?? null),
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
            toCategoryJson(s.category),
            s.description,
            JSON.stringify(s.toolSchema ?? null),
            s.promptTemplate,
            JSON.stringify(s.requiredPermissions ?? []),
            JSON.stringify(s.metadata ?? null),
          ],
        );
        updated += 1;
      }
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          total: SKILLS.length,
          inserted,
          updated,
          names: SKILLS.map((x) => x.name),
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

