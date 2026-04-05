/**
 * Activities：读环境变量公司列表 + 调用 Worker internal HTTP。
 */
export async function fetchCompanyIds(): Promise<string[]> {
  const raw = process.env.TEMPORAL_HEARTBEAT_COMPANY_IDS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function invokeCompanyHeartbeat(input: {
  companyId: string;
  temporalWorkflowId: string;
  temporalRunId: string;
}): Promise<void> {
  const base = (process.env.WORKER_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3004').replace(
    /\/$/,
    '',
  );
  const secret = process.env.WORKER_INTERNAL_API_SECRET ?? '';
  if (!secret) {
    throw new Error('WORKER_INTERNAL_API_SECRET is required for invokeCompanyHeartbeat');
  }
  const url = `${base}/api/internal/temporal/company-heartbeat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Auth': secret,
    },
    body: JSON.stringify({
      companyId: input.companyId,
      temporalWorkflowId: input.temporalWorkflowId,
      temporalRunId: input.temporalRunId,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Worker internal heartbeat failed ${res.status}: ${t}`);
  }
}

/**
 * M4：审批单 pending 超时 → 调 API 将状态置为 expired。
 */
/** M5：复盘流水线（API 内执行 LLM + 记忆回灌） */
export async function supervisorRunPipeline(input: {
  companyId: string;
  runId: string;
  taskId?: string;
  temporalWorkflowId?: string;
}): Promise<Record<string, unknown>> {
  const base = (process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const secret = process.env.API_INTERNAL_AUTH_SECRET ?? '';
  if (!secret) {
    throw new Error('API_INTERNAL_AUTH_SECRET is required for supervisorRunPipeline');
  }
  const url = `${base}/api/internal/supervisor/run-pipeline`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Auth': secret,
    },
    body: JSON.stringify({
      companyId: input.companyId,
      runId: input.runId,
      taskId: input.taskId,
      temporalWorkflowId: input.temporalWorkflowId,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`supervisor pipeline failed ${res.status}: ${t}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** M5：日报/周报推送到协作 + 记忆归档 */
export async function invokeSupervisorPublishReport(input: {
  companyId: string;
  kind: 'daily' | 'weekly';
}): Promise<void> {
  const base = (process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const secret = process.env.API_INTERNAL_AUTH_SECRET ?? '';
  if (!secret) {
    throw new Error('API_INTERNAL_AUTH_SECRET is required for invokeSupervisorPublishReport');
  }
  const url = `${base}/api/internal/supervisor/publish-report`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Auth': secret,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`supervisor report failed ${res.status}: ${t}`);
  }
}

export async function expireApprovalRequest(input: {
  approvalId: string;
  companyId: string;
}): Promise<void> {
  const base = (process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const secret = process.env.API_INTERNAL_AUTH_SECRET ?? '';
  if (!secret) {
    throw new Error('API_INTERNAL_AUTH_SECRET is required for expireApprovalRequest');
  }
  const url = `${base}/api/internal/approval/expire`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Auth': secret,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`expire approval failed ${res.status}: ${t}`);
  }
}
