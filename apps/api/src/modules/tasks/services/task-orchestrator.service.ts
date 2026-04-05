import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type { TaskBreakdownRequestedEvent } from '@contracts/events';
import { RequestBreakdownDto } from '../dto/request-breakdown.dto.js';

interface Actor {
  id: string;
  roles?: string[];
}

/**
 * 战略目标拆解：发布事件供 Worker LangGraph CEO Supervisor 消费；子任务落库由 Worker 回调 RPC 完成。
 */
@Injectable()
export class TaskOrchestratorService {
  private readonly logger = new Logger(TaskOrchestratorService.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async requestBreakdown(dto: RequestBreakdownDto, _actor: Actor): Promise<{ accepted: boolean }> {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    try {
      const event: TaskBreakdownRequestedEvent = {
        eventId: randomUUID(),
        eventType: 'task.breakdown.requested',
        aggregateId: dto.rootTaskId ?? companyId,
        aggregateType: 'task',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          rootTaskId: dto.rootTaskId,
          goal: dto.goal,
          context: dto.context,
          requestedAt: new Date().toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'task.breakdown.requested',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish task.breakdown.requested failed', { message: e?.message });
      throw e;
    }
    return { accepted: true };
  }
}
