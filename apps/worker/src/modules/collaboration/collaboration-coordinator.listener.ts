import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { MessagingService } from '@service/messaging';
import type {
  CollaborationCeoDecisionRecordedEvent,
  CollaborationIntentClassifiedEvent,
  CollaborationMessageReceivedEvent,
} from '@contracts/events';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import { TenantContextService } from '@service/tenant';
import { ConfigService } from '../../common/config/config.service.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import type { CeoDecisionResult } from './ceo-decision.service.js';
import { CollaborationRoomPipelineService } from './collaboration-room-pipeline.service.js';
import type { CollaborationRoutedIntent } from './intent-types.js';
import { CollaborationModeProposalService } from './collaboration-mode-proposal.service.js';

type ChatMessageRow = {
  id: string;
  roomId: string;
  content?: string | null;
  messageType?: string;
  senderType?: string;
  senderId?: string;
  metadata?: Record<string, unknown> | null;
  threadId?: string | null;
};

/**
 * 消费 collaboration.message.received：委托 LangGraph 房间流水线（CEO 决策 → 讨论/直聊/执行/审批 interrupt）、审批快捷回复、Agent 模式提议。
 */
@Injectable()
export class CollaborationCoordinatorListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationCoordinatorListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly idempotency: IdempotencyService,
    private readonly collaborationRoomPipeline: CollaborationRoomPipelineService,
    private readonly modeProposal: CollaborationModeProposalService,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<CollaborationMessageReceivedEvent>(
      'collaboration.message.received',
      this.handleMessageReceived.bind(this),
      {
        queue: 'worker-collaboration-message-coordinator-queue',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private rpcTimeoutMs() {
    return this.config.getCollaborationMentionRpcTimeoutMs();
  }

  private async rpcWithRetry<T>(
    pattern: string,
    payload: Record<string, unknown>,
    options?: { maxAttempts?: number },
  ): Promise<T> {
    const maxAttempts = options?.maxAttempts ?? 3;
    const timeoutMs = this.rpcTimeoutMs();
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await firstValueFrom(
          this.apiRpc.send<T>(pattern, payload).pipe(timeout(timeoutMs)),
        );
      } catch (e: unknown) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt < maxAttempts && /timeout|timed out|etimedout|econnreset|socket hang up|backlog/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  private async handleMessageReceived(event: CollaborationMessageReceivedEvent): Promise<void> {
    const companyId = event.companyId;
    if (!companyId) return;
    const { messageId, roomId } = event.data;
    if (!messageId || !roomId) return;

    const idemKey = `collab:coord:${messageId}`;
    if (!this.idempotency.markIfNew(idemKey, 60 * 60_000)) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        const msg = await this.rpcWithRetry<ChatMessageRow>('collaboration.messages.get', {
          companyId,
          actor: this.workerActor(),
          messageId,
        });
        if (!msg || (msg.messageType && msg.messageType !== 'text')) return;

        if (msg.senderType === 'agent') {
          await this.maybeHandleAgentProposal(companyId, msg);
          return;
        }
        if (msg.senderType !== 'human') return;

        const contentText = String(msg.content ?? '').trim();
        if (!contentText) return;

        const room = await this.rpcWithRetry<{ collaborationMode?: string; metadata?: Record<string, unknown> | null }>(
          'collaboration.rooms.findOne',
          {
            companyId,
            actor: this.workerActor(),
            roomId,
          },
        );
        const roomModeStored = room?.collaborationMode ?? 'discussion';

        const meta = msg.metadata ?? {};
        const mentionedFromDb = Array.isArray(meta.mentionedAgentIds)
          ? (meta.mentionedAgentIds as unknown[]).filter((x): x is string => typeof x === 'string')
          : event.data.mentionedAgentIds ?? [];

        const forceMode = meta.forceCollaborationMode;
        const forced =
          typeof forceMode === 'string' &&
          ['discussion', 'direct', 'execution', 'approval_wait'].includes(forceMode);

        const ceoRes = await this.rpcWithRetry<{ items?: Array<{ id: string }> }>('agents.findAll', {
          companyId,
          actor: this.workerActor(),
          role: 'ceo',
          status: 'active',
          page: 1,
          pageSize: 1,
        });
        const ceoId = ceoRes?.items?.[0]?.id ?? null;

        this.logger.log('collab-llm-trace | coordinator.ingest', {
          companyId,
          roomId,
          messageId,
          ceoAgentId: ceoId,
          threadId: msg.threadId ?? event.data.threadId ?? null,
          roomModeStored,
          forcedMode: forced ? forceMode : null,
          mentionedCount: mentionedFromDb.length,
          contentLen: contentText.length,
        });

        await this.maybeResolveApprovalFromText(companyId, msg, contentText);

        const pipelineRes = await this.collaborationRoomPipeline.run({
          companyId,
          roomId,
          messageId,
          contentText,
          threadId: msg.threadId ?? event.data.threadId ?? null,
          mentionedAgentIds: mentionedFromDb,
          ceoAgentId: ceoId,
          forcedMode: forced ? (forceMode as string) : null,
        });
        const intent = pipelineRes.decision;

        if (!pipelineRes.resumedFromInterrupt) {
          const ceoRecorded: CollaborationCeoDecisionRecordedEvent = {
            eventId: randomUUID(),
            eventType: 'collaboration.ceo.decision.recorded',
            aggregateId: messageId,
            aggregateType: 'chat_message',
            occurredAt: new Date().toISOString(),
            version: 1,
            companyId,
            data: {
              messageId,
              roomId,
              mode: intent.mode,
              confidence: intent.confidence,
              mentionedAgentIds: intent.mentionedAgentIds,
              actionSummary: intent.actionSummary,
              requiresHumanApproval: intent.requiresHumanApproval,
              approvalTitle: intent.approvalTitle,
              nextStep: intent.nextStep,
              modelUsed: intent.modelUsed,
              latencyMs: intent.latencyMs,
              cacheHit: intent.cacheHit,
              rawDecisionJson: intent.rawDecisionJson,
              decidedAt: new Date().toISOString(),
            },
          };
          try {
            await this.messagingService.publish(ceoRecorded, {
              routingKey: ceoRecorded.eventType,
              persistent: true,
            });
          } catch {
            /* non-fatal */
          }
        }

        await this.maybeSyncRoomCollaborationMode(companyId, roomId, roomModeStored, intent, messageId);

        if (!pipelineRes.resumedFromInterrupt) {
          const classified: CollaborationIntentClassifiedEvent = {
            eventId: randomUUID(),
            eventType: 'collaboration.intent.classified',
            aggregateId: messageId,
            aggregateType: 'chat_message',
            occurredAt: new Date().toISOString(),
            version: 1,
            companyId,
            data: {
              messageId,
              roomId,
              mode: intent.mode,
              confidence: intent.confidence,
              mentionedAgentIds: intent.mentionedAgentIds,
              classifiedAt: new Date().toISOString(),
            },
          };
          try {
            await this.messagingService.publish(classified, {
              routingKey: classified.eventType,
              persistent: true,
            });
          } catch {
            /* non-fatal */
          }
        }
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        this.logger.warn('Collaboration coordinator failed', {
          companyId,
          roomId,
          messageId: event.data.messageId,
          error: err.message,
        });
      }
    });
  }

  private async maybeHandleAgentProposal(companyId: string, msg: ChatMessageRow): Promise<void> {
    const raw = msg.metadata?.collaborationModeProposal as
      | { targetMode?: string; reason?: string }
      | undefined;
    if (!raw?.targetMode || typeof raw.reason !== 'string') return;
    const tm = raw.targetMode;
    if (!['discussion', 'direct', 'execution', 'approval_wait'].includes(tm)) return;
    await this.modeProposal.handleAgentProposal({
      companyId,
      roomId: msg.roomId,
      messageId: msg.id,
      agentId: msg.senderId ?? '',
      proposal: { targetMode: tm as 'discussion' | 'direct' | 'execution' | 'approval_wait', reason: raw.reason },
    });
  }

  private async maybeResolveApprovalFromText(
    companyId: string,
    msg: ChatMessageRow,
    text: string,
  ): Promise<void> {
    const approvalId =
      (typeof msg.metadata?.approvalId === 'string' && msg.metadata.approvalId) ||
      (typeof msg.metadata?.ceoApprovalId === 'string' && msg.metadata.ceoApprovalId) ||
      undefined;
    if (!approvalId) return;
    let decision: 'approved' | 'rejected' | undefined;
    if (/(拒绝|驳回|不同意)/.test(text)) decision = 'rejected';
    else if (/(同意|批准|通过|OK)/i.test(text)) decision = 'approved';
    if (!decision) return;
    const idem = `collab:approval:${msg.id}:${approvalId}`;
    if (!this.idempotency.markIfNew(idem, 60 * 60_000)) return;
    try {
      await this.rpcWithRetry('collaboration.ceoApprovals.resolve', {
        companyId,
        actor: { id: msg.senderId, roles: [] },
        approvalId,
        decision,
        note: text.slice(0, 500),
      });
    } catch (e: unknown) {
      this.logger.warn('Approval resolve from chat failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private mapDecisionToStoredMode(mode: CollaborationRoutedIntent): 'discussion' | 'direct' | 'execution' | 'approval_wait' {
    if (mode === 'approval') return 'approval_wait';
    return mode;
  }

  /** CEO 决策后回写房间协作阶段（供前端只读展示），不用于路由。 */
  private async maybeSyncRoomCollaborationMode(
    companyId: string,
    roomId: string,
    previousStored: string,
    intent: CeoDecisionResult,
    messageId: string,
  ): Promise<void> {
    if (!this.config.isCeoDecisionSyncRoomModeEnabled()) return;
    const next = this.mapDecisionToStoredMode(intent.mode);
    if (previousStored === next) return;
    const idem = `collab:syncMode:${messageId}:${next}`;
    if (!this.idempotency.markIfNew(idem, 60 * 60_000)) return;
    try {
      await this.rpcWithRetry('collaboration.rooms.updateCollaborationMode', {
        companyId,
        actor: this.workerActor(),
        roomId,
        collaborationMode: next,
        changeReason: 'ceo_decision',
      });
    } catch (e: unknown) {
      this.logger.warn('Sync room collaboration mode from CEO decision failed', {
        message: e instanceof Error ? e.message : String(e),
        roomId,
      });
    }
  }
}
