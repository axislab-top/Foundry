import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { metrics } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import type { CollaborationAgentPeerSummonRequestedEvent } from '@contracts/events';
import type { IntentDecision } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import { CollaborationPipelineV2Service } from '../pipeline-v2/collaboration-pipeline-v2.service.js';
import type { CollaborationPipelineV2RunInput } from '../pipeline-v2/collaboration-pipeline-v2.types.js';
import { RoomContextService } from '../context/room-context.service.js';
import {
  AgentsActiveDirectoryCacheService,
  type AgentDirectorySlice,
} from '../context/agents-active-directory-cache.service.js';
import { buildMainRoomDirectorAgentWhitelist } from '../intent/main-room-director-whitelist.util.js';
import { CeoSequentialPeerIntroSessionService } from '../replay/ceo-sequential-peer-intro-session.service.js';
import { CeoSequentialPeerIntroContinuationService } from '../replay/ceo-sequential-peer-intro-continuation.service.js';

const PEER_SUMMON_DEDUPE_TTL_MS = 10 * 60 * 1000;

const peerSummonMeter = metrics.getMeter('foundry.collaboration');
const peerSummonRequestedCounter = peerSummonMeter.createCounter(
  'foundry.collaboration.agent_peer_summon.requested_total',
  { description: 'Agent peer summon events handled by worker' },
);
const peerSummonReplyCompletedCounter = peerSummonMeter.createCounter(
  'foundry.collaboration.agent_peer_summon.reply_completed_total',
  { description: 'Agent peer summon directed replies completed' },
);
const peerSummonSkippedCounter = peerSummonMeter.createCounter(
  'foundry.collaboration.agent_peer_summon.skipped_total',
  { description: 'Agent peer summon skipped with reason label' },
);

@Injectable()
export class AgentPeerSummonService {
  private readonly logger = new Logger(AgentPeerSummonService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
    private readonly roomContextService: RoomContextService,
    private readonly agentsDirectory: AgentsActiveDirectoryCacheService,
    private readonly pipeline: CollaborationPipelineV2Service,
    private readonly sequentialIntroSession: CeoSequentialPeerIntroSessionService,
    private readonly sequentialIntroContinuation: CeoSequentialPeerIntroContinuationService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  async handleRequested(event: CollaborationAgentPeerSummonRequestedEvent): Promise<void> {
    const data = event.data;
    const companyId = String(data?.companyId ?? event.companyId ?? '').trim();
    const roomId = String(data?.roomId ?? '').trim();
    const sourceMessageId = String(data?.sourceMessageId ?? event.aggregateId ?? '').trim();
    const senderAgentId = String(data?.senderAgentId ?? '').trim();
    const targetAgentId = String(data?.targetAgentId ?? '').trim();
    const traceId = String(data?.traceId ?? sourceMessageId).trim() || randomUUID();

    peerSummonRequestedCounter.add(1);

    if (!this.config.isCollabAgentPeerSummonEnabled()) {
      this.skip('disabled', { companyId, roomId, sourceMessageId });
      return;
    }

    if (!companyId || !roomId || !sourceMessageId || !senderAgentId || !targetAgentId) {
      this.skip('invalid_payload', { companyId, roomId, sourceMessageId });
      return;
    }

    if (senderAgentId === targetAgentId) {
      this.skip('self_summon', { companyId, roomId, sourceMessageId, senderAgentId });
      return;
    }

    const maxPerEvent = this.config.getCollabAgentPeerSummonMaxPerEvent();
    const targets = (data.summonTargetAgentIds ?? [targetAgentId])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean)
      .slice(0, maxPerEvent);
    if (!targets.includes(targetAgentId)) {
      targets.unshift(targetAgentId);
    }
    const uniqueTargets = Array.from(new Set(targets)).slice(0, maxPerEvent);

    const pfx = this.config.getRedisKeyPrefix();
    const dedupeKey = `${pfx}peer_summon:worker:${companyId}:${sourceMessageId}:${targetAgentId}`;
    const acquired = await this.redisCache.setNxPx(dedupeKey, '1', PEER_SUMMON_DEDUPE_TTL_MS);
    if (!acquired) {
      this.skip('dedupe', { companyId, roomId, sourceMessageId, targetAgentId });
      return;
    }

    const roomContext = await this.roomContextService.buildRoomContext({ companyId, roomId });
    if (roomContext.roomType !== 'main') {
      this.skip('not_main_room', { companyId, roomId, sourceMessageId });
      return;
    }

    let roster: AgentDirectorySlice[] = [];
    try {
      roster = await this.agentsDirectory.getActiveAgents(companyId, this.workerActor());
    } catch {
      roster = [];
    }

    const directorWhitelist = buildMainRoomDirectorAgentWhitelist(roomContext, roster);
    const roomAgentIds = new Set(
      (roomContext.memberDirectory ?? [])
        .filter((m) => m.memberType === 'agent')
        .map((m) => String(m.memberId).trim())
        .filter(Boolean),
    );

    const allowedTargets = uniqueTargets.filter((agentId) => {
      if (directorWhitelist.has(agentId)) return true;
      return roomAgentIds.has(agentId);
    });

    if (allowedTargets.length === 0) {
      this.skip('target_not_allowed', { companyId, roomId, sourceMessageId, targetAgentId });
      return;
    }

    const ceoAgentId = await this.resolveCeoAgentId(companyId);
    const contentText = String(data.contentPreview ?? '').trim() || '请接话。';

    const isCeoSummon = Boolean(ceoAgentId && senderAgentId === ceoAgentId);
    if (isCeoSummon) {
      await this.sequentialIntroSession.recordDirectorSummoned(companyId, roomId, targetAgentId);
    }

    const intentDecision: IntentDecision = {
      schemaVersion: '1.0',
      intentType: 'direct_summon',
      targetMode: 'ceo_layer',
      targetType: 'agent',
      targetIds: allowedTargets,
      targetLayer: 'orchestration',
      confidence: 1,
      messageCategory: 'coordination',
      responseMode: 'direct_reply',
      shouldReply: true,
      shouldExecute: false,
      routingHints: {
        suggestedDepartments: [],
        requiresParallelism: false,
        riskLevel: 'low',
      },
      explanation: 'agent_peer_summon_tool',
      traceId,
      roomId,
      requestedBy: senderAgentId,
      classifierSource: 'rule',
      llmUsed: false,
      evidence: {},
      metadata: {
        resolvedTargetAgentIds: allowedTargets,
        summonProvenance: 'agent_peer_summon_tool',
      },
    };

    const input: CollaborationPipelineV2RunInput = {
      companyId,
      roomId,
      messageId: sourceMessageId,
      runId: traceId,
      contentText,
      senderType: 'agent',
      messageSource: 'agent_peer_summon',
      threadId: data.threadId ?? null,
      mentionedAgentIds: allowedTargets,
      messageCategory: 'coordination',
      ceoAgentId,
      humanSenderId: null,
      forcedMode: null,
      messageMetadata: {
        source: 'agent_peer_summon_tool',
        summonTargetAgentIds: allowedTargets,
        senderAgentId,
      },
    };

    const result = await this.pipeline.handleDirectedReplyPath(intentDecision, input);
    const responderIds = Array.isArray(result.output?.payload?.responderAgentIds)
      ? (result.output.payload.responderAgentIds as string[])
      : [];
    if (responderIds.length > 0) {
      peerSummonReplyCompletedCounter.add(responderIds.length);
    }

    this.logger.log('foundry.collaboration.agent_peer_summon.handled', {
      companyId,
      roomId,
      sourceMessageId,
      senderAgentId,
      targetAgentIds: allowedTargets,
      responderAgentIds: responderIds,
      traceId,
    });

    if (isCeoSummon && responderIds.length > 0 && ceoAgentId) {
      const chain = await this.sequentialIntroContinuation.continueViaCeoToolPath({
        companyId,
        roomId,
        threadId: data.threadId ?? null,
        completedDirectorAgentId: targetAgentId,
        anchorMessageId: sourceMessageId,
        traceId,
        ceoAgentId,
      });
      if (chain.continued) {
        this.logger.log('foundry.collaboration.agent_peer_summon.chain_continued', {
          companyId,
          roomId,
          completedDirectorAgentId: targetAgentId,
          toolNames: chain.toolNames,
          traceId,
        });
      }
    }
  }

  private skip(reason: string, ctx: Record<string, unknown>): void {
    peerSummonSkippedCounter.add(1, { reason });
    this.logger.log('foundry.collaboration.agent_peer_summon.skipped', { reason, ...ctx });
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async resolveCeoAgentId(companyId: string): Promise<string | null> {
    const res = await firstValueFrom(
      this.apiRpc
        .send<{ items?: Array<{ id?: string }> }>('agents.findAll', {
          companyId,
          actor: this.workerActor(),
          role: 'ceo',
          status: 'active',
          page: 1,
          pageSize: 1,
        })
        .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    ).catch(() => ({ items: [] }));
    return res.items?.[0]?.id?.trim() ?? null;
  }
}
