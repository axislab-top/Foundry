import { Injectable } from '@nestjs/common';
import { CollaborationRealtimePublisher } from './collaboration-realtime-publisher.service.js';

/**
 * 将 Human-in-the-loop / Agent 审批请求推到 Gateway WebSocket（事件名 approval:needed）。
 * 与 {@link AgentNeedApprovalEvent}（MQ）配合：MQ 给 Worker，Redis 给在线用户实时弹窗。
 */
@Injectable()
export class CollaborationApprovalNotifier {
  constructor(
    private readonly collabRealtime: CollaborationRealtimePublisher,
  ) {}

  async pushToRoom(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    reason?: string;
    approvalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.collabRealtime.publishEnvelope({
      event: 'approval:needed',
      companyId: params.companyId,
      roomId: params.roomId,
      payload: {
        agentId: params.agentId,
        reason: params.reason,
        approvalId: params.approvalId,
        ...params.metadata,
      },
    });
  }
}
