import { Injectable, Logger } from '@nestjs/common';
import type { CompanyHeartbeatContext } from './dto/company-heartbeat-context.dto.js';

@Injectable()
export class CompanyCortexService {
  private readonly logger = new Logger(CompanyCortexService.name);

  async getStrategicContext(ctx: CompanyHeartbeatContext): Promise<unknown> {
    this.logger.debug('CompanyCortexService.getStrategicContext called', { companyId: ctx.companyId });
    return {};
  }
}
