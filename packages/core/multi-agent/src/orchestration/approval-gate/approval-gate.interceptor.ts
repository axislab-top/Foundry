import { ApprovalRequestSchema, RiskLevel } from '../../contracts/approval.contract.js';
import { RuntimeContext } from '../../runtime/runtime-context.js';
import { createCompensationEvent, type CompensationEvent } from './compensation-event.js';

export interface ApprovalServicePort {
  requestAndWait: (payload: unknown) => Promise<boolean>;
}

export interface CompensationPublisherPort {
  publish: (event: CompensationEvent) => Promise<void>;
}

export class ApprovalGateInterceptor {
  constructor(
    private readonly approvalService: ApprovalServicePort,
    private readonly compensationPublisher: CompensationPublisherPort,
  ) {}

  public async executeWithGate<T>(params: {
    action: string;
    execute: () => Promise<T>;
    riskLevel?: RiskLevel;
  }): Promise<T> {
    const context = RuntimeContext.current();
    if (!context) {
      throw new Error('Runtime context missing in approval gate');
    }

    const riskLevel = params.riskLevel ?? this.calculateRisk(params.action);
    if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.CRITICAL) {
      const approvalRequest = ApprovalRequestSchema.parse({
        traceId: context.traceId,
        riskLevel,
        requestedAction: params.action,
        policyRef: 'policy:high-risk-execution',
        approver: 'human',
        expiresAt: Date.now() + 3600_000,
      });
      const approved = await this.approvalService.requestAndWait(approvalRequest);
      if (!approved) {
        await this.compensationPublisher.publish(
          createCompensationEvent({
            traceId: context.traceId,
            action: params.action,
            reason: 'approval rejected',
          }),
        );
        throw new Error('Execution blocked by approval gate');
      }
    }

    try {
      const out = await params.execute();
      context.emitTrace({ type: 'approval.gate.success', action: params.action, riskLevel });
      return out;
    } catch (error: unknown) {
      await this.compensationPublisher.publish(
        createCompensationEvent({
          traceId: context.traceId,
          action: params.action,
          reason: 'execution failed after gate',
        }),
      );
      throw error;
    }
  }

  private calculateRisk(action: string): RiskLevel {
    if (/delete|terminate|payment|billing/i.test(action)) return RiskLevel.CRITICAL;
    if (/deploy|approve|assign|delegate/i.test(action)) return RiskLevel.HIGH;
    if (/update|execute/i.test(action)) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }
}
