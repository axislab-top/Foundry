import { Injectable } from '@nestjs/common';
import {
  BaseSupervisor,
  RiskLevel,
  RuntimeExecutionContext,
  type SupervisorDecision,
} from '@foundry/multi-agent-core';

@Injectable()
export class DefaultSupervisorService extends BaseSupervisor {
  constructor() {
    super(
      new RuntimeExecutionContext({
        companyId: 'supervisor-bootstrap',
        currentAgentId: 'default-supervisor',
      }),
    );
  }

  protected async evaluateInternal(action: string, payload: unknown): Promise<SupervisorDecision> {
    void payload;
    if (!action.trim()) {
      return {
        decision: 'block',
        reason: 'action is empty',
        riskLevel: RiskLevel.MEDIUM,
      };
    }
    return {
      decision: 'allow',
      reason: 'default policy allows action',
      riskLevel: RiskLevel.LOW,
    };
  }
}
