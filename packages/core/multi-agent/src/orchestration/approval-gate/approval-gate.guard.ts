import { CanActivate, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApprovalRequestSchema, RiskLevel, type ApprovalRequest } from '../../contracts/approval.contract.js';
import { RuntimeContext } from '../../runtime/runtime-context.js';
import { REQUIRE_APPROVAL, type RequireApprovalOptions } from './types.js';
import type { AtomicBindingService } from './atomic-binding.service.js';

@Injectable()
export class ApprovalGateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly atomicBindingService: AtomicBindingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RequireApprovalOptions>(REQUIRE_APPROVAL, context.getHandler());
    if (!options) return true;

    const runtime = RuntimeContext.current();
    const req = context.switchToHttp().getRequest<{ method?: string; url?: string; body?: Record<string, unknown> }>();
    if (!runtime) return false;

    const riskLevel = options.riskLevel ?? RiskLevel.HIGH;
    if (riskLevel === RiskLevel.LOW) return true;

    const approvalRequest = ApprovalRequestSchema.parse({
      traceId: runtime.traceId,
      riskLevel,
      requestedAction: options.action ?? `${req.method ?? 'RPC'} ${req.url ?? 'unknown'}`,
      policyRef: options.policyRef ?? 'policy:default-high-risk',
      approver: 'human',
      expiresAt: Date.now() + 24 * 3600_000,
      payload: req.body ?? {},
    }) as ApprovalRequest;

    await this.atomicBindingService.executeWithApproval(approvalRequest, async () => true);
    return true;
  }
}
