import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { CollaborationDepartmentJoinedEvent } from '@contracts/events';

/**
 * 部门 Agent 被拉入群聊后的异步处理占位：可接审计、Memory 索引、任务提醒等。
 */
@Injectable()
export class CollaborationDepartmentJoinedListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationDepartmentJoinedListener.name);

  constructor(private readonly messagingService: MessagingService) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<CollaborationDepartmentJoinedEvent>(
      'collaboration.department.joined',
      this.handle.bind(this),
      {
        queue: 'worker-collaboration-dept-joined-queue',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: CollaborationDepartmentJoinedEvent): Promise<void> {
    this.logger.log('collaboration.department.joined', {
      roomId: event.data.roomId,
      nodeId: event.data.organizationNodeId,
      agentCount: event.data.agentIds.length,
      companyId: event.companyId,
    });
  }
}
