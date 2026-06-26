import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api';
import type { CollaborationHeartbeatCorrelationPayload } from '@contracts/events';
import { buildCollaborationIntentDecisionV20261 } from '../intent/intent-unified-mapping.js';
import {
  NextStep,
  type LightStructuredOutputV2,
} from '@foundry/contracts/types/collaboration';
import { ConfigService } from '../../../common/config/config.service.js';
import { DirectCollabReplyService } from '../direct-collab-reply.service.js';
import { IntentLayerService } from '../intent/intent-layer.service.js';
import { ContextGroundingPlannerService } from '../context/context-grounding-planner.service.js';
import { MainRoomAudienceRoutingContextService } from '../intent/main-room-audience-routing-context.service.js';
import { MemoryCrossCutService } from '../memory/memory-cross-cut.service.js';
import { CollaborationSessionLeaseService } from '../session/collaboration-session-lease.service.js';
import { MainRoomReplayLlmContextService } from '../main-room-replay-llm-context.service.js';
import { CeoNaturalReplyGeneratorService } from '../ceo-natural-reply-generator.service.js';
import { MainRoomReplayExecutionDelegateService } from '../main-room-replay-execution-delegate.service.js';
import { MainRoomCeoGroundingService } from '../main-room-ceo-grounding.service.js';
import { MainRoomStrategyDraftSessionService } from '../main-room-strategy-draft-session.service.js';
// Removed: MainRoomDispatchPlanSessionService (deleted)
import { MainRoomCeoAlignmentSessionService } from '../main-room-ceo-alignment-session.service.js';
import { MainRoomReplayMetadataService } from '../replay/main-room-replay-metadata.service.js';
import { MainRoomReplaySsotPublisherService } from '../replay/main-room-replay-ssot-publisher.service.js';
import { CollaborationRoomModeSyncService } from '../collaboration-room-mode-sync.service.js';
import { L1FeatureFlagService } from '../l1/l1-feature-flag.service.js';
import { ReplayExecutionDelegateError } from '../main-room-replay-delegate-errors.js';
import type { MainRoomHeavyPipelineKind } from './main-room-heavy-pipeline-entry.util.js';
import type {
  IntentDecision as CollaborationIntentDecision2026,
  RoomContext,
} from '../contracts/collaboration-2026.contracts.js';
import { buildOrgSnapshotPromptBlock } from '../context/room-context.service.js';
import { planIncludesBlock } from '../context/context-grounding-plan.js';
import { ensureCollaborationExecutionContext } from './ensure-collaboration-execution-context.util.js';
import { logSwallowedSideEffect } from './pipeline-side-effect.util.js';
import { MAIN_ROOM_REPLY_BEFORE_HEAVY_MODE_CONTEXT } from './main-room-reply-before-heavy.util.js';
// Removed: routeMainRoomAfterIntent (deleted module)
import { runMainRoomPostIntentRouteCore } from './main-room-post-intent-route.util.js';
import { MainRoomProgramOrchestrator } from '../program/main-room-program.orchestrator.js';
import { CollaborationTurnService } from '../turn/collaboration-turn.service.js';
import { resolveMainRoomRoute, type MainRoomRoute } from './resolve-main-room-route.util.js';
import {
  buildDeferHeavyPipelineRunResult,
  MAIN_ROOM_REPLY_BEFORE_HEAVY_FAST_REPLY_SOURCE,
} from './main-room-reply-before-heavy.util.js';
import { resolveEarlyThinkingFromRoute } from './responder-thinking.util.js';
import { shouldPreferProgramOrchestrationBeforeTurn } from './main-room-program-route.util.js';
import type { CollaborationPipelineV2Service } from './collaboration-pipeline-v2.service.js';
import type { CollaborationMainRoomIntentService } from './main-room-intent.service.js';
import type { CollaborationMainRoomOrchestrationService } from './main-room-orchestration.service.js';
import type { CollaborationMainRoomReplayService } from './main-room-replay.service.js';
import {
  lazyCollaborationMainRoomIntentService,
  lazyCollaborationMainRoomOrchestrationService,
  lazyCollaborationMainRoomReplayService,
  lazyCollaborationPipelineV2Service,
} from './pipeline-v2.forward-ref.js';
import { MainRoomOrchestrationPauseService } from '../orchestration/main-room-orchestration-pause.service.js';
import { CollaborationProgramClientService } from '../program/collaboration-program-client.service.js';
import { CollaborationProgramLifecycleService } from '../program/collaboration-program-lifecycle.service.js';
import { CeoSequentialPeerIntroSessionService } from '../replay/ceo-sequential-peer-intro-session.service.js';
import { isOrchestrationPauseSignal } from '../replay/user-proceed-intent.util.js';
import { AgentToolLoopService } from '../agent-tool-loop.service.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
  MainRoomLeadMemoryContext,
  RunMainRoomFlowParams,
  RunMainRoomPostIntentRouteParams,
} from './collaboration-pipeline-v2.types.js';

/** Pipeline V2 拆分：主群重链路（Intent 后导向 / Strategy / Orchestration 入口）。 */
@Injectable()
export class CollaborationMainRoomFlowService {
  private readonly logger = new Logger(CollaborationMainRoomFlowService.name);
  private readonly tracer = trace.getTracer('foundry.collaboration.pipeline-v2');
  private readonly meter = metrics.getMeter('foundry.collaboration');
  private readonly mainFlowLatency = this.meter.createHistogram('foundry.collaboration.main_flow.latency_ms');
  private readonly routeCounter = this.meter.createCounter('foundry.collaboration.route_path.total');
  private readonly intentConfidence = this.meter.createHistogram('foundry.collaboration.intent.confidence');

  constructor(
    private readonly config: ConfigService,
    private readonly intentLayerService: IntentLayerService,
    private readonly contextGroundingPlannerService: ContextGroundingPlannerService,
    private readonly memoryCrossCutService: MemoryCrossCutService,
    private readonly sessionLease: CollaborationSessionLeaseService,
    private readonly directReply: DirectCollabReplyService,
    private readonly mainRoomReplayLlmContext: MainRoomReplayLlmContextService,
    private readonly l1FeatureFlags: L1FeatureFlagService,
    private readonly ceoNaturalReplyGenerator: CeoNaturalReplyGeneratorService,
    private readonly mainRoomReplayExecutionDelegate: MainRoomReplayExecutionDelegateService,
    private readonly mainRoomCeoGrounding: MainRoomCeoGroundingService,
    private readonly mainRoomStrategyDraftSession: MainRoomStrategyDraftSessionService,
    private readonly mainRoomCeoAlignmentSession: MainRoomCeoAlignmentSessionService,
    private readonly replayMetadata: MainRoomReplayMetadataService,
    private readonly replaySsotPublisher: MainRoomReplaySsotPublisherService,
    private readonly roomModeSync: CollaborationRoomModeSyncService,
    private readonly mainRoomAudienceRoutingContext: MainRoomAudienceRoutingContextService,
    @Inject(forwardRef(lazyCollaborationMainRoomReplayService))
    private readonly replay: CollaborationMainRoomReplayService,
    @Inject(forwardRef(lazyCollaborationPipelineV2Service))
    private readonly pipeline: CollaborationPipelineV2Service,
    @Inject(forwardRef(lazyCollaborationMainRoomIntentService))
    private readonly intent: CollaborationMainRoomIntentService,
    @Inject(forwardRef(lazyCollaborationMainRoomOrchestrationService))
    private readonly orchestration: CollaborationMainRoomOrchestrationService,
    private readonly programOrchestrator: MainRoomProgramOrchestrator,
    private readonly collaborationTurn: CollaborationTurnService,
    private readonly orchestrationPause: MainRoomOrchestrationPauseService,
    private readonly programClient: CollaborationProgramClientService,
    private readonly programLifecycle: CollaborationProgramLifecycleService,
    private readonly sequentialPeerIntroSession: CeoSequentialPeerIntroSessionService,
    private readonly agentToolLoop: AgentToolLoopService,
  ) {}

  /**
   * 主群 Strategy（L1）输入：`runMainRoomFlow` 与 `handleL1Path` 共用，避免双入口上下文漂移。
   */
  async buildMainRoomStrategyPlanningUserContent(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    traceId: string;
    memoryContext: MainRoomLeadMemoryContext;
    roomMemberPromptBlock: string;
    includeReplayDraftBlock: boolean;
  }): Promise<string> {
    const { input, roomContext, traceId, memoryContext, roomMemberPromptBlock, includeReplayDraftBlock } = params;
    const enrichedText = memoryContext.promptContext
      ? `${input.contentText}\n\n${memoryContext.promptContext}`.slice(0, 4500)
      : input.contentText;
    const ceoPostIntentKnowledgePack = await this.pipeline.buildPostIntentCeoKnowledgePack({
      input,
      roomContext,
      roomMemberPromptBlock,
      traceId,
    });
    const draftPack = await this.mainRoomStrategyDraftSession.getDraft({
      companyId: input.companyId,
      roomId: input.roomId,
      threadId: input.threadId,
    });
    const draftBlock =
      includeReplayDraftBlock && draftPack?.draftGoalSummary
        ? `\n\n【与 CEO replay 往复对齐后的目标摘要】\n${draftPack.draftGoalSummary.slice(0, 4000)}`
        : '';
    return `${enrichedText}${draftBlock}\n\n${ceoPostIntentKnowledgePack}`.slice(0, 14_000);
  }

  /**
   * 主群受众路由 LLM 调用前的统一组装；实现见 {@link MainRoomAudienceRoutingContextService}。
   */
  prepareMainRoomAudienceRoutingRecognizeContext(
    params: Parameters<MainRoomAudienceRoutingContextService['prepareMainRoomAudienceRoutingRecognizeContext']>[0],
  ): ReturnType<MainRoomAudienceRoutingContextService['prepareMainRoomAudienceRoutingRecognizeContext']> {
    return this.mainRoomAudienceRoutingContext.prepareMainRoomAudienceRoutingRecognizeContext(params);
  }

  /**
   * CEO v2 intent-gate quick reply.
   *
   * Used by non-collaboration entrypoints (e.g. autonomous breakdown) to emit
   * a minimal structured reply without invoking the full L2/L3 pipeline.
   */
  async fastReply(params: {
    companyId: string;
    roomId: string;
    ceoAgentId: string;
    sourceMessageId: string;
    threadId?: string | null;
    userGoal: string;
    traceId?: string | null;
    reason?: string;
    heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
  }): Promise<void> {
    const goal = String(params.userGoal ?? '').trim();
    if (!goal) return;

    const finalText =
      `我已收到你的目标：${goal}\n\n` +
      `刚才自动拆解链路遇到波动，我会继续尝试推进；如果你希望我先给出一个精简版本，请回复“先给简版计划”。`;

    const output: LightStructuredOutputV2 = {
      version: 'v2',
      nextStep: NextStep.STRUCTURED_REPLY,
      finalText,
      commitmentText: goal,
      suggestedTasks: [],
      memoryReferences: [],
      metadata: {
        pipeline: 'v2',
        fastPath: true,
        reason: params.reason ?? 'plan_failure_fallback',
        traceId: params.traceId ?? undefined,
      },
    };

    await this.directReply.reply({
      companyId: params.companyId,
      roomId: params.roomId,
      agentId: params.ceoAgentId,
      sourceMessageId: params.sourceMessageId,
      threadId: params.threadId ?? null,
      output,
      ...(params.heartbeatCorrelation ? { heartbeatCorrelation: params.heartbeatCorrelation } : {}),
    });
  }

  /** 阶段 4.2：老板暂停/撤回进行中编排（优先于 IntentLayer，避免多余 LLM 回合）。 */
  private async tryHandleOrchestrationPauseEarly(params: {
    input: CollaborationPipelineV2RunInput;
    traceId: string;
  }): Promise<CollaborationPipelineV2RunResult | null> {
    const { input, traceId } = params;
    if (
      !isOrchestrationPauseSignal({
        confirmationIntent: input.confirmationIntent,
        userText: input.contentText,
      })
    ) {
      return null;
    }

    const outcome = await this.orchestrationPause.pauseActiveOrchestration({
      companyId: input.companyId,
      roomId: input.roomId,
      threadId: input.threadId,
      messageId: input.messageId,
      traceId,
      userText: input.contentText,
      confirmationIntent: input.confirmationIntent,
    });
    if (!outcome.attempted) return null;

    const finalText = outcome.ok
      ? outcome.revoke
        ? '已撤回当前编排，各部门将不再领取新子任务；如需重新推进请直接说明新目标。'
        : '已暂停当前编排，各部门将不再领取新子任务；恢复后可继续说明目标。'
      : '当前没有进行中的编排可暂停。';

    const ceoId = String(input.ceoAgentId ?? '').trim();
    if (ceoId) {
      const output: LightStructuredOutputV2 = {
        version: 'v2',
        nextStep: NextStep.STRUCTURED_REPLY,
        finalText,
        commitmentText: input.contentText.slice(0, 400),
        suggestedTasks: [],
        memoryReferences: [],
        metadata: {
          pipeline: 'v2',
          routePath: 'orchestration_paused',
          kind: 'orchestration_paused',
          orchestrationPaused: outcome.ok,
          orchestrationRevoked: outcome.revoke,
          mainGoalTaskId: outcome.mainGoalTaskId ?? null,
        },
      };
      await this.directReply.reply({
        companyId: input.companyId,
        roomId: input.roomId,
        agentId: ceoId,
        sourceMessageId: input.messageId,
        threadId: input.threadId ?? null,
        output,
        ...(input.heartbeatCorrelation ? { heartbeatCorrelation: input.heartbeatCorrelation } : {}),
      });
    }

    const unified = buildCollaborationIntentDecisionV20261({
      traceId,
      roomId: input.roomId,
      audienceConfidence: 0.95,
      layer: {
        intentType: 'unknown',
        confidence: 0.95,
        explanation: 'orchestration_pause_command',
        routingHints: {
          riskLevel: 'low',
          requiresParallelism: false,
          shouldExecute: false,
        },
        targetDepartmentSlugs: [],
      },
      hasValidDirectAgentTargets: false,
    });

    return {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'orchestration_paused',
      intentDecision: {
        schemaVersion: '1.0',
        intentType: 'unknown',
        targetMode: 'execution_pipeline',
        targetType: 'system',
        targetLayer: 'supervision',
        targetIds: [],
        confidence: 0.95,
        shouldReply: true,
        shouldExecute: false,
        messageCategory: 'chat',
        responseMode: 'direct_reply',
        routingHints: {
          suggestedDepartments: [],
          requiresParallelism: false,
          riskLevel: 'low',
        },
        traceId,
        classifierSource: 'rule',
        llmUsed: false,
        explanation: 'orchestration_pause_command',
        roomId: input.roomId,
        requestedBy: input.humanSenderId ?? 'human',
      },
      intentDecision2026_1: unified,
      handledByV2: true,
      output: {
        status: 'ok',
        message: outcome.ok ? 'orchestration_paused' : 'orchestration_pause_no_active_run',
        payload: {
          orchestrationPaused: outcome.ok,
          orchestrationRevoked: outcome.revoke,
          mainGoalTaskId: outcome.mainGoalTaskId ?? null,
        },
      },
    };
  }

  /**
   * 2026 main-room chain（Dispatch Plan v2 唯一通道）：
   * IntentLayer → post-intent 导向（房内直连 **或** Intent→replay）→ Dispatch Plan compile/flush → 部门自主执行 → 事件驱动结案摘要
   *
   * This method is used by the listener for roomType=main.
   * @mention 仅作为 IntentLayer 信号（conversationSignals）；强定向直连仍由 LLM+置信度+房内 roster 交集判定。
   */
  async runMainRoomFlow(params: RunMainRoomFlowParams): Promise<CollaborationPipelineV2RunResult> {
    return await this.tracer.startActiveSpan('foundry.collaboration.main_room_flow', async (span): Promise<CollaborationPipelineV2RunResult> => {
      const startedAt = Date.now();
      if (params.roomContext.roomType !== 'main') {
        throw new Error('run_main_room_flow_only_supports_main_room');
      }
      const input: CollaborationPipelineV2RunInput = {
        ...params.input,
        orgSnapshotPromptBlock:
          String(params.input.orgSnapshotPromptBlock ?? '').trim() ||
          buildOrgSnapshotPromptBlock(params.roomContext.orgSnapshot.departments),
      };
      let heavyLeaseHeld = false;
      try {
        const traceId = String(input.executionTokenId ?? input.messageId).trim();
        if (this.config.isCollabProgramLegacyRouterFallbackEnabled()) {
          this.logger.warn('foundry.collaboration.legacy_router_fallback_enabled', {
            companyId: input.companyId,
            roomId: input.roomId,
            messageId: input.messageId,
            traceId,
            hint: 'COLLAB_PROGRAM_LEGACY_ROUTER_FALLBACK 计划下线',
          });
        }
        if (input.heartbeatCorrelation?.heartbeatRunId) {
          span.setAttribute('foundry.heartbeat_run_id', input.heartbeatCorrelation.heartbeatRunId);
          span.setAttribute('foundry.heartbeat_run_kind', input.heartbeatCorrelation.runKind ?? '');
        }

        const pauseEarly = await this.tryHandleOrchestrationPauseEarly({
          input,
          traceId,
        });
        if (pauseEarly) {
          return pauseEarly;
        }

        const routingCtx = await this.prepareMainRoomAudienceRoutingRecognizeContext({
          input,
          roomContext: params.roomContext,
          traceId,
        });
        const { memoryContext, followupHintLine, roomMemberPromptBlock } = routingCtx;

        ensureCollaborationExecutionContext(input, traceId);

        const [intentLayerRaw, contextGroundingPlan] = await Promise.all([
          this.intentLayerService.recognizeIntent({
            companyId: input.companyId,
            roomContext: params.roomContext,
            contentText: routingCtx.audienceRoutingTurnText,
            originalContentText: input.contentText,
            messageId: input.messageId,
            threadId: input.threadId ?? null,
            traceId,
            mentionedAgentIds: input.mentionedAgentIds ?? [],
            mentionedNodeIds: input.mentionedNodeIds ?? [],
            ceoAgentId: input.ceoAgentId,
            recentTranscriptDigest: routingCtx.recentTranscriptDigest,
            audienceRoutingRecentTurnFacts: routingCtx.audienceRoutingRecentTurnFacts,
            audienceRoutingMemoryDigest: routingCtx.audienceRoutingMemoryDigest,
          }),
          this.contextGroundingPlannerService.planGrounding({
            companyId: input.companyId,
            roomContext: params.roomContext,
            contentText: routingCtx.audienceRoutingTurnText,
            messageId: input.messageId,
            threadId: input.threadId ?? null,
            traceId,
            ceoAgentId: input.ceoAgentId,
            messageCategory: input.messageCategory ?? null,
            recentTranscriptDigest: routingCtx.recentTranscriptDigest,
            audienceRoutingRecentTurnFacts: routingCtx.audienceRoutingRecentTurnFacts,
            audienceRoutingMemoryDigest: routingCtx.audienceRoutingMemoryDigest,
          }),
        ]);
        if (!input.collaborationExecutionContext) {
          throw new Error('collaborationExecutionContext missing after ensureCollaborationExecutionContext');
        }
        input.collaborationExecutionContext.contextGroundingPlan = contextGroundingPlan;
        span.setAttribute('foundry.context.grounding.blocks', contextGroundingPlan.prefetchBlocks.join(','));
        const mergedMainRoomFlow = this.intent.finalizeMainRoomIntentLayerState(intentLayerRaw, input);
        await this.intent.applyMainRoomIntentSummonEnrichAndDirectorValidation({
          companyId: input.companyId,
          roomContext: params.roomContext,
          layerDecision: mergedMainRoomFlow.layerDecision,
          input,
          memoryContext,
        });
        const intentDecision2026 = mergedMainRoomFlow.layerDecision;
        const intentDecision2026_1 = this.intent.buildUnifiedIntentFromLayer(intentDecision2026, input, traceId);

        this.logger.log('foundry.collaboration.main_room.intent_decision_2026_1', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          traceId: intentDecision2026_1.traceId,
          intentType: intentDecision2026_1.intentType,
          confidence: intentDecision2026_1.confidence,
          decisionIntentType: intentDecision2026_1.intentType,
          decisionConfidence: intentDecision2026_1.confidence,
          classifier: 'intent_layer_main_room_flow',
        });

        this.intentConfidence.record(intentDecision2026.confidence, {
          roomType: params.roomContext.roomType,
          intentType: intentDecision2026.intentType,
        });

        void this.memoryCrossCutService
          .persistAfterIntentClassified({
            companyId: input.companyId,
            roomId: input.roomId,
            messageId: input.messageId,
            traceId,
            intentType: intentDecision2026.intentType,
            confidence: intentDecision2026.confidence,
            roomType: params.roomContext.roomType,
            heartbeatCorrelation: input.heartbeatCorrelation,
          })
          .catch((err) =>
            logSwallowedSideEffect(this.logger, 'foundry.collaboration.memory.intent_classified_persist_failed', {
              companyId: input.companyId,
              roomId: input.roomId,
              messageId: input.messageId,
              traceId,
            }, err),
          );

        const turnToolOrchestrationEnabled = this.config.isCollabTurnToolOrchestrationEnabled();
        const legacyRouterFallback =
          this.config.isCollabProgramLegacyRouterFallbackEnabled() || !turnToolOrchestrationEnabled;

        if (legacyRouterFallback) {
          this.logger.warn('COLLAB_PROGRAM_LEGACY_ROUTER_FALLBACK is deprecated and will be removed next sprint', {
            companyId: input.companyId,
            roomId: input.roomId,
          });
        }

        if (turnToolOrchestrationEnabled) {
          const dispatchPlanSession = null; // STUB: dispatch plan session service removed
          const earlyRoute = resolveMainRoomRoute({
            dispatchPlanV2Enabled: true,
            dispatchPlanSession,
            userText: input.contentText,
            layerDecision: intentDecision2026,
            intentDecision2026_1,
            ceoAgentId: input.ceoAgentId,
            mentionedAgentIds: input.mentionedAgentIds,
            collaborationMode: params.roomContext.collaborationMode ?? null,
            confirmationIntent: input.confirmationIntent,
            userConfirmedDispatchFlush: input.userConfirmedDispatchFlush,
            maxDirect: this.config.getCollabMainRoomMaxDirectTargets(),
          });

          // [阶段0.1] 主群链路追踪：前置路由决策（turn-tool 编排路径）。
          // 与 listener 的 `foundry.collaboration.main_room.turn_outcome` 按 traceId 联查成完整决策链。
          this.logger.log('foundry.collaboration.main_room.route_decision', {
            companyId: input.companyId,
            roomId: input.roomId,
            messageId: input.messageId,
            traceId,
            runId: input.runId ?? null,
            intentType: intentDecision2026.intentType,
            confidence: intentDecision2026.confidence,
            routeKind: earlyRoute.kind,
            routeEntry: earlyRoute.kind === 'ceo_replay_delegate' ? earlyRoute.entry : null,
            heavyKind:
              earlyRoute.kind === 'dispatch_plan_heavy'
                ? earlyRoute.heavyKind
                : null,
            summonTargetCount: (intentDecision2026.routingHints.targetAgentIds ?? []).length,
            explicitDirectTargets: intentDecision2026.routingHints.explicitDirectTargets === true,
            turnToolOrchestrationEnabled,
            dispatchPlanV2Enabled: true,
            collaborationMode: params.roomContext.collaborationMode ?? null,
          });

          // [阶段1.1] 接话人确定、生成开始之前即通知 listener 发"正在思考"。
          // 解决主群最常见的「CEO 直连/内联回复」场景：此前 thinking 在 flow 返回后才发，
          // 而生成+流式发生在 flow 内部，导致气泡不出现或滞后于流式文本。
          if (params.onResponderThinking) {
            const earlyThinking = resolveEarlyThinkingFromRoute({
              routeKind: earlyRoute.kind,
              ceoAgentId: input.ceoAgentId,
              directTargetIds: intentDecision2026.routingHints.targetAgentIds ?? [],
            });
            if (earlyThinking.agentIds.length > 0) {
              params.onResponderThinking({
                agentIds: earlyThinking.agentIds,
                ceoLayer: earlyThinking.ceoLayer,
                routePath: earlyRoute.kind,
                intentType: intentDecision2026.intentType,
              });
            }
          }

          if (earlyRoute.kind === 'explicit_directed') {
            span.setStatus({ code: SpanStatusCode.OK });
            return await this.intent.executeMainRoomExplicitDirectedPath({
              input,
              roomContext: params.roomContext,
              intentDecision2026,
              intentDecision2026_1,
              traceId,
              authorizedHeavyExecution: mergedMainRoomFlow.authorizedHeavyExecution,
            });
          }

          if (earlyRoute.kind === 'dispatch_plan_heavy') {
            span.setStatus({ code: SpanStatusCode.OK });
            return await this.executeEarlyDispatchPlanHeavyRoute({
              earlyRoute,
              input,
              roomContext: params.roomContext,
              intentDecision2026,
              intentDecision2026_1,
              traceId,
              authorizedHeavyExecution: mergedMainRoomFlow.authorizedHeavyExecution,
            });
          }

          // [阶段 3.1] SSOT 收敛：非 heavy 路由走 post-intent（replay delegate / 未解析 summon），不再默认 turn-tool 旁路。
          if (this.config.isCollabMainRoomRouteSsotConvergedEnabled()) {
            this.logger.log('foundry.collaboration.main_room.route_ssot_converged', {
              companyId: input.companyId,
              roomId: input.roomId,
              messageId: input.messageId,
              traceId,
              routeKind: earlyRoute.kind,
              routeEntry: earlyRoute.kind === 'ceo_replay_delegate' ? earlyRoute.entry : null,
            });
            const ssotPostIntent = await this.runMainRoomPostIntentRoute({
              input,
              roomContext: params.roomContext,
              traceId,
              mergedMainRoom: mergedMainRoomFlow,
              intentDecision2026_1,
              followupHintLine,
              memoryContext,
            });
            if (ssotPostIntent) {
              span.setStatus({ code: SpanStatusCode.OK });
              return ssotPostIntent;
            }
            this.logger.log('foundry.collaboration.main_room.route_ssot_post_intent_miss', {
              companyId: input.companyId,
              roomId: input.roomId,
              messageId: input.messageId,
              traceId,
              routeKind: earlyRoute.kind,
              hint: 'post_intent_returned_null; program/turn_skipped_when_ssot_converged',
            });
          } else {
            const preferProgram =
              this.config.isCollabProgramSsotEnabled() &&
              shouldPreferProgramOrchestrationBeforeTurn({
                contentText: input.contentText,
                messageCategory: input.messageCategory ?? null,
                confirmationIntent: input.confirmationIntent,
                userConfirmedExecution: input.userConfirmedExecution,
                userConfirmedDispatchFlush: input.userConfirmedDispatchFlush,
                collaborationMode: params.roomContext.collaborationMode ?? null,
              });
            if (preferProgram) {
              const programResult = await this.programOrchestrator.run({
                input,
                roomContext: params.roomContext,
                intentDecision2026,
                intentDecision2026_1,
                traceId,
              });
              if (programResult) {
                span.setStatus({ code: SpanStatusCode.OK });
                return programResult;
              }
            }
            this.logger.log('foundry.collaboration.main_room.turn_tool_fallback', {
              companyId: input.companyId,
              roomId: input.roomId,
              messageId: input.messageId,
              traceId,
              routeKind: earlyRoute.kind,
            });
            const turnResult = await this.collaborationTurn.run({
              input,
              roomContext: params.roomContext,
              intentDecision2026,
              intentDecision2026_1,
              traceId,
              memoryContext,
              recentTranscriptDigest: routingCtx.recentTranscriptDigest,
            });
            span.setStatus({ code: SpanStatusCode.OK });
            return turnResult;
          }
        }

        // @deprecated — Legacy 主群路由分支。默认配置下为死代码，将在下个 sprint 物理删除。
        if (legacyRouterFallback) {
          // [阶段 11] legacy / turn-tool 关闭路径：补发 early thinking（此前仅 listener 生成后兜底）。
          if (params.onResponderThinking) {
            const legacyEarlyThinking = resolveEarlyThinkingFromRoute({
              routeKind: 'ceo_replay_delegate',
              ceoAgentId: input.ceoAgentId,
              directTargetIds: intentDecision2026.routingHints.targetAgentIds ?? [],
            });
            if (legacyEarlyThinking.agentIds.length > 0) {
              params.onResponderThinking({
                agentIds: legacyEarlyThinking.agentIds,
                ceoLayer: legacyEarlyThinking.ceoLayer,
                routePath: 'ceo_replay_delegate',
                intentType: intentDecision2026.intentType,
              });
            }
          }
        }

        if (legacyRouterFallback && this.config.isCollabProgramSsotEnabled()) {
          const programResult = await this.programOrchestrator.run({
            input,
            roomContext: params.roomContext,
            intentDecision2026: intentDecision2026,
            intentDecision2026_1,
            traceId,
          });
          if (programResult) {
            span.setStatus({ code: SpanStatusCode.OK });
            return programResult;
          }
        }

        let postIntentShort: CollaborationPipelineV2RunResult | null = null;
        if (legacyRouterFallback) {
          postIntentShort = await this.runMainRoomPostIntentRoute({
            input,
            roomContext: params.roomContext,
            traceId,
            mergedMainRoom: mergedMainRoomFlow,
            intentDecision2026_1,
            followupHintLine,
            memoryContext,
          });
        }
        if (postIntentShort) {
          span.setStatus({ code: SpanStatusCode.OK });
          return postIntentShort;
        }

        const heavyKind = mergedMainRoomFlow.replayHeavyPipelineKind ?? 'full';
        const skipLegacyStrategyAck =
          heavyKind === 'dispatch_plan_compile_and_flush' ||
          heavyKind === 'dispatch_plan_revise' ||
          heavyKind === 'full';
        /** Dispatch Plan v2：跳过 Legacy Strategy 进度文案（避免「战略目标卡片 / 定稿」误导用户）。 */
        if (
          !skipLegacyStrategyAck &&
          mergedMainRoomFlow.replayInvokeExecutionLayers === true &&
          String(input.ceoAgentId ?? '').trim()
        ) {
          await this.replay.postMainRoomReplayHeavyPipelineAck({
            input,
            roomContext: params.roomContext,
            traceId,
            ackText: mergedMainRoomFlow.replayHeavyPipelineAckText ?? undefined,
          });
        }
        if (
          mergedMainRoomFlow.replayInvokeExecutionLayers === true &&
          (heavyKind === 'dispatch_plan_compile_and_flush' || heavyKind === 'dispatch_plan_revise')
        ) {
          await this.sessionLease.touchHeavyCollaborationLease({
            companyId: input.companyId,
            roomId: input.roomId,
            messageId: input.messageId,
            traceId: String(intentDecision2026.traceId ?? traceId).trim(),
          });
          heavyLeaseHeld = true;
          const legacyIntent = this.pipeline.toLegacyIntentDecisionForMainFlow({
            input,
            intentDecision: intentDecision2026,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return await this.orchestration.runMainRoomDispatchPlanPath({
            input,
            roomContext: params.roomContext,
            intentDecision: legacyIntent,
            intentDecision2026,
            intentDecision2026_1,
            traceId,
            autoFlush: heavyKind !== 'dispatch_plan_revise',
          });
        }
        if (
          mergedMainRoomFlow.replayInvokeExecutionLayers === true &&
          heavyKind === 'full'
        ) {
          await this.sessionLease.touchHeavyCollaborationLease({
            companyId: input.companyId,
            roomId: input.roomId,
            messageId: input.messageId,
            traceId: String(intentDecision2026.traceId ?? traceId).trim(),
          });
          heavyLeaseHeld = true;
          const legacyIntent = this.pipeline.toLegacyIntentDecisionForMainFlow({
            input,
            intentDecision: intentDecision2026,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return await this.orchestration.runMainRoomDispatchPlanPath({
            input,
            roomContext: params.roomContext,
            intentDecision: legacyIntent,
            intentDecision2026,
            intentDecision2026_1,
            traceId,
            autoFlush: true,
          });
        }

        if (
          mergedMainRoomFlow.replayInvokeExecutionLayers === true
        ) {
          this.logger.warn('foundry.collaboration.main_room.strategy_bypass_to_dispatch_plan', {
            companyId: input.companyId,
            roomId: input.roomId,
            messageId: input.messageId,
            traceId,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          const legacyIntentDispatch = this.pipeline.toLegacyIntentDecisionForMainFlow({
            input,
            intentDecision: intentDecision2026,
          });
          return await this.orchestration.runMainRoomDispatchPlanPath({
            input,
            roomContext: params.roomContext,
            intentDecision: legacyIntentDispatch,
            intentDecision2026,
            intentDecision2026_1,
            traceId,
            autoFlush: true,
          });
        }

        const strategyContentText = await this.buildMainRoomStrategyPlanningUserContent({
          input,
          roomContext: params.roomContext,
          traceId,
          memoryContext,
          roomMemberPromptBlock,
          includeReplayDraftBlock: false,
        });

        await this.sessionLease.touchHeavyCollaborationLease({
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          traceId: String(intentDecision2026.traceId ?? traceId).trim(),
        });
        heavyLeaseHeld = true;

        void this.replayMetadata
          .patchTriggerPipelineProgress({
            companyId: input.companyId,
            messageId: input.messageId,
            progress: {
              stage: 'orchestration',
              status: 'started',
              correlationId: traceId,
              traceId,
              updatedAt: new Date().toISOString(),
            },
          })
          .catch((e: unknown) => logSwallowedSideEffect(this.logger, 'foundry.collaboration.replay_metadata_patch_failed', {}, e));

        // Legacy strategy path removed — CeoV2PlanningService deleted.
        // Throw to enter catch block which builds a graceful fallback response.
        throw new Error(
          'legacy_strategy_path_removed: CeoV2PlanningService has been deleted. Enable turn-tool orchestration (COLLAB_TURN_TOOL_ORCHESTRATION_ENABLED) to use dispatch-plan v2.',
        );
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
        this.logger.error('pipeline_v2_main_room_flow_failed', error instanceof Error ? error.message : String(error), {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
        });
        if (error instanceof ReplayExecutionDelegateError) {
          span.setStatus({ code: SpanStatusCode.OK });
          return this.replay.buildReplayDelegateErrorRunResult({ input, error });
        }
        const fallbackTrace = String(input.executionTokenId ?? input.messageId).trim();
        const fallbackUnified = buildCollaborationIntentDecisionV20261({
          traceId: fallbackTrace,
          roomId: input.roomId,
          audienceConfidence: 0.2,
          layer: {
            intentType: 'unknown',
            confidence: 0.2,
            explanation: 'main_room_flow_exception_fallback',
            routingHints: {
              riskLevel: 'medium',
              requiresParallelism: false,
              shouldExecute: true,
            },
            targetDepartmentSlugs: [],
          },
          hasValidDirectAgentTargets: false,
        });
        return {
          intentContract: 'unified_intent_v2026_1',
          routePath: 'supervision' as const,
          intentDecision: {
            schemaVersion: '1.0',
            intentType: 'unknown',
            targetMode: 'execution_pipeline',
            targetType: 'system',
            targetLayer: 'supervision',
            targetIds: [],
            confidence: 0.2,
            shouldReply: true,
            shouldExecute: true,
            messageCategory: 'chat',
            responseMode: 'execute_then_reply',
            routingHints: {
              suggestedDepartments: [],
              requiresParallelism: false,
              riskLevel: 'medium',
            },
            explanation: 'main_room_flow_exception_fallback',
            traceId: input.executionTokenId ?? input.messageId,
            roomId: input.roomId,
            requestedBy: input.humanSenderId ?? 'human',
            classifierSource: 'fallback',
            llmUsed: false,
            metadata: {
              routePath: 'supervision',
              source: 'main_room_flow_exception',
              intentDecision2026_1: fallbackUnified,
            },
          },
          intentDecision2026_1: fallbackUnified,
          handledByV2: true,
          output: {
            status: 'ok',
            message: 'Main-room chain degraded to fallback response.',
            payload: {
              fastFinalText: '主群执行链路出现波动，已进入降级处理并将继续推进。',
              fastReplySource: 'main_room_flow_fallback',
              intentDecision2026_1: fallbackUnified,
            },
          },
        };
      } finally {
        if (heavyLeaseHeld) {
          void this.sessionLease.clearHeavyCollaborationLease(input.companyId, input.messageId);
        }
        this.mainFlowLatency.record(Date.now() - startedAt, { roomType: params.roomContext.roomType });
        span.end();
      }
    });
  }

  /**
   * 主群 `runMainRoomFlow` / `runMainRoomPipelineViaIntentLayer` 共用的 Intent 后导向。
   * CEO 直接对用户承接：**仅**经 `runMainRoomCeoReplayDelegatePhase`（单次 replay LLM）；Intent 已定向房内主管时走直连，不经此相位。
   */
  async runMainRoomPostIntentRoute(
    params: RunMainRoomPostIntentRouteParams,
  ): Promise<CollaborationPipelineV2RunResult | null> {
    // ── Phase 1: Agent Tool Loop 快速路径 ──────────────────────────────────
    // 当启用 agent_tool_loop 时，跳过整个 replay delegate → authorization → dispatch 流程，
    // 直接让 Agent 通过工具循环完成任务并回复。
    if (this.config.isCollabAgentToolLoopEnabled()) {
      const agentId = params.input.ceoAgentId;
      if (agentId) {
        const toolLoopResult = await this.agentToolLoop.runAndReply({
          companyId: params.input.companyId,
          roomId: params.input.roomId,
          agentId,
          sourceMessageId: params.input.messageId,
          threadId: params.input.threadId ?? null,
          userText: params.input.contentText,
          humanSenderId: params.input.humanSenderId ?? null,
          ceoAgentId: params.input.ceoAgentId ?? null,
          traceId: params.traceId,
          orgSnapshotPromptBlock: params.input.orgSnapshotPromptBlock ?? null,
          roomMemberPromptBlock: params.input.roomMemberPromptBlock ?? null,
        });
        if (toolLoopResult) {
          this.logger.log('foundry.collaboration.main_room.agent_tool_loop_success', {
            companyId: params.input.companyId,
            roomId: params.input.roomId,
            messageId: params.input.messageId,
            traceId: params.traceId,
          });
          return {
            intentContract: 'unified_intent_v2026_1',
            routePath: 'collaboration_turn',
            intentDecision: {
              schemaVersion: '1.0',
              intentType: 'ceo_reply',
              targetMode: 'execution_pipeline',
              targetType: 'agent',
              targetLayer: 'orchestration',
              targetIds: [agentId],
              confidence: 1.0,
              shouldReply: true,
              shouldExecute: true,
              messageCategory: 'chat',
              responseMode: 'direct_reply',
              routingHints: { suggestedDepartments: [], requiresParallelism: false, riskLevel: 'low' },
              traceId: params.traceId,
              classifierSource: 'rule',
              llmUsed: false,
              explanation: 'agent_tool_loop_direct_execution',
              roomId: params.input.roomId,
              requestedBy: params.input.humanSenderId ?? 'human',
            },
            intentDecision2026_1: params.intentDecision2026_1,
            handledByV2: true,
            output: {
              status: 'ok',
              message: 'agent_tool_loop_completed',
              payload: { inlineReplyHandled: true, roomWriteHandled: true },
            },
          };
        }
        // 如果 agent tool loop 失败，回退到原有流程
        this.logger.warn('foundry.collaboration.main_room.agent_tool_loop_fallback', {
          companyId: params.input.companyId,
          roomId: params.input.roomId,
          messageId: params.input.messageId,
          traceId: params.traceId,
        });
      }
    }
    // ── Phase 1 结束 ────────────────────────────────────────────────────────

    const intentDecision2026 = params.mergedMainRoom.layerDecision;
    const replayFactLayerMode = this.config.getCeoReplayFactLayerMode();
    let groundingPlan = params.input.collaborationExecutionContext?.contextGroundingPlan ?? null;
    const ecxRef = () => params.input.collaborationExecutionContext;

    const core = await runMainRoomPostIntentRouteCore(
      {
        dispatchPlanV2Enabled: () => true,
        getDispatchPlanSession: (p) =>
          null, // STUB: dispatch plan session service removed
        getMaxDirectTargets: () => this.config.getCollabMainRoomMaxDirectTargets(),
        isCeoReplayCollaborationEffective: () =>
          this.l1FeatureFlags.isCeoReplayCollaborationEffective(
            params.input.companyId,
            params.input.clientFeatureFlags,
          ),
        onReplayDisabled: async () => {
          this.logger.log('foundry.collaboration.replay.disabled_skip_delegate', {
            companyId: params.input.companyId,
            roomId: params.input.roomId,
            messageId: params.input.messageId,
            traceId: params.traceId,
          });
          const surface =
            String(params.intentDecision2026_1.userFacingReply?.text ?? '').trim() ||
            String(intentDecision2026.userFacingReply?.text ?? '').trim() ||
            String(intentDecision2026.explanation ?? '').trim() ||
            '当前环境或公司已关闭 CEO Replay；如需战略目标与执行计划，请使用任务发布或联系管理员开启 Replay。';
          return this.replay.executeMainRoomReplayUserFacingCopy({
            input: params.input,
            roomContext: params.roomContext,
            intentDecision2026,
            intentDecision2026_1: params.intentDecision2026_1,
            traceId: params.traceId,
            authorizedHeavyExecution: params.mergedMainRoom.authorizedHeavyExecution,
            finalText: surface.slice(0, 8000),
            fastReplySource: 'main_room_replay_disabled_company_fallback',
          });
        },
        assembleReplayLlmContextPack: async () => {
          groundingPlan = ecxRef()?.contextGroundingPlan ?? null;
          return this.mainRoomReplayLlmContext.assemblePack({
            companyId: params.input.companyId,
            roomId: params.input.roomId,
            threadId: params.input.threadId ?? null,
            userText: params.input.contentText,
            memoryContext: params.memoryContext,
            traceId: params.traceId,
            messageId: params.input.messageId,
            ceoAgentId: params.input.ceoAgentId,
            humanSenderId: params.input.humanSenderId ?? null,
            factLayerMode: replayFactLayerMode,
            plan: groundingPlan,
          });
        },
        routeMainRoomAfterIntent: (_paramsWithPack, _postIntentRouteStartedAt, _route) => {
          throw new Error('Not implemented: routeMainRoomAfterIntent deleted');
        },
      },
      params,
    );
    return core.result;
  }

  /**
   * 部门群：不经主群受众 Intent；确定性 stub + Director 模型 + `DirectCollabReplyService`。
   */
  async runDepartmentRoomDirectorModelReply(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    directorAgentId: string;
    traceId: string;
    /** 部门群真回复路径：忽略 COLLAB_DEPT_DIRECTOR_MODEL_ENABLED 门控 */
    forceModelPath?: boolean;
  }): Promise<{ handled: boolean; directorAgentId?: string; reason?: string }> {
    if (!params.forceModelPath && !this.config.getCollabDeptDirectorModelEnabled()) {
      return { handled: false, reason: 'dept_director_model_disabled' };
    }
    const { input, roomContext, directorAgentId, traceId } = params;
    if (roomContext.roomType !== 'department') {
      return { handled: false, reason: 'room_not_department' };
    }

    const layerDecision = this.intent.buildDepartmentRoomDirectorStubLayerDecision({
      roomContext,
      traceId,
      directorAgentId,
    });
    const merged = this.intent.finalizeMainRoomIntentLayerState(layerDecision, input);
    const unified = this.intent.buildUnifiedIntentFromLayer(merged.layerDecision, input, traceId);
    const legacyIntent = this.intent.buildLegacyIntentDecisionFromUnifiedPipeline({
      input,
      layerDecision: merged.layerDecision,
      unified,
      flags: { authorizedHeavyExecution: merged.authorizedHeavyExecution },
      directSummonAgentIds: [directorAgentId],
    });
    legacyIntent.classifierSource = 'llm';
    legacyIntent.llmUsed = true;
    if (legacyIntent.metadata && typeof legacyIntent.metadata === 'object') {
      legacyIntent.metadata = {
        ...legacyIntent.metadata,
        classifier: 'department_director_model',
        noAudienceIntentLayer: true,
      };
    }
    const generated = await this.pipeline.generateDirectedAgentReply(directorAgentId, legacyIntent, input, unified);
    if (!String(generated?.text ?? '').trim()) {
      return { handled: false, directorAgentId, reason: 'model_empty' };
    }
    const output: LightStructuredOutputV2 = {
      version: 'v2',
      nextStep: NextStep.STRUCTURED_REPLY,
      finalText: generated.text,
      commitmentText: input.contentText.slice(0, 400),
      suggestedTasks: [],
      memoryReferences: [],
      metadata: {
        pipeline: 'v2',
        routePath: 'direct_agent',
        targetMode: legacyIntent.targetMode,
        targetLayer: legacyIntent.targetLayer ?? undefined,
      },
    };
    await this.directReply.reply({
      companyId: input.companyId,
      roomId: input.roomId,
      agentId: directorAgentId,
      sourceMessageId: input.messageId,
      threadId: input.threadId ?? null,
      output,
      generation: generated,
      roomType: 'department',
      intentDecision2026_1: unified,
    });
    return { handled: true, directorAgentId };
  }

  private async postReplyBeforeHeavyUserFacingCopy(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: import('@contracts/types').CollaborationIntentDecisionV20261;
    traceId: string;
    text: string;
    authorizedHeavyExecution: boolean;
  }): Promise<void> {
    const text = String(params.text ?? '').trim();
    if (!text || !String(params.input.ceoAgentId ?? '').trim()) return;
    await this.replay.executeMainRoomReplayUserFacingCopy({
      input: params.input,
      roomContext: params.roomContext,
      intentDecision2026: params.intentDecision2026,
      intentDecision2026_1: params.intentDecision2026_1,
      traceId: params.traceId,
      authorizedHeavyExecution: params.authorizedHeavyExecution,
      finalText: text.slice(0, 8000),
      fastReplySource: MAIN_ROOM_REPLY_BEFORE_HEAVY_FAST_REPLY_SOURCE,
    });
  }

  private buildDeferHeavyRunResult(params: {
    input: CollaborationPipelineV2RunInput;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: import('@contracts/types').CollaborationIntentDecisionV20261;
    traceId: string;
    heavyKind: MainRoomHeavyPipelineKind;
    ackText?: string | null;
    authorizedHeavyExecution: boolean;
  }): CollaborationPipelineV2RunResult {
    const legacyIntent = this.pipeline.toLegacyIntentDecisionForMainFlow({
      input: params.input,
      intentDecision: params.intentDecision2026,
    });
    const result = buildDeferHeavyPipelineRunResult({
      legacyIntent,
      intentDecision2026_1: params.intentDecision2026_1,
      heavyKind: params.heavyKind,
      traceId: params.traceId,
      ackText: params.ackText,
    });
    const payload =
      result.output?.payload && typeof result.output.payload === 'object'
        ? (result.output.payload as Record<string, unknown>)
        : {};
    return {
      ...result,
      output: {
        ...result.output,
        payload: {
          ...payload,
          deferHeavyIntentDecision2026: params.intentDecision2026,
        },
      },
    };
  }

  private async executeEarlyDispatchPlanHeavyRoute(params: {
    earlyRoute: Extract<MainRoomRoute, { kind: 'dispatch_plan_heavy' }>;
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: import('@contracts/types').CollaborationIntentDecisionV20261;
    traceId: string;
    authorizedHeavyExecution: boolean;
  }): Promise<CollaborationPipelineV2RunResult> {
    if (this.config.isCollabMainRoomReplyBeforeHeavyEnabled()) {
      await this.postReplyBeforeHeavyUserFacingCopy({
        input: params.input,
        roomContext: params.roomContext,
        intentDecision2026: params.intentDecision2026,
        intentDecision2026_1: params.intentDecision2026_1,
        traceId: params.traceId,
        text: params.earlyRoute.ackText,
        authorizedHeavyExecution: params.authorizedHeavyExecution,
      });
      return this.buildDeferHeavyRunResult({
        input: params.input,
        intentDecision2026: params.intentDecision2026,
        intentDecision2026_1: params.intentDecision2026_1,
        traceId: params.traceId,
        heavyKind: params.earlyRoute.heavyKind,
        ackText: params.earlyRoute.ackText,
        authorizedHeavyExecution: params.authorizedHeavyExecution,
      });
    }

    await this.sessionLease.touchHeavyCollaborationLease({
      companyId: params.input.companyId,
      roomId: params.input.roomId,
      messageId: params.input.messageId,
      traceId: String(params.intentDecision2026.traceId ?? params.traceId).trim(),
    });
    const legacyIntent = this.pipeline.toLegacyIntentDecisionForMainFlow({
      input: params.input,
      intentDecision: params.intentDecision2026,
    });
    return await this.orchestration.runMainRoomDispatchPlanPath({
      input: params.input,
      roomContext: params.roomContext,
      intentDecision: legacyIntent,
      intentDecision2026: params.intentDecision2026,
      intentDecision2026_1: params.intentDecision2026_1,
      traceId: params.traceId,
      autoFlush: params.earlyRoute.heavyKind !== 'dispatch_plan_revise',
    });
  }

  /**
   * [阶段 2.2] listener 在即时接话返回后异步调度重编排（dispatch plan / goal lock heavy）。
   */
  async runDeferredHeavyPipeline(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    traceId: string;
    heavyKind: MainRoomHeavyPipelineKind;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: import('@contracts/types').CollaborationIntentDecisionV20261;
    memoryContext?: MainRoomLeadMemoryContext;
  }): Promise<CollaborationPipelineV2RunResult> {
    const { input, roomContext, traceId, heavyKind } = params;
    if (
      await this.orchestrationPause.isPaused({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: input.threadId,
      })
    ) {
      this.logger.log('foundry.collaboration.main_room.deferred_heavy_skipped_paused', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        traceId,
        heavyKind,
      });
      const unified = buildCollaborationIntentDecisionV20261({
        traceId,
        roomId: input.roomId,
        audienceConfidence: 0.9,
        layer: {
          intentType: 'unknown',
          confidence: 0.9,
          explanation: 'deferred_heavy_skipped_orchestration_paused',
          routingHints: {
            riskLevel: 'low',
            requiresParallelism: false,
            shouldExecute: false,
          },
          targetDepartmentSlugs: [],
        },
        hasValidDirectAgentTargets: false,
      });
      return {
        intentContract: 'unified_intent_v2026_1',
        routePath: 'orchestration_paused',
        intentDecision: params.intentDecision2026 as unknown as import('@contracts/types').IntentDecision,
        intentDecision2026_1: params.intentDecision2026_1,
        handledByV2: true,
        output: {
          status: 'ok',
          message: 'deferred_heavy_skipped_orchestration_paused',
          payload: { heavyKind, orchestrationPaused: true },
        },
      };
    }

    this.logger.log('foundry.collaboration.main_room.deferred_heavy_started', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      traceId,
      heavyKind,
    });

    void this.replayMetadata
      .patchTriggerPipelineProgress({
        companyId: input.companyId,
        messageId: input.messageId,
        progress: {
          stage: heavyKind.includes('dispatch') ? 'dispatch_plan' : 'orchestration',
          status: 'started',
          correlationId: traceId,
          traceId,
          updatedAt: new Date().toISOString(),
        },
      })
      .catch((e: unknown) => logSwallowedSideEffect(this.logger, 'foundry.collaboration.deferred_heavy_metadata_patch_failed', {}, e));

    await this.sessionLease.touchHeavyCollaborationLease({
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      traceId,
    });

    const legacyIntent = this.pipeline.toLegacyIntentDecisionForMainFlow({
      input,
      intentDecision: params.intentDecision2026,
    });

    if (
      heavyKind === 'dispatch_plan_compile_and_flush' ||
      heavyKind === 'dispatch_plan_revise' ||
      heavyKind === 'full'
    ) {
      return await this.orchestration.runMainRoomDispatchPlanPath({
        input,
        roomContext,
        intentDecision: legacyIntent,
        intentDecision2026: params.intentDecision2026,
        intentDecision2026_1: params.intentDecision2026_1,
        traceId,
        autoFlush: heavyKind !== 'dispatch_plan_revise',
      });
    }

    this.logger.warn('foundry.collaboration.main_room.deferred_heavy_unsupported_kind', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      traceId,
      heavyKind,
    });
    return {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'orchestration',
      intentDecision: legacyIntent,
      intentDecision2026_1: params.intentDecision2026_1,
      handledByV2: true,
      output: {
        status: 'ok',
        message: `deferred_heavy_unsupported_kind:${heavyKind}`,
        payload: { heavyKind, traceId, deferredHeavyFailed: true },
      },
    };
  }
}
