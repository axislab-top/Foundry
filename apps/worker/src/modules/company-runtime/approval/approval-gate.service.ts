import { Injectable, Logger } from '@nestjs/common';
import type { BudgetApprovalStatusDecision } from './dto/approval-status-changed.dto.js';

@Injectable()
export class ApprovalGateService {
  private readonly logger = new Logger(ApprovalGateService.name);

  async processDecision(event: BudgetApprovalStatusDecision): Promise<void> {
    this.logger.debug('ApprovalGateService.processDecision called', { requestId: event.requestId });
  }
}
