import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import {
  AgentMessageSchema,
  createAgentMessage,
  MessageIntent,
  type AgentMessage,
} from '@foundry/multi-agent-core';
import { randomUUID } from 'crypto';
import { ConfigService } from '../../common/config/config.service.js';
import type { BaseEvent, CollaborationMessageReceivedEvent } from '@contracts/events';
import {
  COLLABORATION_AGENT_MESSAGE_ACKED_ROUTING_KEY,
  COLLABORATION_MESSAGE_RECEIVED_LEGACY_ROUTING_KEY,
} from '@contracts/events';
import { CollaborationDomainEventPublisher } from './domain/collaboration-domain-event-publisher.service.js';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class AgentMessageDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(AgentMessageDispatcherService.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly config: ConfigService,
    private readonly domainEvents: CollaborationDomainEventPublisher,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.messagingService.subscribeWithBackoff<BaseEvent & { data: unknown }>(
      'collaboration.agent-message.received',
      (event) => this.handleAgentMessage(event?.data),
      {
        queue: 'worker-collaboration-agent-message-dispatcher-queue',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handleAgentMessage(rawMessage: unknown): Promise<void> {
    if (!this.config.isAcpProtocolEnabled()) return;
    const parseResult = AgentMessageSchema.safeParse(rawMessage);
    if (!parseResult.success) {
      this.logger.warn('Invalid ACP message dropped', {
        errors: parseResult.error.format(),
      });
      return;
    }
    const message = parseResult.data;

    await this.emitAck(message);

    switch (message.intent) {
      case MessageIntent.TASK_DELEGATE:
        await this.handleTaskDelegation(message);
        return;
      case MessageIntent.APPROVAL_REQUEST:
        await this.handleApprovalRequest(message);
        return;
      case MessageIntent.TASK_UPDATE:
        await this.handleTaskUpdate(message);
        return;
      case MessageIntent.HEARTBEAT:
      case MessageIntent.MEMORY_UPDATE:
      case MessageIntent.APPROVAL_RESPONSE:
      case MessageIntent.HUMAN_IN_LOOP:
      default:
        this.logger.debug(`ACP intent observed: ${message.intent}`, {
          messageId: message.messageId,
          traceId: message.traceId,
        });
    }
  }

  private async emitAck(message: AgentMessage): Promise<void> {
    try {
      const ack = createAgentMessage({
        traceId: message.traceId,
        fromAgentId: 'worker.acp-dispatcher',
        toAgentId: message.fromAgentId || 'broadcast',
        intent: MessageIntent.TASK_UPDATE,
        payload: {
          ackOf: message.messageId,
          receivedIntent: message.intent,
        },
        context: message.context,
        status: 'acked',
      });

      const ackEvent: BaseEvent & { data: Record<string, unknown> } = {
        eventId: randomUUID(),
        eventType: 'collaboration.agent-message.acked',
        aggregateId: String(message.messageId),
        aggregateType: 'agent_message',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: message.context?.companyId,
        data: ack as unknown as Record<string, unknown>,
      };

      await this.messagingService.publish(ackEvent, {
        routingKey: COLLABORATION_AGENT_MESSAGE_ACKED_ROUTING_KEY,
        persistent: false,
      });
      const cid = String(message.context?.companyId ?? '').trim();
      if (cid) {
        await this.domainEvents.tryMirrorRawAgentPayload({
          companyId: cid,
          raw: ack,
          mirrorOf: 'acked',
        });
      }
    } catch (e: unknown) {
      this.logger.debug('ACP ack publish failed (non-fatal)', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async handleTaskDelegation(message: AgentMessage): Promise<void> {
    const companyId = String(message.context?.companyId ?? '').trim();
    const sessionId = String(message.context?.sessionId ?? '').trim();
    if (!companyId) return;
    const roomResolved = await this.resolveRoomIdFromSession(companyId, sessionId);
    if (!roomResolved?.roomId) {
      this.logger.warn('ACP session could not resolve to chat room, message dropped', {
        companyId,
        sessionId,
        messageId: message.messageId,
        traceId: message.traceId,
      });
      return;
    }
    const payloadRec =
      message.payload && typeof message.payload === 'object'
        ? (message.payload as Record<string, unknown>)
        : {};
    const taskId = String(payloadRec['taskId'] ?? message.messageId);
    const executorAgentId = String(
      payloadRec['executorAgentId'] ?? message.toAgentId ?? message.fromAgentId,
    ).trim();

    const acpFf =
      message.payload && typeof message.payload === 'object'
        ? (message.payload as Record<string, unknown>)['clientFeatureFlags']
        : undefined;
    const ffList = Array.isArray(acpFf)
      ? acpFf.map((x) => String(x ?? '').trim()).filter(Boolean)
      : typeof acpFf === 'string'
        ? acpFf
            .split(/[,;&\s]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    /**
     * W12：去除 legacy + domain 双写 — 公司启用领域总线时仅发 `collaboration.task-delegation.requested`；
     * 否则保留 synthetic {@link COLLABORATION_MESSAGE_RECEIVED_LEGACY_ROUTING_KEY} 供旧 Pipeline 消费。
     */
    if (await this.domainEvents.isEventBusV2Active(companyId, ffList)) {
      await this.domainEvents.publishTaskDelegationFromData({
        companyId,
        traceId: message.traceId,
        fromAgentId: message.fromAgentId,
        toAgentId: String(message.toAgentId ?? executorAgentId),
        sessionId: sessionId || undefined,
        delegation: {
          taskId,
          parentTaskId:
            typeof payloadRec['parentTaskId'] === 'string' ? payloadRec['parentTaskId'] : undefined,
          ownerAgentId: message.fromAgentId,
          executorAgentId,
          inputs: {
            source: 'acp_task_delegate',
            payload: payloadRec,
          },
          status: 'queued',
        },
        requestedAt: new Date().toISOString(),
      });
    } else {
      const legacy: CollaborationMessageReceivedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.message.received',
        aggregateId: taskId,
        aggregateType: 'chat_message',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          messageId: taskId,
          roomId: roomResolved.roomId,
          sourceSessionId: sessionId || undefined,
          seq: String(Date.now()),
          senderType: 'agent',
          senderId: message.fromAgentId,
          messageType: 'text',
          contentPreview: 'ACP task delegation',
          createdAt: new Date().toISOString(),
          traceId: message.traceId,
        },
      };
      await this.messagingService.publish(legacy, {
        routingKey: COLLABORATION_MESSAGE_RECEIVED_LEGACY_ROUTING_KEY,
        persistent: true,
      });
    }
  }

  private async resolveRoomIdFromSession(
    companyId: string,
    sessionId: string,
  ): Promise<{ roomId: string | null; resolvedBy: string }> {
    try {
      return await firstValueFrom(
        this.apiRpc
          .send<{ roomId: string | null; resolvedBy: string }>('collaboration.rooms.resolveSession', {
            companyId,
            actor: this.workerActor(),
            sessionId: sessionId || 'acp',
            bindMainFallback: true,
          })
          .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
      );
    } catch (error) {
      this.logger.warn('ACP session room resolve failed', {
        companyId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { roomId: null, resolvedBy: 'none' };
    }
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async handleApprovalRequest(message: AgentMessage): Promise<void> {
    this.logger.log('ACP approval request received', {
      messageId: message.messageId,
      traceId: message.traceId,
    });
  }

  private async handleTaskUpdate(message: AgentMessage): Promise<void> {
    this.logger.debug('ACP task update received', {
      messageId: message.messageId,
      traceId: message.traceId,
    });
  }
}
