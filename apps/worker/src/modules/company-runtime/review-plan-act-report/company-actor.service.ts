import { Injectable, Logger } from '@nestjs/common';
import type { CompanyHeartbeatContext } from '../dto/company-heartbeat-context.dto.js';
import type { Plan } from './company-planner.service.js';

export interface ExecutionResult {
  runId: string;
  dispatchedActions: string[];
}

@Injectable()
export class CompanyActorService {
  private readonly logger = new Logger(CompanyActorService.name);

  async executePlan(ctx: CompanyHeartbeatContext, plan: Plan): Promise<ExecutionResult> {
    this.logger.debug('CompanyActorService.executePlan called', { companyId: ctx.companyId });
    return { runId: `run-${Date.now()}`, dispatchedActions: [] };
  }
}
