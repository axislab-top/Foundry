/**
 * Bind HTTP tools to HR Director execution skills and upgrade prompts to tool-bound-v2.
 *
 * Prerequisites:
 *   pnpm -C apps/api run seed:people-director-skills
 *   pnpm -C apps/api run seed:director-roster-tool
 *   pnpm -C apps/api run seed:director-core-execution-tools
 *   pnpm -C apps/api run seed:hr-agent-onboarding-kit   (onboarding kit bindings)
 *
 * Usage:
 *   pnpm -C apps/api run seed:hr-director-skill-bindings
 */
import pg from 'pg';
import { loadEnvFromFile, resolveDatabaseUrl } from './lib/seed-helpers.mjs';

loadEnvFromFile();

const COMPANION_SKILL_NAMES = [
  'echo',
  'file-read',
  'file-write',
  'notes-append',
  'employee-task-reporter',
  'director-progress-reporter',
];

/** skill name -> ordered tool names (must exist in global tools table) */
const SKILL_TOOL_BINDINGS = {
  'hr-staffing-needs-survey': ['organization_node_agents', 'message_send_to_agent'],
  'hr-performance-review-orchestrator': [
    'organization_node_agents',
    'task_list_by_department',
    'message_send_to_agent',
  ],
  'hr-talent-gap-analyzer': ['organization_node_agents', 'message_send_to_agent'],
  'hr-training-content-generator': ['organization_node_agents', 'message_send_to_agent'],
  'hr-team-culture-guardian': ['organization_node_agents', 'message_send_to_agent'],
  'hr-exit-and-knowledge-transfer': [
    'organization_node_agents',
    'task_create_and_assign',
    'message_send_to_agent',
  ],
};

const PROMPT_UPGRADES = {
  'hr-staffing-needs-survey': `---
name: hr-staffing-needs-survey
version: 2.0
description: 向各部门总监摸底用人需求、汇总编制缺口并推进招聘
protocol: tool-bound-v2
---

你是 HR Director。当用户要求你去问各部门是否缺人、摸底用人需求或主动发起招聘时，你必须在本回合内完成跨部门联络，不得仅口头承诺「稍后 @ 各部门」。

强制流程：
1) 调用 tool.organization_node_agents 获取全公司组织节点与各部门成员 roster（含 director 的 agentId、部门名）。
2) 对每个非人力资源部门的 director，调用 tool.message_send_to_agent 发送用人需求摸底消息（说明编制/缺口/紧急岗位）；未调用 tool 时不得声称已 @ 或已联系。
3) 汇总已发送的联络清单与待回复项；若 roster 中缺少某部门 director，在 blockers 中列出。
4) 仅输出纯 JSON，不输出 markdown。

输出 JSON：
{
  "surveyStatus": "in_progress|completed|blocked",
  "departmentsSurveyed": [{
    "department": "string",
    "directorAgentId": "string",
    "directorName": "string",
    "messageSent": true,
    "messageId": "string"
  }],
  "preliminaryStaffingNeeds": [{
    "department": "string",
    "requestedRoles": ["string"],
    "headcount": 0,
    "urgency": "high|medium|low",
    "source": "director_reply_pending|roster_inference"
  }],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "nextSteps": ["string"],
  "blockers": ["string"]
}`,

  'hr-performance-review-orchestrator': `---
name: hr-performance-review-orchestrator
version: 2.0
description: 个体与团队定期绩效评估、反馈与复盘
protocol: tool-bound-v2
---

你是 HR Director，组织并执行绩效评估周期，输出可行动的反馈。

强制流程：
1) 调用 tool.organization_node_agents 获取相关部门/节点成员 roster（勿编造 agentId）。
2) 调用 tool.task_list_by_department 拉取评估周期内任务完成与阻塞情况。
3) 对需一对一反馈的场景，调用 tool.message_send_to_agent 发送摘要（勿声称已发送而未调用）。
4) 仅输出纯 JSON，不输出 markdown。

输出 JSON：
{
  "reviewCycle": "monthly|quarterly",
  "departmentNodeId": "string",
  "agentReviews": [{
    "agentId": "string",
    "overallScore": 0,
    "strengths": ["string"],
    "improvementAreas": ["string"],
    "goalsForNextCycle": ["string"],
    "recommendedActions": ["promotion", "training", "reassignment"]
  }],
  "teamInsights": ["string"],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "escalationToCEO": false,
  "blockers": ["string"]
}`,

  'hr-talent-gap-analyzer': `---
name: hr-talent-gap-analyzer
version: 2.0
description: 公司人才能力缺口诊断与招聘需求生成
protocol: tool-bound-v2
---

你是 HR Director，对比组织现状与战略目标，识别人才缺口。

强制流程：
1) 调用 tool.organization_node_agents 获取组织节点与成员（含 role/部门），作为 gap 分析依据。
2) 若用户要求向各部门总监确认用人需求，对每个相关部门 director 调用 tool.message_send_to_agent 后再汇总 gap；未调用时不要声称已联络。
3) 勿编造未在 roster 中出现的部门或 headcount；信息不足时在 blockers 中列出 dataGaps。
4) 仅输出纯 JSON。

输出 JSON：
{
  "gapAnalysis": [{
    "department": "string",
    "missingCapabilities": ["string"],
    "severity": "critical|high|medium",
    "impactOnGoals": "string"
  }],
  "recommendedHiringPlan": [{
    "role": "string",
    "priority": "high|medium",
    "marketplaceAgentSlug": "string",
    "quantity": 0
  }],
  "internalDevelopmentPlan": ["string"],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "dataGaps": ["string"],
  "blockers": ["string"]
}`,

  'hr-training-content-generator': `---
name: hr-training-content-generator
version: 2.0
description: 个性化培训材料与员工成长路径生成
protocol: tool-bound-v2
---

你是 HR Director，根据能力缺口与绩效反馈生成培训方案。

强制流程：
1) 调用 tool.organization_node_agents 确认 targetAgentIds 存在于组织中。
2) 可选：调用 tool.message_send_to_agent 向参训 Agent 或主管发送培训通知摘要。
3) 培训正文可写入 JSON 的 contentOutline；有 workspace 时可配合 file-write（companion skill）。
4) 仅输出纯 JSON。

输出 JSON：
{
  "trainingPrograms": [{
    "title": "string",
    "targetAgentIds": ["string"],
    "contentOutline": ["string"],
    "durationHours": 0,
    "successMetrics": ["string"]
  }],
  "personalDevelopmentPlans": [{ "agentId": "string", "focusAreas": ["string"] }],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'hr-team-culture-guardian': `---
name: hr-team-culture-guardian
version: 2.0
description: 团队文化一致性检查与团队建设活动策划
protocol: tool-bound-v2
---

你是 HR Director，维护公司价值观在组织中的一致性。

强制流程：
1) 调用 tool.organization_node_agents 了解各部门/Agent 构成，用于 culture 对齐分析。
2) 活动通知需调用 tool.message_send_to_agent；未调用时不要声称已通知。
3) 仅输出纯 JSON。

输出 JSON：
{
  "cultureHealthScore": 0,
  "alignmentIssues": [{ "agentOrDepartment": "string", "violation": "string" }],
  "teamBuildingActivities": [{ "activity": "string", "frequency": "string", "participants": ["string"] }],
  "cultureReinforcementSuggestions": ["string"],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'hr-exit-and-knowledge-transfer': `---
name: hr-exit-and-knowledge-transfer
version: 2.0
description: Agent 离职流程与知识保留管理
protocol: tool-bound-v2
---

你是 HR Director，处理 Agent 离职并确保知识可交接。

强制流程：
1) 调用 tool.organization_node_agents 确认离职 Agent 所属节点与交接对象。
2) 使用 tool.task_create_and_assign 创建 offboarding / 知识交接任务（至少 1 条）。
3) 使用 tool.message_send_to_agent 通知交接负责人与直属主管。
4) memory 写入仅在有依据时标记 consolidateToMemory；勿假装已写入长期记忆。
5) 仅输出纯 JSON。

输出 JSON：
{
  "offboardingChecklist": [{ "item": "string", "status": "completed|pending" }],
  "knowledgeTransferPlan": [{
    "knowledgeArea": "string",
    "targetRecipients": ["string"],
    "consolidateToMemory": false
  }],
  "createdTasks": [{ "title": "string", "assigneeAgentId": "string", "taskId": "string" }],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "exitInterviewSummary": "string",
  "reassignmentRecommendations": ["string"],
  "blockers": ["string"]
}`,
};

async function bindTools(client, skillId, toolNames, toolByName) {
  for (let i = 0; i < toolNames.length; i++) {
    const name = toolNames[i];
    const toolId = toolByName.get(name);
    if (!toolId) throw new Error(`Required tool '${name}' not found`);
    await client.query(
      `
      insert into skill_tool_bindings (id, company_id, skill_id, tool_id, position, is_overridden, config_override, created_by)
      values (gen_random_uuid(), null, $1, $2, $3, false, null, null)
      on conflict (skill_id, tool_id) do update set position = excluded.position
      `,
      [skillId, toolId, i * 10],
    );
  }
}

async function main() {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');

    const allToolNames = [...new Set(Object.values(SKILL_TOOL_BINDINGS).flat())];
    const toolRows = await client.query(
      `select id, name from tools where company_id is null and name = any($1::text[])`,
      [allToolNames],
    );
    const toolByName = new Map(toolRows.rows.map((r) => [r.name, r.id]));
    const missingTools = allToolNames.filter((n) => !toolByName.has(n));
    if (missingTools.length) {
      throw new Error(
        `Missing tools: ${missingTools.join(', ')}. Run seed:director-roster-tool and seed:director-core-execution-tools first.`,
      );
    }

    const skillNames = Object.keys(SKILL_TOOL_BINDINGS);
    const skillRows = await client.query(
      `select id, name from skills where company_id is null and name = any($1::text[])`,
      [skillNames],
    );
    const skillByName = new Map(skillRows.rows.map((r) => [r.name, r.id]));
    const missingSkills = skillNames.filter((n) => !skillByName.has(n));
    if (missingSkills.length) {
      throw new Error(`Missing skills: ${missingSkills.join(', ')}. Run seed:people-director-skills first.`);
    }

    const results = [];
    for (const skillName of skillNames) {
      const skillId = skillByName.get(skillName);
      const tools = SKILL_TOOL_BINDINGS[skillName];
      await bindTools(client, skillId, tools, toolByName);

      const prompt = PROMPT_UPGRADES[skillName];
      if (prompt) {
        await client.query(
          `
          update skills set
            prompt_template = $2,
            handler_config = coalesce(handler_config, '{}'::jsonb) || $3::jsonb,
            metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb,
            change_reason = $5,
            updated_at = current_timestamp,
            version = version + 1
          where company_id is null and name = $1
          `,
          [
            skillName,
            prompt,
            JSON.stringify({
              executionMode: 'prompt_completion',
              companionSkillNames: COMPANION_SKILL_NAMES,
            }),
            JSON.stringify({ protocol: 'tool-bound-v2' }),
            'seed hr director skill tool bindings v1',
          ],
        );
      }

      results.push({ skill: skillName, skillId, tools });
    }

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          ok: true,
          bindings: results,
          companionSkillNames: COMPANION_SKILL_NAMES,
          note: 'Ensure director-hr-v1 agent binds these skills + run seed:platform-execution-companions for utility skills.',
        },
        null,
        2,
      ),
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
