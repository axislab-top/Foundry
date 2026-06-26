import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { metrics } from '@opentelemetry/api';
import { firstValueFrom, timeout } from 'rxjs';
import type { CollaborationIntentDecisionV20261, IntentDecision, IntentRoutePath } from '@contracts/types';
import { buildCollaborationIntentDecisionV20261 } from '../intent/intent-unified-mapping.js';
import {
  NextStep,
  type LightStructuredOutputV2,
} from '@foundry/contracts/types/collaboration';
import { ConfigService } from '../../../common/config/config.service.js';
import { DirectCollabReplyService } from '../direct-collab-reply.service.js';
import { wantsAudienceDirectHandoff } from '../intent/intent-audience.util.js';
import { MainRoomDirectorIntentValidationService } from '../intent/main-room-director-intent-validation.service.js';
import { SummonTargetResolverService } from '../intent/summon-target-resolver.service.js';
import { shouldSuppressMainRoomDirectTargetsForCompanyOrgListing } from '../intent/main-room-company-department-listing-query.util.js';
import { MemoryCrossCutService } from '../memory/memory-cross-cut.service.js';
import { isDirectSingleAgentHandover } from '../router/autonomous-intent-route.util.js';
import type {
  IntentDecision as CollaborationIntentDecision2026,
  RoomContext,
} from '../contracts/collaboration-2026.contracts.js';
import type { CollaborationPipelineV2Service } from './collaboration-pipeline-v2.service.js';
import type { CollaborationMainRoomFlowService } from './main-room-flow.service.js';
import {
  lazyCollaborationMainRoomFlowService,
  lazyCollaborationPipelineV2Service,
} from './pipeline-v2.forward-ref.js';
import { logSwallowedSideEffect } from './pipeline-side-effect.util.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
  MainRoomLeadMemoryContext,
  RunMainRoomPostIntentRouteParams,
} from './collaboration-pipeline-v2.types.js';
import { resolveAuthorizedHeavyExecution } from '../replay/main-room-replay-authorization.util.js';
import { CollaborationProgramClientService } from '../program/collaboration-program-client.service.js';
import { classifyProgramTurn, shouldBlockExplicitDirectedForProgramTurn } from '../program/program-turn.classifier.js';

/** Pipeline V2：主群 Intent Layer 入口与 unified/legacy 映射。 */
@Injectable()
export class CollaborationMainRoomIntentService {
  private readonly logger = new Logger(CollaborationMainRoomIntentService.name);
  private readonly routeCounter = metrics
    .getMeter('foundry.collaboration')
    .createCounter('foundry.collaboration.route_path.total');
  private readonly summonExplicitDirectHit = metrics
    .getMeter('foundry.collaboration')
    .createCounter('foundry.collaboration.summon.explicit_direct_hit');
  private readonly summonMissingFromRoom = metrics
    .getMeter('foundry.collaboration')
    .createCounter('foundry.collaboration.summon.missing_from_room');

  constructor(
    private readonly config: ConfigService,
    private readonly memoryCrossCutService: MemoryCrossCutService,
    private readonly summonTargetResolver: SummonTargetResolverService,
    private readonly mainRoomDirectorIntentValidation: MainRoomDirectorIntentValidationService,
    private readonly directReply: DirectCollabReplyService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    @Inject(forwardRef(lazyCollaborationMainRoomFlowService))
    private readonly flow: CollaborationMainRoomFlowService,
    @Inject(forwardRef(lazyCollaborationPipelineV2Service))
    private readonly pipeline: CollaborationPipelineV2Service,
    private readonly programClient: CollaborationProgramClientService,
  ) {}

  /**
   * 主群程序化入口（`pipeline.run`、审批恢复等）与 MQ listener 共用 {@link CollaborationMainRoomFlowService.runMainRoomFlow}。
   */
  async runMainRoomPipelineViaIntentLayer(
    inputParam: CollaborationPipelineV2RunInput,
    roomContext: RoomContext,
    _traceId: string,
  ): Promise<CollaborationPipelineV2RunResult> {
    return this.flow.runMainRoomFlow({ input: inputParam, roomContext });
  }

  buildLegacyIntentDecisionFromUnifiedPipeline(params: {
    input: CollaborationPipelineV2RunInput;
    layerDecision: CollaborationIntentDecision2026;
    unified: CollaborationIntentDecisionV20261;
    flags: { authorizedHeavyExecution: boolean };
    directSummonAgentIds?: string[];
  }): IntentDecision {
    const { input, layerDecision, unified, flags, directSummonAgentIds } = params;
    const directIds = (directSummonAgentIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean)
      .slice(0, this.config.getCollabMainRoomMaxDirectTargets());

    let targetMode: IntentDecision['targetMode'];
    let targetType: IntentDecision['targetType'];
    let targetIds: string[] = [];

    if (directIds.length > 0) {
      targetMode = directIds.length > 1 ? 'multi_agent' : 'single_agent';
      targetType = 'agent';
      targetIds = directIds;
    } else {
      targetMode = 'ceo_layer';
      targetType = 'system';
    }

    const rawLayer = layerDecision.targetLayer;
    const legacyTargetLayer: IntentDecision['targetLayer'] =
      rawLayer === 'strategy' || rawLayer === 'orchestration' || rawLayer === 'supervision'
        ? rawLayer
        : rawLayer === 'director'
          ? 'orchestration'
          : null;
    return {
      schemaVersion: '1.0',
      intentType: layerDecision.intentType as unknown as IntentDecision['intentType'],
      targetMode,
      targetType,
      targetIds,
      targetLayer: legacyTargetLayer,
      confidence: layerDecision.confidence,
      messageCategory: (input.messageCategory as IntentDecision['messageCategory']) ?? 'chat',
      responseMode: layerDecision.routingHints.responseMode as IntentDecision['responseMode'],
      shouldReply: true,
      shouldExecute: layerDecision.routingHints.shouldExecute,
      routingHints: {
        suggestedDepartments: unified.routingHints.suggestedDepartmentSlugs,
        requiresParallelism: unified.routingHints.requiresParallelism,
        riskLevel: unified.routingHints.riskLevel as IntentDecision['routingHints']['riskLevel'],
      },
      explanation: unified.explanation,
      traceId: unified.traceId,
      roomId: input.roomId,
      requestedBy: input.humanSenderId ?? 'human',
      classifierSource: 'llm',
      llmUsed: true,
      metadata: {
        ...(directIds.length > 0 ? { resolvedTargetAgentIds: directIds } : {}),
        intentDecision2026_1: unified as unknown as Record<string, unknown>,
        intentLayer: layerDecision as unknown as Record<string, unknown>,
        classifier: 'intent_layer_unified_v2026_1',
        authorizedHeavyExecution: flags.authorizedHeavyExecution,
      },
    };
  }

  finalizeMainRoomIntentLayerState(
    layerFromAudience: CollaborationIntentDecision2026,
    input: CollaborationPipelineV2RunInput,
  ): RunMainRoomPostIntentRouteParams['mergedMainRoom'] {
    const authorizedHeavyExecution = resolveAuthorizedHeavyExecution({
      contentText: input.contentText,
      confirmationIntent: input.confirmationIntent,
      userConfirmedExecution: input.userConfirmedExecution,
      userConfirmedDispatchFlush: input.userConfirmedDispatchFlush,
      messageCategory: input.messageCategory,
    });
    return {
      layerDecision: layerFromAudience,
      authorizedHeavyExecution,
      routeIntentType: layerFromAudience.intentType,
      replayInvokeExecutionLayers: false,
      replayHeavyPipelineAckText: undefined,
    };
  }

  buildDepartmentRoomDirectorStubLayerDecision(params: {
    roomContext: RoomContext;
    traceId: string;
    directorAgentId: string;
  }): CollaborationIntentDecision2026 {
    const directorId = String(params.directorAgentId ?? '').trim();
    return {
      traceId: params.traceId,
      roomType: params.roomContext.roomType,
      intentType: 'unknown',
      confidence: 1,
      explanation: 'department_room_no_audience_intent',
      routingHints: {
        riskLevel: 'low',
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'direct_reply',
        ...(directorId ? { targetAgentIds: [directorId], explicitDirectTargets: true as const } : {}),
      },
      targetDepartmentSlugs: [],
      targetLayer: 'director',
      metadata: {
        source: 'department_director_stub',
        noAudienceIntentLayer: true,
      },
    };
  }

  buildUnifiedIntentFromLayer(
    layerDecision: CollaborationIntentDecision2026,
    input: CollaborationPipelineV2RunInput,
    traceIdHint: string,
  ): CollaborationIntentDecisionV20261 {
    const rh = layerDecision.routingHints;
    const hasValidDirectAgentTargets =
      rh.explicitDirectTargets === true && (rh.targetAgentIds?.length ?? 0) > 0;
    return buildCollaborationIntentDecisionV20261({
      traceId: layerDecision.traceId || traceIdHint,
      roomId: input.roomId,
      audienceConfidence: layerDecision.confidence,
      layer: {
        intentType: layerDecision.intentType,
        confidence: layerDecision.confidence,
        explanation: layerDecision.explanation,
        routingHints: { ...rh },
        targetDepartmentSlugs: layerDecision.targetDepartmentSlugs,
        ...(rh.targetAgentIds !== undefined ? { targetAgentIds: rh.targetAgentIds } : {}),
        ...(rh.explicitDirectTargets !== undefined ? { explicitDirectTargets: rh.explicitDirectTargets } : {}),
        ...(rh.summonAgentsMissingFromRoom !== undefined
          ? { summonAgentsMissingFromRoom: rh.summonAgentsMissingFromRoom }
          : {}),
        ...(layerDecision.userFacingReply ? { userFacingReply: layerDecision.userFacingReply } : {}),
        ...(layerDecision.mainRoomAudienceHandoff
          ? { mainRoomAudienceHandoff: layerDecision.mainRoomAudienceHandoff }
          : {}),
        ...(layerDecision.directorResolution ? { directorResolution: layerDecision.directorResolution } : {}),
        ...(layerDecision.intentSelfReply ? { intentSelfReply: layerDecision.intentSelfReply } : {}),
      },
      hasValidDirectAgentTargets,
    });
  }

  async applyMainRoomIntentSummonEnrichAndDirectorValidation(params: {
    companyId: string;
    roomContext: RoomContext;
    layerDecision: CollaborationIntentDecision2026;
    input: CollaborationPipelineV2RunInput;
    memoryContext: MainRoomLeadMemoryContext;
  }): Promise<void> {
    if (params.roomContext.roomType !== 'main') return;
    await this.summonTargetResolver.enrichLayerDecisionForSummonTargets({
      companyId: params.companyId,
      userText: params.input.contentText,
      roomContext: params.roomContext,
      layerDecision: params.layerDecision,
      ceoAgentId: params.input.ceoAgentId,
    });
    await this.mainRoomDirectorIntentValidation.applyMainRoomDirectorValidation({
      companyId: params.companyId,
      roomContext: params.roomContext,
      layerDecision: params.layerDecision,
      ceoAgentId: params.input.ceoAgentId,
      mentionedAgentIds: params.input.mentionedAgentIds,
      memoryHits: params.memoryContext.memoryHits,
      userText: params.input.contentText,
    });

    if (
      shouldSuppressMainRoomDirectTargetsForCompanyOrgListing({
        userText: params.input.contentText,
        roomContext: params.roomContext,
        mentionedAgentIds: params.input.mentionedAgentIds,
        ceoAgentId: params.input.ceoAgentId,
      })
    ) {
      const rh = params.layerDecision.routingHints;
      if (rh.explicitDirectTargets === true && (rh.targetAgentIds?.length ?? 0) > 0) {
        this.logger.log('foundry.collaboration.main_room.suppress_direct_org_listing_after_enrich', {
          companyId: params.companyId,
          roomId: params.roomContext.roomId,
          traceId: params.layerDecision.traceId,
          priorTargetAgentIds: rh.targetAgentIds,
        });
        delete rh.targetAgentIds;
        rh.explicitDirectTargets = false;
        params.layerDecision.directorResolution = {
          status: 'none',
          chosenAgentIds: [],
          candidateIdsBeforeFilter: [],
        };
        delete params.layerDecision.mainRoomAudienceHandoff;
        delete params.layerDecision.userFacingReply;
      }
    }
  }

  async executeMainRoomExplicitDirectedPath(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: CollaborationIntentDecisionV20261;
    traceId: string;
    authorizedHeavyExecution: boolean;
  }): Promise<CollaborationPipelineV2RunResult> {
    const { input, roomContext, intentDecision2026, intentDecision2026_1, traceId, authorizedHeavyExecution } =
      params;

    if (this.config.isCollabProgramSsotEnabled() && !this.config.isCollabTurnToolOrchestrationEnabled()) {
      const activeProgram = await this.programClient.getActive({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: input.threadId,
      });
      const turn = classifyProgramTurn({
        userText: input.contentText,
        confirmationIntent: input.confirmationIntent,
        userConfirmedExecution: input.userConfirmedExecution,
        userConfirmedDispatchFlush: input.userConfirmedDispatchFlush,
        activeProgram,
        mentionedAgentIds: input.mentionedAgentIds,
      });
      if (shouldBlockExplicitDirectedForProgramTurn(turn)) {
        this.logger.log('main_room_program.block_explicit_directed', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          turn,
        });
        return {
          intentContract: 'unified_intent_v2026_1',
          routePath: 'supervision',
          intentDecision: this.buildLegacyIntentDecisionFromUnifiedPipeline({
            input,
            layerDecision: intentDecision2026,
            unified: intentDecision2026_1,
            flags: { authorizedHeavyExecution },
          }),
          intentDecision2026_1,
          handledByV2: true,
          output: {
            status: 'ok',
            message: 'Explicit directed blocked by program SSOT',
            payload: { programTurn: turn, collaborationProgram: activeProgram },
          },
        };
      }
    }

    const missingForJoin = intentDecision2026.routingHints.summonAgentsMissingFromRoom ?? [];
    if (missingForJoin.length > 0) {
      await this.maybeAutoJoinSummonAgentsToMainRoom({
        companyId: input.companyId,
        roomId: input.roomId,
        missingAgentIds: missingForJoin,
        traceId,
        messageId: input.messageId,
      });
    }
    const directIds = (intentDecision2026.routingHints.targetAgentIds ?? []).slice(
      0,
      this.config.getCollabMainRoomMaxDirectTargets(),
    );
    const routePath: IntentRoutePath = directIds.length > 1 ? 'direct_group' : 'direct_agent';
    this.summonExplicitDirectHit.add(1, { routePath });

    const requestedRoles = this.pipeline.extractRequestedRoles(input.contentText);
    const fastSingleAgentHandover =
      this.config.isDirectAgentFastHandoverEnabled() &&
      directIds.length === 1 &&
      isDirectSingleAgentHandover({
        requestedRoles,
        confidence: intentDecision2026.confidence,
      });

    if (fastSingleAgentHandover && input.ceoAgentId && directIds[0]) {
      void this.memoryCrossCutService
        .persistCeoObservedDirectAgentHandover({
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          traceId,
          ceoAgentId: input.ceoAgentId,
          targetAgentId: directIds[0],
          userText: input.contentText,
          roomType: roomContext.roomType,
          heartbeatCorrelation: input.heartbeatCorrelation,
        })
        .catch((err) =>
          logSwallowedSideEffect(this.logger, 'foundry.collaboration.memory.ceo_handover_persist_failed', {
            companyId: input.companyId,
            roomId: input.roomId,
            messageId: input.messageId,
          }, err),
        );
    }

    if (
      !fastSingleAgentHandover &&
      (intentDecision2026.routingHints.summonAgentsMissingFromRoom?.length ?? 0) > 0 &&
      input.ceoAgentId
    ) {
      await this.appendCeoProvisionalSummonNotice({
        companyId: input.companyId,
        roomId: input.roomId,
        ceoAgentId: input.ceoAgentId,
        threadId: input.threadId ?? null,
        missingAgentIds: intentDecision2026.routingHints.summonAgentsMissingFromRoom ?? [],
        traceId,
        sourceMessageId: input.messageId,
      });
    }

    const drPartial = intentDecision2026.directorResolution;
    const partialGroupCeoPreamble =
      drPartial?.partialGroupMatch === true && wantsAudienceDirectHandoff(intentDecision2026);
    const partialNoticeText = partialGroupCeoPreamble
      ? String(
          intentDecision2026_1.userFacingReply?.text ?? intentDecision2026.userFacingReply?.text ?? '',
        ).trim()
      : '';
    if (partialGroupCeoPreamble && input.ceoAgentId) {
      if (!partialNoticeText) {
        this.logger.warn('main_room.direct_partial_group_missing_user_facing', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          traceId,
          droppedCandidateIds: drPartial?.droppedCandidateIds ?? [],
        });
      } else {
        const ceoPartialOutput: LightStructuredOutputV2 = {
          version: 'v2',
          nextStep: NextStep.STRUCTURED_REPLY,
          finalText: partialNoticeText.slice(0, 8000),
          commitmentText: input.contentText.slice(0, 400),
          suggestedTasks: [],
          memoryReferences: [],
          metadata: {
            pipeline: 'v2',
            routePath,
            targetMode: directIds.length > 1 ? 'multi_agent' : 'single_agent',
            fastReplySource: 'main_room_direct_group_partial_ceo_notice',
          },
        };
        await this.directReply.reply({
          companyId: input.companyId,
          roomId: input.roomId,
          agentId: input.ceoAgentId,
          sourceMessageId: input.messageId,
          threadId: input.threadId ?? null,
          output: ceoPartialOutput,
          intentDecision2026_1,
          heartbeatCorrelation: input.heartbeatCorrelation,
        });
      }
    }

    const legacyIntent = this.buildLegacyIntentDecisionFromUnifiedPipeline({
      input,
      layerDecision: intentDecision2026,
      unified: intentDecision2026_1,
      flags: { authorizedHeavyExecution },
      directSummonAgentIds: directIds,
    });

    this.routeCounter.add(1, { routePath, roomType: roomContext.roomType });
    this.logger.log('pipeline_v2_route_decided', {
      event: 'foundry.ceo.v2.enabled',
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      routePath,
      intentType: intentDecision2026.intentType,
      confidence: intentDecision2026.confidence,
      classifier: 'intent_layer_explicit_summon_main_room',
      intentDecision2026_1,
      explicitDirectTargets: true,
      targetAgentIds: directIds,
      isSummonIntent: true,
      fastSingleAgentHandover,
    });

    return await this.pipeline.handleDirectedReplyPath(legacyIntent, input, {
      intentDecision2026_1,
      fastSingleAgentHandover,
    });
  }

  private workerActor() {
    return {
      id: process.env.WORKER_ACTOR_USER_ID ?? '00000000-0000-0000-0000-000000000000',
      roles: ['admin'] as string[],
    };
  }

  private async maybeAutoJoinSummonAgentsToMainRoom(params: {
    companyId: string;
    roomId: string;
    missingAgentIds: string[];
    traceId: string;
    messageId: string;
  }): Promise<void> {
    if (!this.config.getCollabSummonAutoJoinMain()) return;
    const ids = params.missingAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean).slice(0, 8);
    if (ids.length === 0) return;
    try {
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.members.add', {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
            members: ids.map((memberId) => ({ memberType: 'agent' as const, memberId })),
          })
          .pipe(timeout({ first: 12_000 })),
      );
      this.logger.log('foundry.collaboration.summon_auto_join_main_room_ok', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        traceId: params.traceId,
        memberIds: ids,
      });
    } catch (error) {
      this.logger.warn('foundry.collaboration.summon_auto_join_main_room_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        traceId: params.traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private buildSummonMissingMembersNoticeContent(mentionLabel: string): string {
    const tpl = this.config.getCollabSummonMissingMembersNoticeTemplate();
    const fallback = '正在协调「{mentionLabel}」加入本群，请稍候…群内同事会先直接回复你。';
    const t = tpl.length > 0 ? tpl : fallback;
    return t.replaceAll('{mentionLabel}', mentionLabel);
  }

  private async appendCeoProvisionalSummonNotice(params: {
    companyId: string;
    roomId: string;
    ceoAgentId: string;
    threadId: string | null;
    missingAgentIds: string[];
    traceId: string;
    sourceMessageId: string;
  }): Promise<void> {
    const ids = params.missingAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean).slice(0, 8);
    if (ids.length > 0) {
      this.summonMissingFromRoom.add(1);
    }
    const mentionLabel = ids.length ? ids.join('、') : '相关同事';
    const content = this.buildSummonMissingMembersNoticeContent(mentionLabel);

    try {
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.messages.appendAgent', {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
            agentId: params.ceoAgentId,
            content,
            messageType: 'stream_chunk',
            threadId: params.threadId ?? undefined,
            metadata: {
              provisional: true,
              summonInviteNotice: true,
              missingAgentIds: ids,
              traceId: params.traceId,
              directReplyToMessageId: params.sourceMessageId,
            },
          })
          .pipe(timeout({ first: 3_500 })),
      );
    } catch (error) {
      this.logger.warn('foundry.collaboration.summon_provisional_notice_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.sourceMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
