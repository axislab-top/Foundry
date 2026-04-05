import {
  condition,
  continueAsNew,
  defineSignal,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import type * as acts from './activities.js';

const { fetchCompanyIds, invokeCompanyHeartbeat } = proxyActivities<typeof acts>({
  startToCloseTimeout: '15 minutes',
  retry: {
    maximumAttempts: 4,
    initialInterval: '2s',
    backoffCoefficient: 2,
  },
});

const { expireApprovalRequest } = proxyActivities<typeof acts>({
  startToCloseTimeout: '2 minutes',
  retry: { maximumAttempts: 5, initialInterval: '1s', backoffCoefficient: 2 },
});

const { supervisorRunPipeline } = proxyActivities<typeof acts>({
  startToCloseTimeout: '20 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '5s',
    backoffCoefficient: 2,
  },
});

const { invokeSupervisorPublishReport } = proxyActivities<typeof acts>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 4, initialInterval: '2s', backoffCoefficient: 2 },
});

export const approvalDecisionSignal = defineSignal<['approved' | 'rejected']>('approval.decision');

/** M4：等待审批信号；每 24h Continue-As-New 控制 history 体积，最长 7 天 */
export async function approvalWaitWorkflow(input: {
  approvalId: string;
  companyId: string;
  segment?: number;
}): Promise<void> {
  const segment = input.segment ?? 0;
  const maxSegments = 7;
  let decision: 'approved' | 'rejected' | null = null;
  setHandler(approvalDecisionSignal, (d) => {
    decision = d;
  });
  const done = await condition(() => decision !== null, '24h');
  if (done) {
    return;
  }
  if (segment + 1 >= maxSegments) {
    await expireApprovalRequest({ approvalId: input.approvalId, companyId: input.companyId });
    return;
  }
  await continueAsNew({ ...input, segment: segment + 1 });
}

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

/**
 * M5：失败 Run 复盘。
 * 当前：单 Activity 调用 API 内完整流水线（LLM + 门闸 + 记忆双写 + 事件），history 最小。
 * 若需「低置信度人工确认后再回灌」，可在此增加 signal + condition + continueAsNew（对齐 M4 审批分段）。
 */
export async function supervisorReviewWorkflow(input: {
  companyId: string;
  runId: string;
  taskId?: string;
}): Promise<void> {
  const info = workflowInfo();
  await supervisorRunPipeline({
    companyId: input.companyId,
    runId: input.runId,
    taskId: input.taskId,
    temporalWorkflowId: info.workflowId,
  });
}

/** M5：按公司列表推送复盘日报（记忆 + 主群） */
export async function supervisorReportFanoutWorkflow(input?: {
  kind?: 'daily' | 'weekly';
}): Promise<void> {
  const kind = input?.kind ?? 'daily';
  const ids = await fetchCompanyIds();
  for (const companyId of ids) {
    await invokeSupervisorPublishReport({ companyId, kind });
  }
}
