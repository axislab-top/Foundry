import { Injectable } from '@nestjs/common';
import { CollaborationRealtimePublisher } from './collaboration-realtime-publisher.service.js';
import { ChatRoomService } from './chat-room.service.js';

/**
 * 将 Human-in-the-loop / Agent 审批请求推到 Gateway WebSocket（事件名 approval:needed）。
 * 与 {@link AgentNeedApprovalEvent}（MQ）配合：MQ 给 Worker，Redis 给在线用户实时弹窗。
 */
@Injectable()
export class CollaborationApprovalNotifier {
  constructor(
    private readonly collabRealtime: CollaborationRealtimePublisher,
    private readonly rooms: ChatRoomService,
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

  /**
   * M4：审批结果（批准/拒绝/过期）推 WS，事件名 `approval:status`。
   * `roomId` 缺省时回落到公司主会议室。
   */
  async pushApprovalStatus(params: {
    companyId: string;
    roomId?: string | null;
    approvalRequestId: string;
    status: 'approved' | 'rejected' | 'expired' | 'pending';
    executionTokenId?: string | null;
    resolvedBy?: string;
    reason?: string;
    actionType?: string | null;
  }): Promise<void> {
    let roomId = params.roomId?.trim() || null;
    if (!roomId) {
      const main = await this.rooms.findMainRoom(params.companyId);
      roomId = main?.id ?? null;
    }
    if (!roomId) {
      return;
    }
    await this.collabRealtime.publishEnvelope({
      event: 'approval:status',
      companyId: params.companyId,
      roomId,
      payload: {
        approvalRequestId: params.approvalRequestId,
        status: params.status,
        executionTokenId: params.executionTokenId ?? null,
        resolvedBy: params.resolvedBy,
        reason: params.reason,
        actionType: params.actionType ?? null,
      },
    });
  }
}
