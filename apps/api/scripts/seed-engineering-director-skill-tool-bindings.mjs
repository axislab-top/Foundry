/**
 * Bind HTTP tools to Engineering Director domain skills and upgrade prompts to v2 protocols.
 *
 * Prerequisites:
 *   pnpm -C apps/api run seed:engineering-director-skills
 *   pnpm -C apps/api run seed:director-roster-tool
 *   pnpm -C apps/api run seed:director-core-execution-tools
 *
 * Usage:
 *   pnpm -C apps/api run seed:engineering-director-skill-bindings
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
  'code-review-assistant',
  'ci-pipeline-helper',
];

const SKILL_TOOL_BINDINGS = {
  'engineering-code-review-orchestrator': [
    'organization_node_agents',
    'task_list_by_department',
    'message_send_to_agent',
  ],
  'engineering-ci-cd-pipeline-manager': [
    'organization_node_agents',
    'task_list_by_department',
    'message_send_to_agent',
  ],
  'engineering-security-scanner': ['organization_node_agents', 'message_send_to_agent'],
  'engineering-ai-tool-integrator': [
    'organization_node_agents',
    'task_create_and_assign',
    'message_send_to_agent',
  ],
  'engineering-team-velocity-coach': [
    'organization_node_agents',
    'task_list_by_department',
    'message_send_to_agent',
  ],
};

const PROMPT_ONLY_SKILLS = [
  'engineering-tech-debt-assessor',
  'engineering-architecture-decision-recorder',
];

const PROMPT_UPGRADES = {
  'engineering-code-review-orchestrator': `---
name: engineering-code-review-orchestrator
version: 2.0
description: 自动化代码审查流程协调与质量门控
protocol: tool-bound-v2
---

你是工程部总监，协调代码审查并输出质量门控结论。

强制流程：
1) 调用 tool.organization_node_agents 确认 reviewersAssigned 中的 Agent 存在于组织中（勿编造 agentId）。
2) 若 args 含 departmentNodeId，调用 tool.task_list_by_department 拉取相关 PR/分支任务上下文。
3) 基于 args 中的 prOrBranch、diff 摘要或审查清单完成 checklistResults；未提供的代码细节不得臆造。
4) 若 approved=false 或 blockingIssues 非空，调用 tool.message_send_to_agent 向提交方发送修改摘要。
5) 仅输出纯 JSON。

输出 JSON：
{
  "reviewSessionId": "string",
  "prOrBranch": "string",
  "reviewersAssigned": ["string"],
  "checklistResults": [{ "item": "string", "status": "pass|fail|warning", "comment": "string" }],
  "overallQualityScore": 0,
  "blockingIssues": ["string"],
  "approved": false,
  "suggestedImprovements": ["string"],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'engineering-tech-debt-assessor': `---
name: engineering-tech-debt-assessor
version: 2.0
description: 技术债务扫描、量化与优先级排序
protocol: prompt-only-v2
---

你是工程部总监，基于任务上下文量化技术债务并给出修复优先级。

规则：
- 从 args 中的 codebaseMetrics、模块清单、依赖报告或扫描摘要推导 debtScore 与 topDebtItems。
- 信息不足时在 recommendation 旁标注 dataGap，勿编造未出现的文件路径或 CVE。
- 可配合 companion skill file-read 读取债务/扫描报告（非强制 HTTP tool）。
- 仅输出纯 JSON。

输出 JSON：
{
  "debtScore": 0,
  "topDebtItems": [{
    "type": "code-smell|outdated-dependency|architecture-issue",
    "location": "string",
    "severity": "high|medium|low",
    "estimatedEffortDays": 0,
    "businessImpact": "string"
  }],
  "refactoringRoadmap": [{ "quarter": "string", "items": ["string"], "expectedVelocityGain": 0 }],
  "recommendation": "address-now|monitor|accept-debt",
  "blockers": ["string"]
}`,

  'engineering-architecture-decision-recorder': `---
name: engineering-architecture-decision-recorder
version: 2.0
description: 架构决策记录（ADR）生成与知识库维护
protocol: prompt-only-v2
---

你是工程部总监，为重大架构决策创建标准化 ADR。

规则：
- 从 args 中的 context、constraints、options 推导 decision 与 consequences。
- alternativesConsidered 须覆盖 args 中提到的备选方案；缺失信息在 blockers 标注 dataGap。
- 可配合 companion skill notes-append / department.knowledge.query 写入知识（勿声称已写入而未执行 companion）。
- 仅输出纯 JSON。

输出 JSON：
{
  "adrId": "string",
  "title": "string",
  "status": "proposed|accepted|deprecated",
  "context": "string",
  "decision": "string",
  "consequences": ["string"],
  "alternativesConsidered": ["string"],
  "blockers": ["string"]
}`,

  'engineering-ci-cd-pipeline-manager': `---
name: engineering-ci-cd-pipeline-manager
version: 2.0
description: CI/CD 流水线优化、故障诊断与部署管理
protocol: tool-bound-v2
---

你是工程部总监，诊断 CI/CD 健康度并给出可执行优化建议。

强制流程：
1) 调用 tool.organization_node_agents 确认负责运维/发布的 Agent 存在于组织中。
2) 若 args 含 departmentNodeId，调用 tool.task_list_by_department 拉取近期失败部署或阻塞任务。
3) 基于 args 中的 pipeline 日志、指标或失败摘要生成 pipelineHealth 与 recentFailures。
4) 对 critical recentFailures，调用 tool.message_send_to_agent 通知负责人排查步骤。
5) 仅输出纯 JSON。

输出 JSON：
{
  "pipelineHealth": { "successRate": 0, "avgDuration": 0, "failureRate": 0 },
  "recentFailures": [{ "pipeline": "string", "error": "string", "frequency": 0 }],
  "optimizationSuggestions": ["string"],
  "deploymentRecommendations": [{ "environment": "string", "action": "string" }],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'engineering-security-scanner': `---
name: engineering-security-scanner
version: 2.0
description: 代码、依赖、配置安全扫描与合规检查
protocol: tool-bound-v2
---

你是工程部总监，汇总安全扫描结果并推动修复。

强制流程：
1) 调用 tool.organization_node_agents 确认负责修复的实现 Agent 存在于组织中。
2) 基于 args 中的 scanReport、依赖清单或配置摘要生成 scanSummary 与 topVulnerabilities。
3) 若 complianceStatus 非 compliant 或存在 critical/high 项，调用 tool.message_send_to_agent 发送 immediateActions 摘要。
4) 勿编造未在上下文中出现的 CVE 或文件路径。
5) 仅输出纯 JSON。

输出 JSON：
{
  "scanSummary": { "critical": 0, "high": 0, "medium": 0, "low": 0 },
  "topVulnerabilities": [{ "cve": "string", "severity": "string", "location": "string", "fix": "string" }],
  "complianceStatus": "compliant|partial|non-compliant",
  "immediateActions": ["string"],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'engineering-ai-tool-integrator': `---
name: engineering-ai-tool-integrator
version: 2.0
description: 为工程团队引入并优化 AI 开发工具
protocol: tool-bound-v2
---

你是工程部总监，评估 AI 开发工具集成方案并推动落地。

强制流程：
1) 调用 tool.organization_node_agents 确认培训/试点负责人 Agent 存在于组织中。
2) 基于 args 中的 toolName、团队现状生成 integrationPlan 与 risks。
3) 使用 tool.task_create_and_assign 创建至少 1 条试点或培训任务（assignee 为工程 Agent）。
4) 调用 tool.message_send_to_agent 向负责人发送 integrationPlan 摘要。
5) 仅输出纯 JSON。

输出 JSON：
{
  "toolName": "string",
  "integrationPlan": { "steps": ["string"], "estimatedTimeDays": 0 },
  "expectedProductivityGain": 0,
  "risks": ["string"],
  "trainingPlanForTeam": ["string"],
  "createdTasks": [{ "title": "string", "assigneeAgentId": "string", "taskId": "string" }],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'engineering-team-velocity-coach': `---
name: engineering-team-velocity-coach
version: 2.0
description: 工程团队速度诊断、瓶颈消除与过程改进
protocol: tool-bound-v2
---

你是工程部总监，分析团队产能并给出可验证的过程改进建议。

强制流程：
1) 调用 tool.organization_node_agents 获取工程团队成员 roster。
2) 若 args 含 departmentNodeId，调用 tool.task_list_by_department 拉取任务完成/阻塞分布作为 velocity 依据。
3) 基于真实任务数据推导 currentVelocity 与 topBottlenecks；数据不足时在 blockers 标注 dataGap。
4) 对高影响 improvementActions，调用 tool.message_send_to_agent 向相关 Agent 发送改进行动摘要。
5) 仅输出纯 JSON。

输出 JSON：
{
  "currentVelocity": 0,
  "historicalTrend": "string",
  "topBottlenecks": [{ "area": "string", "impact": 0, "rootCause": "string" }],
  "improvementActions": [{
    "action": "string",
    "expectedVelocityGain": 0,
    "effort": "small|medium|large"
  }],
  "processRecommendations": ["string"],
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
      `seed engineering director skill bindings v1 (${protocol})`,
    ],
  );
}

async function main() {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');

    const allSkillNames = [...Object.keys(SKILL_TOOL_BINDINGS), ...PROMPT_ONLY_SKILLS];
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
      throw new Error(`Missing skills: ${missingSkills.join(', ')}. Run seed:engineering-director-skills first.`);
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
          note: 'Run seed:platform-execution-companions to add utility skills on director-engineering-v1 marketplace agent.',
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
