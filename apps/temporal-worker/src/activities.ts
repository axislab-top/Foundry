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
