/** Hand-written runbook template ids (M2: no AI-generated runbooks). */
export enum RunbookId {
  TaskRunFailed = 'task_run_failed',
  HeartbeatLate = 'heartbeat_late',
  BudgetWarning = 'budget_warning',
  CeoGraphInvokeFailed = 'ceo_graph_invoke_failed',
  AgentExecutionFailed = 'agent_execution_failed',
}

const SNIPPETS: Record<RunbookId, string> = {
  [RunbookId.TaskRunFailed]: `## Task run failed
1. Open admin Board Room → select company → filter logs by **runId**.
2. Check last execution steps (LLM / tool / RPC) and error stack.
3. If Temporal: compare workflow id in task_runs.metadata.
4. Roll back blocked tasks only after root cause confirmed.`,
  [RunbookId.HeartbeatLate]: `## Heartbeat late
1. Confirm Worker and API health; check queue lag metrics.
2. Inspect last successful task_runs for the company.
3. Scale workers or reduce heartbeat frequency if overload.`,
  [RunbookId.BudgetWarning]: `## Budget warning
1. Open billing budgets for the company.
2. Check recent LLM usage in execution logs for the same runId.
3. Adjust limits or pause autonomous runs if needed.`,
  [RunbookId.CeoGraphInvokeFailed]: `## CEO graph failed
1. Find runId in alert; open trace / execution logs.
2. Check LangGraph checkpoint DB connectivity and last node in logs.
3. Retry heartbeat after fixing LLM credentials or graph config.`,
  [RunbookId.AgentExecutionFailed]: `## Agent task failed
1. Locate taskId + agentId in execution logs for the run.
2. Verify tool allowlists and external API availability.
3. Unblock task after fix; re-run pending agent processor.`,
};

export function getRunbookMarkdownSnippet(id: RunbookId): string {
  return SNIPPETS[id] ?? '';
}

export interface RunbookRenderInput {
  runbookId: RunbookId;
  placeholders?: Record<string, string>;
}

/** Replace {{key}} placeholders in snippet (best-effort). */
export function renderRunbookSnippet(input: RunbookRenderInput): string {
  let text = getRunbookMarkdownSnippet(input.runbookId);
  const ph = input.placeholders ?? {};
  for (const [k, v] of Object.entries(ph)) {
    text = text.split(`{{${k}}}`).join(v);
  }
  return text;
}
