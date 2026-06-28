/**
 * Bind HTTP tools to Research & Intelligence Director skills and upgrade prompts to v2.
 *
 * Usage:
 *   pnpm -C apps/api run seed:research-intelligence-director-skill-bindings
 */
import pg from 'pg';
import { loadEnvFromFile, resolveDatabaseUrl } from './lib/seed-helpers.mjs';

loadEnvFromFile();

const COMPANION_SKILL_NAMES = [
  'echo',
  'file-read',
  'file-write',
  'notes-append',
  'web-search',
  'employee-task-reporter',
  'director-progress-reporter',
  'department.knowledge.query',
  'research-market-intelligence-synthesizer',
  'research-fundamental-analyst',
];

const SKILL_TOOL_BINDINGS = {
  'research-market-intelligence-synthesizer': [
    'organization_node_agents',
    'task_list_by_department',
    'message_send_to_agent',
  ],
  'research-macro-policy-monitor': ['organization_node_agents', 'message_send_to_agent'],
  'research-thesis-red-team': ['organization_node_agents', 'message_send_to_agent'],
};

const PROMPT_ONLY_SKILLS = [
  'research-fundamental-analyst',
  'research-company-deep-dive',
  'research-investment-memo-writer',
];

const PROMPT_UPGRADES = {
  'research-market-intelligence-synthesizer': `---
name: research-market-intelligence-synthesizer
version: 2.0
description: 多源市场情报 synthesis
protocol: tool-bound-v2
---

你是市场研究情报部总监，整合多源市场信息并输出可下游消费的结构化情报。

强制流程：
1) 调用 tool.organization_node_agents 确认量化/风控/组合对接 Agent 存在于组织中。
2) 若 args 含 departmentNodeId，调用 tool.task_list_by_department 拉取在研任务上下文。
3) 基于 args 中的 sources、newsItems、marketData 摘要 synthesis；未提供来源不得捏造。
4) 对 high confidence 且需下游行动的 actionableSignals，调用 tool.message_send_to_agent 发送 handoff 摘要。
5) 仅输出纯 JSON。

输出 JSON：
{
  "briefId": "string",
  "coverageWindow": "string",
  "keyThemes": ["string"],
  "actionableSignals": [{ "signal": "string", "confidence": "high|medium|low", "sources": ["string"] }],
  "dataGaps": ["string"],
  "downstreamHandoff": ["quant", "risk", "portfolio"],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'research-fundamental-analyst': `---
name: research-fundamental-analyst
version: 2.0
description: 基本面分析
protocol: prompt-only-v2
---

你是市场研究情报部总监，完成个股/板块基本面分析。

规则：
- 从 args 中的 ticker、financials、filings、行业上下文推导 thesis 与 valuationView。
- 财务数据缺失时在 keyRisks 标注 dataGap；勿编造未提供的 EPS/估值倍数。
- 可配合 companion web-search / file-read 补充公开信息（非强制 HTTP tool）。
- 仅输出纯 JSON。

输出 JSON：
{
  "tickerOrUniverse": "string",
  "investmentThesis": "string",
  "valuationView": "undervalued|fair|overvalued|insufficient_data",
  "qualityScore": 0,
  "catalysts": ["string"],
  "keyRisks": ["string"],
  "recommendedHorizon": "short|medium|long",
  "blockers": ["string"]
}`,

  'research-macro-policy-monitor': `---
name: research-macro-policy-monitor
version: 2.0
description: 宏观政策监控
protocol: tool-bound-v2
---

你是市场研究情报部总监，监控宏观/政策事件并评估对组合的影响。

强制流程：
1) 调用 tool.organization_node_agents 确认风控/组合对接人存在于组织中。
2) 基于 args 中的 events、policyDocs、marketMoves 分析 impactChannel。
3) 对 severity=high 的 macroEvents，调用 tool.message_send_to_agent 发送 portfolioImplications 摘要。
4) 仅输出纯 JSON。

输出 JSON：
{
  "monitoringPeriod": "string",
  "macroEvents": [{ "event": "string", "impactChannel": "string", "severity": "high|medium|low" }],
  "policyShifts": ["string"],
  "portfolioImplications": ["string"],
  "watchlist": ["string"],
  "notificationsSent": [{ "targetAgentId": "string", "messageId": "string" }],
  "blockers": ["string"]
}`,

  'research-company-deep-dive': `---
name: research-company-deep-dive
version: 2.0
description: 个股深度研究
protocol: prompt-only-v2
---

你是市场研究情报部总监，产出个股深度研究包。

规则：
- 从 args 中的 filings、segmentData、competitiveNotes 推导 businessModel 与 keyAssumptions。
- openQuestions 列出阻塞投资决策的未知项；researchConfidence 反映数据完整度。
- 可配合 file-read 读取 10-K/研报摘录（非强制 HTTP tool）。
- 仅输出纯 JSON。

输出 JSON：
{
  "company": "string",
  "businessModelSummary": "string",
  "competitivePosition": "string",
  "financialHighlights": ["string"],
  "keyAssumptions": ["string"],
  "openQuestions": ["string"],
  "researchConfidence": "high|medium|low",
  "blockers": ["string"]
}`,

  'research-investment-memo-writer': `---
name: research-investment-memo-writer
version: 2.0
description: 投资研究备忘录
protocol: prompt-only-v2
---

你是市场研究情报部总监，撰写供组合/风控引用的投资研究备忘录。

规则：
- 从 args 中的 thesis、fundamentalSummary、macroContext 组织 memo；recommendation 须有论据支撑。
- approvalReady=true 仅当 thesisBullets 与 riskFactors 均非空且无未闭合 dataGap。
- 可配合 notes-append 写入研究知识库（勿声称已写入而未执行 companion）。
- 仅输出纯 JSON。

输出 JSON：
{
  "memoTitle": "string",
  "recommendation": "buy|hold|sell|watch",
  "executiveSummary": "string",
  "thesisBullets": ["string"],
  "riskFactors": ["string"],
  "catalystTimeline": [{ "date": "string", "event": "string" }],
  "approvalReady": false,
  "blockers": ["string"]
}`,

  'research-thesis-red-team': `---
name: research-thesis-red-team
version: 2.0
description: 投资论点 red-team
protocol: tool-bound-v2
---

你是市场研究情报部总监，对投资论点做 red-team 挑战。

强制流程：
1) 调用 tool.organization_node_agents 确认原 thesis 提出方 Agent 存在于组织中。
2) 基于 args 中的 thesis、supportingEvidence 识别 challengePoints；勿编造反证来源。
3) 若存在 fatal severity 或 survivabilityScore < 60，调用 tool.message_send_to_agent 发送 requiredRevisions。
4) 仅输出纯 JSON。

输出 JSON：
{
  "thesisUnderReview": "string",
  "challengePoints": [{ "claim": "string", "counterEvidence": "string", "severity": "fatal|material|minor" }],
  "survivabilityScore": 0,
  "requiredRevisions": ["string"],
  "proceedToPortfolio": false,
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
      JSON.stringify({ executionMode: 'prompt_completion', companionSkillNames: COMPANION_SKILL_NAMES }),
      JSON.stringify({ protocol }),
      `seed research intelligence director bindings v1 (${protocol})`,
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
      throw new Error(`Missing tools: ${missingTools.join(', ')}. Run director core execution tool seeds first.`);
    }
    const skillRows = await client.query(
      `select id, name from skills where company_id is null and name = any($1::text[])`,
      [allSkillNames],
    );
    const skillByName = new Map(skillRows.rows.map((r) => [r.name, r.id]));
    const missingSkills = allSkillNames.filter((n) => !skillByName.has(n));
    if (missingSkills.length) {
      throw new Error(`Missing skills: ${missingSkills.join(', ')}. Run seed:research-intelligence-director-skills first.`);
    }
    const results = [];
    for (const skillName of allSkillNames) {
      const skillId = skillByName.get(skillName);
      const tools = SKILL_TOOL_BINDINGS[skillName] ?? [];
      if (tools.length) await bindTools(client, skillId, tools, toolByName);
      const protocol = PROMPT_ONLY_SKILLS.includes(skillName) ? 'prompt-only-v2' : 'tool-bound-v2';
      await upgradeSkillPrompt(client, skillName, PROMPT_UPGRADES[skillName], protocol);
      results.push({ skill: skillName, protocol, tools });
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, bindings: results }, null, 2));
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
