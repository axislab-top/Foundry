import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CollaborationDirectorDeptReportEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';

@Injectable()
export class DirectorDeptReportMainRoomListener implements OnModuleInit {
  private readonly logger = new Logger(DirectorDeptReportMainRoomListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationDirectorDeptReportEvent>(
      'collaboration.director.dept-report',
      this.handle.bind(this),
      {
        queue: 'worker-main-room-director-dept-report-relay',
        durable: true,
        prefetchCount: 16,
      },
    );
  }

  private async handle(event: CollaborationDirectorDeptReportEvent): Promise<void> {
    if (!this.config.isMainRoomDeptProgressRelayEnabled()) return;
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    const data = event.data;
    if (!companyId || !data) return;

    const distributionId = String(data.distributionId ?? '').trim();
    const department = String(data.department ?? '').trim();
    if (!distributionId || !department) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        // NOTE: MainRoomDispatchTimelineService and MainRoomDistributionDispatchExecutorService
        // have been removed. This listener's relay logic is temporarily disabled.
        this.logger.debug('main_room.director_dept_report.relay_skipped', {
          companyId,
          distributionId,
          department,
        });
      } catch (e: unknown) {
        this.logger.warn('main_room.director_dept_report.relay_handler_failed', {
          companyId,
          distributionId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
