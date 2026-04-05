import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { MessagingService } from '@service/messaging';
import type { TaskBreakdownRequestedEvent } from '@contracts/events';
import { randomUUID } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';

/**
 * 群聊「执行」路径：创建根任务并发布 task.breakdown.requested（与协作协调器原逻辑一致）。
 */
@Injectable()
export class CollaborationCeoBreakdownService {
  private readonly logger = new Logger(CollaborationCeoBreakdownService.name);
  private readonly roomCooldown = new Map<string, number>();

  constructor(
    private readonly messagingService: MessagingService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private rpcTimeoutMs() {
    return this.config.getCollaborationMentionRpcTimeoutMs();
  }

  private async rpcWithRetry<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    const timeoutMs = this.rpcTimeoutMs();
    return await firstValueFrom(this.apiRpc.send<T>(pattern, payload).pipe(timeout(timeoutMs)));
  }

  async isAgentMember(companyId: string, roomId: string, agentId: string): Promise<boolean> {
    const members = await this.rpcWithRetry<unknown>('collaboration.members.list', {
      companyId,
      actor: this.workerActor(),
      roomId,
    });
    return Array.isArray(members)
      ? members.some((m: { memberType?: string; memberId?: string; leftAt?: unknown }) =>
          m.memberType === 'agent' && m.memberId === agentId && !m.leftAt,
        )
      : false;
  }

  async requestBreakdown(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    ceoId: string;
    contentText: string;
  }): Promise<void> {
    const { companyId, roomId, messageId, ceoId, contentText } = params;
    const isMember = await this.isAgentMember(companyId, roomId, ceoId);
    if (!isMember) {
      this.logger.warn('CEO not active member; skip breakdown', { companyId, roomId, ceoId });
      return;
    }

    const roomKey = `${companyId}:${roomId}`;
    const now = Date.now();
    const last = this.roomCooldown.get(roomKey) ?? 0;
    if (now - last < 10_000) {
      this.logger.debug('Skip CEO breakdown: room cooldown', { companyId, roomId, messageId });
      return;
    }
    this.roomCooldown.set(roomKey, now);

    const idemKey = `collab:autoReply:${messageId}:${ceoId}`;
    if (!this.idempotency.markIfNew(idemKey, 60 * 60_000)) return;

    const firstLine = (contentText.split('\n')[0] ?? '').trim();
    const rootTitleBase = firstLine.length ? firstLine : contentText.trim().slice(0, 120);
    const rootTitle = `CEO 任务拆解：${rootTitleBase}`.slice(0, 512);
    const rootDesc = contentText.length > 2000 ? contentText.slice(0, 2000) : contentText;

    const rootTask = await this.rpcWithRetry<{ id?: string }>('tasks.create', {
      companyId,
      actor: this.workerActor(),
      source: 'autonomous',
      data: {
        title: rootTitle || 'CEO 任务拆解',
        description: rootDesc || undefined,
        requiresHumanApproval: false,
        metadata: {
          source: 'collaboration_mention',
          roomId,
          triggeredMessageId: messageId,
          ceoAgentId: ceoId,
        },
      },
    });

    const rootTaskId = rootTask?.id;
    if (!rootTaskId) {
      this.logger.warn('CEO breakdown skipped: root task id missing', {
        companyId,
        roomId,
        messageId,
        ceoId,
      });
      return;
    }

    const evt: TaskBreakdownRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'task.breakdown.requested',
      aggregateId: rootTaskId,
      aggregateType: 'task',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        companyId,
        rootTaskId,
        goal: contentText,
        context: {
          roomId,
          sourceMessageId: messageId,
          mentionedAgentId: ceoId,
        },
        requestedAt: new Date().toISOString(),
      },
    };

    await this.messagingService.publish(evt, {
      routingKey: 'task.breakdown.requested',
      persistent: true,
    });

    this.logger.log('CEO breakdown requested (execution intent)', {
      companyId,
      roomId,
      messageId,
      ceoId,
      rootTaskId,
    });
  }
}
