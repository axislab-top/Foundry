import { Injectable, Logger } from '@nestjs/common';
import type { ReviewResult } from './company-review.service.js';

export interface Plan {
  actions: string[];
  summary: string;
}

@Injectable()
export class CompanyPlannerService {
  private readonly logger = new Logger(CompanyPlannerService.name);

  async generateNextPlan(review: ReviewResult, snapshot: unknown): Promise<Plan> {
    this.logger.debug('CompanyPlannerService.generateNextPlan called');
    return { actions: [], summary: 'No actions needed' };
  }
}
