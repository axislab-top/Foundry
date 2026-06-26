import assert from 'node:assert/strict';
import { RuntimeContext } from '../../runtime/runtime-context.js';
import { ApprovalGateInterceptor } from './approval-gate.interceptor.js';
import { RiskLevel } from '../../contracts/approval.contract.js';

let compensationCount = 0;
const interceptor = new ApprovalGateInterceptor(
  {
    requestAndWait: async () => false,
  },
  {
    publish: async () => {
      compensationCount += 1;
    },
  },
);

await RuntimeContext.run(
  new RuntimeContext({
    traceId: 'trace-approval',
    companyId: 'company-1',
    currentAgentId: 'agent-1',
  }),
  async () => {
    let blocked = false;
    try {
      await interceptor.executeWithGate({
        action: 'task.delete',
        riskLevel: RiskLevel.CRITICAL,
        execute: async () => 'ok',
      });
    } catch {
      blocked = true;
    }
    assert.equal(blocked, true);
  },
);

assert.equal(compensationCount, 1);
