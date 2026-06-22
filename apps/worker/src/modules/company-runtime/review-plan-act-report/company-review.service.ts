import { Injectable, Logger } from '@nestjs/common';
import type { CompanyHeartbeatContext, CompanyStuckTaskSignal } from '../dto/company-heartbeat-context.dto.js';

export interface ReviewResult {
  stuckTasks: CompanyStuckTaskSignal[];
  summary: string;
  [key: string]: unknown;
}

@Injectable()
export class CompanyReviewService {
  private readonly logger = new Logger(CompanyReviewService.name);

  async reviewCompany(snapshot: unknown, strategicContext: unknown): Promise<ReviewResult> {
    this.logger.debug('CompanyReviewService.reviewCompany called');
    return { stuckTasks: [], summary: 'No issues found' };
  }
}
