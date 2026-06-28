import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import {
  CompanyExecutionCoordinationService,
  type AutonomousTriggerKind,
} from '../../common/coordination/company-execution-coordination.service.js';

export type { AutonomousTriggerKind };

/**
 * 防止定时 Heartbeat 与事件触发在短时间内叠加。
 */
@Injectable()
export class AutonomousTriggerService {
  constructor(
    private readonly config: ConfigService,
    private readonly coordination: CompanyExecutionCoordinationService,
  ) {}

  async shouldRun(companyId: string, kind: AutonomousTriggerKind): Promise<boolean> {
    return this.coordination.tryAutonomousTriggerAsync(companyId, kind);
  }
}
