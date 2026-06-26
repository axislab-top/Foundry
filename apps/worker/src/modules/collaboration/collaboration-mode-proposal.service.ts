import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type { CollaborationModeProposedEvent } from '@contracts/events';
import { ConfigService } from '../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import { CeoLayerConfigResolverService } from './ceo/resolver/ceo-layer-config-resolver.service.js';

type TargetMode = 'discussion' | 'direct' | 'execution' | 'approval_wait';

@Injectable()
export class CollaborationModeProposalService {
  private readonly logger = new Logger(CollaborationModeProposalService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly collabLlm: CollaborationLlmBridgeService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly messaging: MessagingService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async handleAgentProposal(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    agentId: string;
    proposal: { targetMode: TargetMode; reason: string };
  }): Promise<void> {
    const timeoutMs = this.config.getCollaborationMentionRpcTimeoutMs();
    const room = await firstValueFrom(
      this.apiRpc
        .send<{ collaborationMode?: string; metadata?: Record<string, unknown> | null }>(
          'collaboration.rooms.findOne',
          {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
          },
        )
        .pipe(timeout(timeoutMs)),
    );
    const meta = room?.metadata ?? {};
    if (meta.disallowAgentCollaborationProposals === true) {
      this.logger.debug('Agent mode proposal skipped: disallowed on room', {
        roomId: params.roomId,
      });
      return;
    }

    const proposed: CollaborationModeProposedEvent = {
      eventId: randomUUID(),
      eventType: 'collaboration.mode.proposed',
      aggregateId: params.roomId,
      aggregateType: 'chat_room',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        roomId: params.roomId,
        proposedByAgentId: params.agentId,
        targetMode: params.proposal.targetMode,
        reason: params.proposal.reason.slice(0, 2000),
        sourceMessageId: params.messageId,
        proposedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(proposed, {
      routingKey: proposed.eventType,
      persistent: true,
    });

    let approved = params.proposal.targetMode === 'discussion';
    if (!approved) {
      approved = await this.ceoArbitrate(
        params.companyId,
        params.proposal.targetMode,
        params.proposal.reason,
      );
    }

    if (!approved) {
      this.logger.log('CEO rejected agent collaboration mode proposal', {
        roomId: params.roomId,
        targetMode: params.proposal.targetMode,
      });
      return;
    }

    await firstValueFrom(
      this.apiRpc
        .send<unknown>('collaboration.rooms.updateCollaborationMode', {
          companyId: params.companyId,
          actor: this.workerActor(),
          roomId: params.roomId,
          collaborationMode: params.proposal.targetMode,
          changeReason: 'ceo_arbitrated_agent_proposal',
        })
        .pipe(timeout(timeoutMs)),
    );
  }

  private async ceoArbitrate(
    companyId: string,
    targetMode: TargetMode,
    reason: string,
  ): Promise<boolean> {
    const timeoutMs = this.config.getCollaborationMentionRpcTimeoutMs();
    const ceoRes = await firstValueFrom(
      this.apiRpc
        .send<{ items?: Array<{ id: string }> }>('agents.findAll', {
          companyId,
          actor: this.workerActor(),
          role: 'ceo',
          status: 'active',
          page: 1,
          pageSize: 1,
        })
        .pipe(timeout(timeoutMs)),
    );
    const ceoId = ceoRes?.items?.[0]?.id;
    if (!ceoId) return false;

    const layerSetting = await this.ceoLayerConfigResolver.resolveLayerSetting(companyId, 'strategy');
    const modelName = String(layerSetting.modelName ?? '').trim();
    if (!modelName) {
      return false;
    }
    try {
      const model = await this.collabLlm.createChatModel({
        companyId,
        agentId: ceoId,
        fallbackModelName: modelName,
        llmTimeoutMs: this.config.getCollabIntentLlmTimeoutMs(),
        maxOutputTokens: 128,
        taskPriority: 'high',
        ceoContext: 'strategy',
        trace: {
          callsite: 'collaboration_mode_proposal:ceo_arbitrate',
        },
        meteringAgentId: ceoId,
      });
      let timer: ReturnType<typeof setTimeout> | null = null;
      const res = await Promise.race([
        model.invoke([
          new SystemMessage(
            'You are the CEO. An agent proposed changing collaboration mode. Reply JSON only: {"approve":true|false}',
          ),
          new HumanMessage(`targetMode=${targetMode}\nreason=${reason.slice(0, 1500)}`),
        ]),
        new Promise<never>((_, reject) => {
          const hardTimeoutMs = Math.max(2500, this.config.getCollabIntentLlmTimeoutMs() + 1000);
          timer = setTimeout(
            () => reject(new Error(`mode_proposal.ceo_arbitrate hard timeout after ${hardTimeoutMs}ms`)),
            hardTimeoutMs,
          );
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });
      const raw =
        typeof res.content === 'string'
          ? res.content
          : Array.isArray(res.content)
            ? res.content.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join('')
            : String(res.content);
      const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim()) as {
        approve?: boolean;
      };
      return parsed.approve === true;
    } catch (e: unknown) {
      this.logger.warn('CEO arbitrate LLM failed; default reject', {
        message: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }
}
