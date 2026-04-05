#!/usr/bin/env node
/**
 * 在命令行测量「与 Worker AutonomousOrchestrator.plan() 相近」的大模型耗时，
 * 用于判断超时是网络/模型慢，还是栈内别处在拖时间。
 *
 * Windows CMD:
 *   set OPENAI_API_KEY=你的key
 *   node scripts\benchmark-ceo-breakdown-llm.mjs
 *
 * 可选环境变量:
 *   MODEL=gpt-4o-mini          默认 gpt-4o-mini
 *   OPENAI_BASE_URL=...        默认 https://api.openai.com/v1
 *   CONTEXT_CHARS=12000        模拟 user 里 context= 截断长度（与 Worker 一致为 12000）
 *   RUNS=3                     连续跑几次取平均
 *
 * 说明:
 * - Worker 里 LangChain withStructuredOutput 与直连 json_schema 耗时同量级，通常仍是一次 HTTP。
 * - 本脚本不测 ingest 里多次 API RPC；若这里很快但线上仍卡，应查 RabbitMQ/api-rpc 队列与 ingest 各 RPC。
 */

const API_KEY = process.env.OPENAI_API_KEY?.trim();
const BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.MODEL || 'gpt-4o-mini';
const CONTEXT_CHARS = Math.min(
  200_000,
  Math.max(1000, Number.parseInt(String(process.env.CONTEXT_CHARS || '12000'), 10) || 12_000),
);
const RUNS = Math.min(10, Math.max(1, Number.parseInt(String(process.env.RUNS || '1'), 10) || 1));

const SYSTEM_DEFAULT =
  '你是公司 CEO，负责根据上下文提出可执行的子任务，并遵守组织结构。';

function buildOrgPrompt() {
  return '(无组织树)';
}

function buildContextJson(targetLen) {
  const pad = { _: 'x'.repeat(200) };
  let s = JSON.stringify({
    runKind: 'breakdown',
    tickAt: new Date().toISOString(),
    traceId: 'bench-trace',
    triggerSource: 'collaboration_mention',
    dashboard: { note: 'benchmark stub' },
    memorySearch: [],
    budgets: [],
    tasks_pending: { items: [] },
    tasks_in_progress: { items: [] },
    tasks_review: { items: [] },
    organizationTree: [],
    ceoAgents: { items: [{ id: 'ceo-1', systemPrompt: SYSTEM_DEFAULT }] },
    modelRouter: { modelName: MODEL, degraded: false, utilization: 0.1, reason: 'bench' },
  });
  while (s.length < targetLen) {
    s += JSON.stringify(pad);
  }
  return s.slice(0, targetLen);
}

function buildUserContent(contextStr) {
  return [
    'trigger=collaboration_mention',
    'goal=@CEO 你好',
    `context=${contextStr}`,
  ].join('\n');
}

/** 与 ceo-plan.schema 对齐的 OpenAI json_schema（简化 optional 字段） */
const CEO_PLAN_JSON_SCHEMA = {
  name: 'ceo_plan',
  strict: false,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'tasks', 'requiresHumanApproval'],
    properties: {
      summary: { type: 'string' },
      requiresHumanApproval: { type: 'boolean' },
      approvalReason: { type: 'string' },
      tasks: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title'],
          properties: {
            title: { type: 'string', maxLength: 512 },
            description: { type: 'string' },
            organizationNodeId: { type: 'string' },
            assigneeAgentId: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          },
        },
      },
    },
  },
};

async function oneCall(label, contextChars) {
  const contextStr = buildContextJson(contextChars);
  const userContent = buildUserContent(contextStr);
  const systemMessage = `${SYSTEM_DEFAULT}\n\n组织树（仅允许将任务关联到以下节点 id）：\n${buildOrgPrompt()}\n\n预算利用率: 0.1；模型降级: 否。`;

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: CEO_PLAN_JSON_SCHEMA,
    },
  };

  const t0 = performance.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const elapsed = performance.now() - t0;

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 2000)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON body: ${text.slice(0, 500)}`);
  }
  const choice = json.choices?.[0]?.message?.content;
  if (!choice) {
    throw new Error(`No choice content: ${text.slice(0, 800)}`);
  }
  const parsed = JSON.parse(choice);
  return {
    elapsedMs: elapsed,
    summaryLen: String(parsed.summary || '').length,
    taskCount: Array.isArray(parsed.tasks) ? parsed.tasks.length : 0,
    promptChars: systemMessage.length + userContent.length,
  };
}

async function main() {
  if (!API_KEY) {
    console.error('缺少 OPENAI_API_KEY。CMD 示例: set OPENAI_API_KEY=sk-... && node scripts\\benchmark-ceo-breakdown-llm.mjs');
    process.exit(1);
  }

  console.log('CEO breakdown LLM 基准（贴近 Worker plan()）');
  console.log(`  MODEL=${MODEL}`);
  console.log(`  BASE=${BASE}`);
  console.log(`  CONTEXT_CHARS=${CONTEXT_CHARS}`);
  console.log(`  RUNS=${RUNS}`);
  console.log('');

  const results = [];
  for (let i = 1; i <= RUNS; i += 1) {
    const label = `run ${i}/${RUNS}`;
    process.stdout.write(`${label} ... `);
    try {
      const r = await oneCall(label, CONTEXT_CHARS);
      results.push(r.elapsedMs);
      console.log(
        `OK  ${r.elapsedMs.toFixed(0)} ms  (prompt ~${r.promptChars} chars, summary ${r.summaryLen} chars, tasks ${r.taskCount})`,
      );
    } catch (e) {
      console.log('FAIL');
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  const sum = results.reduce((a, b) => a + b, 0);
  const avg = sum / results.length;
  const max = Math.max(...results);
  const min = Math.min(...results);
  console.log('');
  console.log('汇总 (ms):', { min: min.toFixed(0), max: max.toFixed(0), avg: avg.toFixed(0) });
  console.log('');
  console.log('对照 Worker 默认超时: CEO_LLM_TIMEOUT_MS=120000, breakdown 建议 WORKER_COLLAB_LLM_TIMEOUT_MS 或加长 CEO_LLM_TIMEOUT_MS。');
}

main();
