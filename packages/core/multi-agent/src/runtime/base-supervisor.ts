import { RiskLevel } from '../contracts/approval.contract.js';
import type { RuntimeContext } from './runtime-context.js';
import type { SupervisionResult } from '../supervision/supervision-action.js';

export interface SupervisorDecision {
  decision: 'allow' | 'warn' | 'block' | 'request-human-review';
  reason: string;
  riskLevel: RiskLevel;
  suggestedApproval?: boolean;
  policyRef?: string;
}

/**
 * Base class for runtime supervisor behavior.
 */
export abstract class BaseSupervisor {
  protected readonly context: RuntimeContext;

  constructor(context: RuntimeContext) {
    this.context = context;
  }

  public async evaluate(action: string, payload: unknown): Promise<SupervisorDecision> {
    this.context.emitTrace({ type: 'supervisor.evaluate', action });
    return this.evaluateInternal(action, payload);
  }

  public async evaluateAsSupervisionResult(
    action: string,
    payload: unknown,
  ): Promise<SupervisionResult> {
    const decision = await this.evaluate(action, payload);
    return {
      action: decision.decision,
      reason: decision.reason,
      policyRef: decision.policyRef,
    };
  }

  protected async defaultAllow(reason = 'Default allow'): Promise<SupervisorDecision> {
    return {
      decision: 'allow',
      reason,
      riskLevel: RiskLevel.LOW,
    };
  }

  protected abstract evaluateInternal(action: string, payload: unknown): Promise<SupervisorDecision>;
}
