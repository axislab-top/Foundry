import { proxyActivities, workflowInfo } from '@temporalio/workflow';
import type * as acts from './activities.js';

const { fetchCompanyIds, invokeCompanyHeartbeat } = proxyActivities<typeof acts>({
  startToCloseTimeout: '15 minutes',
  retry: {
    maximumAttempts: 4,
    initialInterval: '2s',
    backoffCoefficient: 2,
  },
});

/** Temporal Schedule 触发：对公司列表逐个执行与 Nest 心跳等价的内部 HTTP 入口 */
export async function heartbeatFanoutWorkflow(): Promise<void> {
  const ids = await fetchCompanyIds();
  const info = workflowInfo();
  for (const companyId of ids) {
    await invokeCompanyHeartbeat({
      companyId,
      temporalWorkflowId: info.workflowId,
      temporalRunId: info.runId,
    });
  }
}
