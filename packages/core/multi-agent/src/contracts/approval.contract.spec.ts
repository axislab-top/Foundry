import assert from 'node:assert/strict';
import { ApprovalRequestSchema, RiskLevel } from './approval.contract.js';

const request = ApprovalRequestSchema.parse({
  traceId: 'trace-approval-1',
  riskLevel: RiskLevel.HIGH,
  requestedAction: 'task.execute:42',
  policyRef: 'policy/high-risk',
  approver: 'human',
  expiresAt: Date.now() + 30000,
});

assert.equal(request.decision, 'pending');
assert.ok(request.approvalRequestId.length > 0);
