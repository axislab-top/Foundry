import { Injectable, Logger } from '@nestjs/common';
import type { CompanyHeartbeatContext } from './dto/company-heartbeat-context.dto.js';

@Injectable()
export class CompanyStateService {
  private readonly logger = new Logger(CompanyStateService.name);

  async captureSnapshot(ctx: CompanyHeartbeatContext): Promise<unknown> {
    this.logger.debug('CompanyStateService.captureSnapshot called', { companyId: ctx.companyId });
    return {};
  }

  async updateSnapshot(ctx: CompanyHeartbeatContext, review: unknown, plan: unknown): Promise<void> {
    this.logger.debug('CompanyStateService.updateSnapshot called', { companyId: ctx.companyId });
  }
}
