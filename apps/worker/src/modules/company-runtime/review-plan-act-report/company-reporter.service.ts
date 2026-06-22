import { Injectable, Logger } from '@nestjs/common';
import type { CompanyHeartbeatContext } from '../dto/company-heartbeat-context.dto.js';
import type { ReviewResult } from './company-review.service.js';
import type { Plan } from './company-planner.service.js';
import type { ExecutionResult } from './company-actor.service.js';

@Injectable()
export class CompanyReporterService {
  private readonly logger = new Logger(CompanyReporterService.name);

  async generateAndPublishReport(params: {
    context: CompanyHeartbeatContext;
    review: ReviewResult;
    plan: Plan;
    execution: ExecutionResult;
  }): Promise<void> {
    this.logger.debug('CompanyReporterService.generateAndPublishReport called', {
      companyId: params.context.companyId,
    });
  }
}
