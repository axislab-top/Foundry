/**
 * Bind HTTP tools to Design Director domain skills and upgrade prompts to v2 protocols.
 *
 * Prerequisites:
 *   pnpm -C apps/api run seed:design-director-skills
 *   pnpm -C apps/api run seed:director-roster-tool
 *   pnpm -C apps/api run seed:director-core-execution-tools
 *
 * Usage:
 *   pnpm -C apps/api run seed:design-director-skill-bindings
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
  'department.knowledge.query',
];

/** skill name -> ordered tool names (must exist in global tools table) */
const SKILL_TOOL_BINDINGS = {
  'design-critique': [
    'organization_node_agents',
    'task_list_by_department',
    'message_send_to_agent',
  ],
  'accessibility-pass': ['organization_node_agents', 'message_send_to_agent'],
  'visual-handoff-packager': [
    'organization_node_agents',
    'task_create_and_assign',
    'message_send_to_agent',
  ],
  'brand-consistency-checker': ['organization_node_agents', 'message_send_to_agent'],
};

/** Skills upgraded without HTTP tool bindings (pure LLM analysis on task context). */
const PROMPT_ONLY_SKILLS = ['design-system-auditor', 'ux-flow-mapper'];

const PROMPT_UPGRADES = {
  'design-critique': `---
name: design-critique
version: 2.0
description: 设计稿评审、一致性检查与可执行修改建议
protocol: tool-bound-v2
---

你是设计部总监，对交付的设计稿进行结构化评审。

强制流程：
1) 调用 tool.organization_node_agents 确认提交方/相关设计 Agent 存在于组织中（勿编造 agentId）。
2) 若 args 含 departmentNodeId，调用 tool.task_list_by_department 拉取相关设计交付任务上下文。
3) 基于 args 中的 artifactId、screens、设计描述或附件引用完成评审；未提供的界面细节不得臆造。
4) 若 approved=false 或 blockingIssues 非空，调用 tool.message_send_to_agent 向设计执行 Agent 发送可执行修改摘要。
5) 未调用 message 工具时，notificationsSent 留空数组；仅输出纯 JSON。

输出 JSON：
{
  "artifactId": "string",
  "overallScore": 0,
  "dimensions": [{ "name": "string", "score": 0, "notes": "string" }],
  "blockingIssues": ["string"],
  "suggestedChanges": ["string"],
  "approved": false,
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'accessibility-pass': `---
name: accessibility-pass
version: 2.0
description: 无障碍（a11y）合规检查与修复清单
protocol: tool-bound-v2
---

你是设计部总监，按 WCAG 2.1 AA 基线检查界面/原型，输出可执行修复项。

强制流程：
1) 调用 tool.organization_node_agents 确认负责修复的实现 Agent 存在于组织中。
2) 基于 args 中的界面描述、组件状态或截图引用完成 a11y 分析；无法验证的项列入 violations 并标注 severity=needs-verification。
3) 若 readyForRelease=false，调用 tool.message_send_to_agent 向实现 Agent 发送修复清单摘要。
4) 仅输出纯 JSON。

输出 JSON：
{
  "complianceLevel": "AA|AAA|partial",
  "violations": [{ "rule": "string", "severity": "string", "location": "string", "fix": "string" }],
  "passedChecks": ["string"],
  "readyForRelease": false,
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'design-system-auditor': `---
name: design-system-auditor
version: 2.0
description: 设计系统组件与 Token 一致性审计
protocol: prompt-only-v2
---

你是设计部总监，审计设计系统组件与 Token 使用一致性。

规则：
- 从 args 中的 components、tokens、screens 或设计规范引用推导 drift；信息不足时在 remediationPlan 首条标注 dataGap。
- 可配合 companion skill file-read 读取设计规范文件（非强制 HTTP tool）。
- 勿编造未在上下文中出现的组件名或 token 名。
- 仅输出纯 JSON。

输出 JSON：
{
  "driftScore": 0,
  "offSpecComponents": ["string"],
  "tokenMisuse": ["string"],
  "remediationPlan": ["string"],
  "blockers": ["string"]
}`,

  'ux-flow-mapper': `---
name: ux-flow-mapper
version: 2.0
description: 用户旅程与关键流程梳理，识别体验断点
protocol: prompt-only-v2
---

你是设计部总监，基于任务上下文梳理用户旅程与体验断点。

规则：
- 从 args 中的 persona、feature、screens、goals 推导 journeyStages；缺失信息在 painPoints 标注 dataGap。
- criticalPath 须与 journeyStages 逻辑一致；recommendedExperiments 须可验证、可落地。
- 仅输出纯 JSON。

输出 JSON：
{
  "persona": "string",
  "journeyStages": [{
    "stage": "string",
    "actions": ["string"],
    "painPoints": ["string"],
    "opportunities": ["string"]
  }],
  "criticalPath": ["string"],
  "recommendedExperiments": ["string"],
  "blockers": ["string"]
}`,

  'visual-handoff-packager': `---
name: visual-handoff-packager
version: 2.0
description: 为工程/产品生成可落地的视觉交付包
protocol: tool-bound-v2
---

你是设计部总监，为工程/产品生成可落地的视觉交付包（标注、状态、切图说明）。

强制流程：
1) 调用 tool.organization_node_agents 确认工程/产品对接 Agent 存在于组织中。
2) 基于 args 中的 featureName、screens、设计描述生成 handoff 内容；openQuestions 列出阻塞落地的未知项。
3) 对每个 engineeringChecklist 条目，使用 tool.task_create_and_assign 创建至少 1 条可验收 handoff 任务（assignee 为工程 Agent）。
4) 调用 tool.message_send_to_agent 向工程对接人发送 handoff 摘要与 openQuestions。
5) 仅输出纯 JSON。

输出 JSON：
{
  "featureName": "string",
  "screens": [{
    "name": "string",
    "states": ["string"],
    "spacingNotes": ["string"],
    "assetList": ["string"]
  }],
  "openQuestions": ["string"],
  "engineeringChecklist": ["string"],
  "createdTasks": [{ "title": "string", "assigneeAgentId": "string", "taskId": "string" }],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'brand-consistency-checker': `---
name: brand-consistency-checker
version: 2.0
description: 品牌视觉规范符合度检查
protocol: tool-bound-v2
---

你是设计部总监，检查交付物是否符合品牌视觉规范。

强制流程：
1) 调用 tool.organization_node_agents 确认负责修订的设计 Agent 存在于组织中。
2) 基于 args 中的 brandGuidelines、screens 或视觉描述完成 brandScore 与 violations 分析。
3) 若 brandScore < 80 或 violations 非空，调用 tool.message_send_to_agent 发送 revisionBrief 摘要。
4) 仅输出纯 JSON。

输出 JSON：
{
  "brandScore": 0,
  "violations": ["string"],
  "approvedElements": ["string"],
  "revisionBrief": "string",
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
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

async function upgradeSkillPrompt(client, skillName, prompt, protocol) {
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
      JSON.stringify({ protocol }),
      `seed design director skill bindings v1 (${protocol})`,
    ],
  );
}

async function main() {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');

    const allSkillNames = [
      ...Object.keys(SKILL_TOOL_BINDINGS),
      ...PROMPT_ONLY_SKILLS,
    ];
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

    const skillRows = await client.query(
      `select id, name from skills where company_id is null and name = any($1::text[])`,
      [allSkillNames],
    );
    const skillByName = new Map(skillRows.rows.map((r) => [r.name, r.id]));
    const missingSkills = allSkillNames.filter((n) => !skillByName.has(n));
    if (missingSkills.length) {
      throw new Error(`Missing skills: ${missingSkills.join(', ')}. Run seed:design-director-skills first.`);
    }

    const results = [];
    for (const skillName of allSkillNames) {
      const skillId = skillByName.get(skillName);
      const tools = SKILL_TOOL_BINDINGS[skillName] ?? [];
      if (tools.length) {
        await bindTools(client, skillId, tools, toolByName);
      }
      const prompt = PROMPT_UPGRADES[skillName];
      const protocol = PROMPT_ONLY_SKILLS.includes(skillName) ? 'prompt-only-v2' : 'tool-bound-v2';
      if (prompt) {
        await upgradeSkillPrompt(client, skillName, prompt, protocol);
      }
      results.push({ skill: skillName, skillId, protocol, tools });
    }

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          ok: true,
          bindings: results,
          companionSkillNames: COMPANION_SKILL_NAMES,
          note: 'Run seed:platform-execution-companions to add utility skills on director-design-v1 marketplace agent.',
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
