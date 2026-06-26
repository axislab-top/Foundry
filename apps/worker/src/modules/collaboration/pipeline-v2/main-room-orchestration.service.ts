import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { createHash } from 'node:crypto';
import { firstValueFrom, timeout } from 'rxjs';
import { metrics } from '@opentelemetry/api';
import type {
  CollaborationIntentDecisionV20261,
  DistributionPlan,
  IntentDecision,
  IntentRoutePath,
  PlanningContractFailure,
  PlanningResult,
} from '@contracts/types';
import {
  NextStep,
  type LightStructuredOutputV2,
  type L1DecisionContext,
} from '@foundry/contracts/types/collaboration';

import { CeoV2OrchestrationService } from '../ceo/v2/ceo-v2-orchestration.service.js';
import { CeoV2PlanningAssignablePoolService } from '../ceo/v2/ceo-v2-planning-assignable-pool.service.js';

import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
  MainRoomLeadMemoryContext,
} from './collaboration-pipeline-v2.types.js';
import { DirectCollabReplyService } from '../direct-collab-reply.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { MemoryCrossCutService } from '../memory/memory-cross-cut.service.js';
import { RlhfSamplerService } from '../rlhf/rlhf-sampler.service.js';
import type {
  IntentDecision as CollaborationIntentDecision2026,
  PlanningResult as CollaborationPlanningResult2026,
  RoomContext,
} from '../contracts/collaboration-2026.contracts.js';
import { buildOrgSnapshotPromptBlock, RoomContextService } from '../context/room-context.service.js';
import { buildMemoryLayerRoomHint } from './memory-layer-room-hint.util.js';

import { MainRoomStrategyDraftSessionService } from '../main-room-strategy-draft-session.service.js';
import { upsertMainRoomOrchestrationLifecycleBestEffort } from '../main-room-orchestration-lifecycle-upsert.util.js';
import { MainRoomDispatchCompensationService } from '../dispatch/main-room-dispatch-compensation.service.js';
import { notifyMainRoomDispatchPartialFailureIfSkipped } from '../dispatch/main-room-dispatch-partial-compensation.util.js';
import { MainRoomOrchestrationPauseService } from '../orchestration/main-room-orchestration-pause.service.js';
import type { MainRoomDispatchSkipRow, MainRoomDispatchFlushResult } from '../main-room-dispatch-skip.types.js';
import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import {
  ceoDecisionInputFromPipelineRun,
  NextStep as CeoDecisionNextStep,
  type CeoDecisionResult,
} from '../ceo/dto/ceo-v2-pipeline.types.js';
import { L1ClassifierCoreService } from '../l1/l1-classifier-core.service.js';
import { L1FeatureFlagService } from '../l1/l1-feature-flag.service.js';
import { L1PostNormalizerService } from '../l1/l1-post-normalizer.service.js';
import type { CollaborationPipelineV2Service } from './collaboration-pipeline-v2.service.js';
import type { CollaborationMainRoomFlowService } from './main-room-flow.service.js';
import type { CollaborationMainRoomIntentService } from './main-room-intent.service.js';
import type { CollaborationMainRoomSupervisionService } from './main-room-supervision.service.js';
import {
  lazyCollaborationMainRoomFlowService,
  lazyCollaborationMainRoomIntentService,
  lazyCollaborationMainRoomSupervisionService,
  lazyCollaborationPipelineV2Service,
} from './pipeline-v2.forward-ref.js';
import { CollaborationMainRoomOrchestrationReplyService } from './main-room-orchestration-reply.service.js';
import { tryUnifiedIntentFromPipelineIntentDecision } from './unified-l1-pipeline.util.js';
import {
  intentHasReplayDelegatedExecution,
  readReplayHeavyPipelineKindFromIntent,
} from './pipeline-v2-replay.util.js';
import { resolvePipelineRoutePath } from './pipeline-v2-route-path.util.js';
import {
  buildCollaborationPlanningResult2026FromCeoV2 as buildPlanningResult2026FromCeoV2,
  buildStrategyContractFailedFastFinalText,
} from './main-room-orchestration-planning.bridge.js';
import {
  to2026DistributionPlan,
  to2026HeavyExecutionOutput,
} from './main-room-orchestration-distribution.bridge.js';

import { isSummonRoutingIntentCeoV2 } from '../intent/intent-summon-routing.util.js';
import {
  MAIN_ROOM_STRATEGY_GOAL_DRAFT_FAST_REPLY,
  type GenerateOrchestrationModelReplyOptions,
} from './pipeline-v2-orchestration.constants.js';
import { CollaborationProgramClientService } from '../program/collaboration-program-client.service.js';
import { CollaborationProgramLifecycleService } from '../program/collaboration-program-lifecycle.service.js';
import { programBriefSummaryLine } from '../turn/collaboration-turn-tool.types.js';

/** Local stub for deleted dispatch-plan-flush-gate.util type */
type EnsureMainGoalFromDispatchPlanResult =
  | { ok: true; mainGoalTaskId: string }
  | { ok: false; reason: string };

/** Pipeline V2 拆分：主群编排 / 派单 / L1 战略链。 */
@Injectable()
export class CollaborationMainRoomOrchestrationService {
  private readonly logger = new Logger(CollaborationMainRoomOrchestrationService.name);
  private readonly meter = metrics.getMeter('foundry.collaboration');
  private readonly routeCounter = this.meter.createCounter('foundry.collaboration.route_path.total');
  private readonly supervisionOutcome = this.meter.createCounter('foundry.collaboration.supervision.outcome_total');
  private readonly partialFeedbackCounter = this.meter.createCounter('foundry.collaboration.supervision.partial_feedback_total');
  private readonly dispatchPlanCounter = this.meter.createCounter('foundry.collaboration.dispatch_plan.total');

  constructor(
    private readonly config: ConfigService,
    private readonly roomContextService: RoomContextService,
    private readonly orchestrationService: CeoV2OrchestrationService,
    private readonly planningAssignablePool: CeoV2PlanningAssignablePoolService,
    private readonly directReply: DirectCollabReplyService,
    private readonly orchestrationReply: CollaborationMainRoomOrchestrationReplyService,
    private readonly memoryCrossCutService: MemoryCrossCutService,
    private readonly rlhfSamplerService: RlhfSamplerService,
    private readonly l1ClassifierCore: L1ClassifierCoreService,
    private readonly l1PostNormalizer: L1PostNormalizerService,
    private readonly l1FeatureFlags: L1FeatureFlagService,
    private readonly mainRoomStrategyDraftSession: MainRoomStrategyDraftSessionService,
    private readonly dispatchCompensation: MainRoomDispatchCompensationService,
    private readonly orchestrationPause: MainRoomOrchestrationPauseService,
    private readonly collabRedis: CollabRedisCacheService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    @Inject(forwardRef(lazyCollaborationPipelineV2Service))
    private readonly pipeline: CollaborationPipelineV2Service,
    @Inject(forwardRef(lazyCollaborationMainRoomSupervisionService))
    private readonly supervision: CollaborationMainRoomSupervisionService,
    @Inject(forwardRef(lazyCollaborationMainRoomIntentService))
    private readonly intent: CollaborationMainRoomIntentService,
    @Inject(forwardRef(lazyCollaborationMainRoomFlowService))
    private readonly flow: CollaborationMainRoomFlowService,
    private readonly programClient: CollaborationProgramClientService,
    private readonly programLifecycle: CollaborationProgramLifecycleService,
  ) {}

  /** `@contracts/types` L1 `PlanningResult` → 主群下游仍消费的 2026 `PlanningResult` 形状。 */
  buildCollaborationPlanningResult2026FromCeoV2(params: {
    ceoV2: PlanningResult;
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
  }): CollaborationPlanningResult2026 {
    return buildPlanningResult2026FromCeoV2(params);
  }

  buildStrategyContractFailedMainRoomResult(params: {
    input: CollaborationPipelineV2RunInput;
    failure: PlanningContractFailure;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: CollaborationIntentDecisionV20261;
  }): CollaborationPipelineV2RunResult {
    const legacyIntent = this.pipeline.toLegacyIntentDecisionForMainFlow({
      input: params.input,
      intentDecision: params.intentDecision2026,
    });
    return {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'strategy_contract_failed',
      intentDecision: legacyIntent,
      intentDecision2026_1: params.intentDecision2026_1,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'Strategy planning contract could not be satisfied.',
        payload: {
          planningContractFailure: params.failure,
          intentDecision2026: params.intentDecision2026,
          intentDecision2026_1: params.intentDecision2026_1,
          fastFinalText: buildStrategyContractFailedFastFinalText(params.failure),
          ceoStructuredContract: '2026.pr4',
          ...(params.failure.contextPackDigest ? { contextPackDigest: params.failure.contextPackDigest } : {}),
        },
      },
    };
  }

  pickOrchestrationReplyOptions(
    intentDecision: IntentDecision,
  ): GenerateOrchestrationModelReplyOptions | undefined {
    return this.orchestrationReply.pickOrchestrationReplyOptions(intentDecision);
  }



  /** 跳过重 L2/L3 分发时的最小闭环分布占位（CEO 客户层快捷路径等复用）。 */
  private buildMinimalClosedLoopDistributionStub(
    planning: PlanningResult,
    input: CollaborationPipelineV2RunInput,
  ): DistributionPlan {
    return {
      schemaVersion: '1.0',
      distributionId: `dist-${planning.planId}-minimal_closed_loop`,
      planId: planning.planId,
      tasks: [],
      parallelism: { maxConcurrentDepartments: 1 },
      fallbackPolicy: { onTimeout: 'partial_merge', onDepartmentFailure: 'retry_then_degrade' },
      traceId: planning.traceId,
      ceoStructuredContract: '2026.pr4',
      metadata: {
        ...(planning.metadata ?? {}),
        orchestration: 'ceo.v2.l2.minimal_closed_loop_stub',
        minimalClosedLoopStub: true,
        roomId: input.roomId,
        childWorkflowPrepared: false,
        childWorkflowDrafts: [],
      },
    };
  }

  /** PR4：审批待决时 CEO 在群内自然口吻说明（无治理前缀；与 post-approval `fastFinalText` 单轨一致）。 */
  buildCeoApprovalPendingFastFinalText(input: {
    goal: string;
    approvalReason?: string;
    riskLabel?: string | null;
  }): string {
    const g = String(input.goal ?? '').trim().slice(0, 280);
    const r = String(input.riskLabel ?? '')
      .trim()
      .toLowerCase();
    const hot = r === 'high' || r === 'critical';
    const intro = g ? `我先把方向对齐一下：${g}。` : `这条链路需要先走一趟人工审批。`;
    const mid = hot
      ? '结合当前信息，我觉得风险偏高，不适合我单方面继续往下推。'
      : '这里有一个需要你拍板的点，我已经为你准备好了审批单。';
    const tail = input.approvalReason?.trim()
      ? `\n主要触发原因：${input.approvalReason.trim().slice(0, 400)}`
      : '';
    return `${intro}${mid}你在审批入口确认通过后，我再继续执行。${tail}`.trim().slice(0, 8000);
  }

  async handleOrchestrationPath(
    intentDecision: IntentDecision,
    input: CollaborationPipelineV2RunInput,
  ): Promise<CollaborationPipelineV2RunResult> {
    const routePath = resolvePipelineRoutePath(intentDecision);
    const modelReply = await this.generateOrchestrationModelReply(intentDecision, input);
    return {
      intentContract: 'legacy_intent_v1',
      routePath,
      intentDecision,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'Handled by orchestration reply path.',
        payload: {
          fastFinalText: modelReply ?? null,
          fastReplySource: modelReply ? 'model' : 'fallback',
          targetIds: intentDecision.targetIds ?? [],
          targetMode: intentDecision.targetMode ?? null,
          ceoStructuredContract: '2026.pr4',
        },
      },
    };
  }

  async generateOrchestrationModelReply(
    intentDecision: IntentDecision,
    input: CollaborationPipelineV2RunInput,
    options?: GenerateOrchestrationModelReplyOptions,
  ): Promise<string | null> {
    return this.orchestrationReply.generateOrchestrationModelReply(intentDecision, input, options);
  }


  async enrichPlanningMetadataWithUnifiedL1Classifier(
    input: CollaborationPipelineV2RunInput,
    intentDecision: IntentDecision,
    metadata: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!(await this.l1FeatureFlags.isIntent20261PlanningEnrichEnabled(input.companyId))) {
      return metadata;
    }
    const unified = tryUnifiedIntentFromPipelineIntentDecision(intentDecision);
    if (!unified) return metadata;
    try {
      const ceoUnion = ceoDecisionInputFromPipelineRun(input, unified);
      const core = await this.l1ClassifierCore.classifyCore(ceoUnion);
      const stub: CeoDecisionResult = {
        nextStep: intentDecision.shouldExecute ? CeoDecisionNextStep.EXECUTE : CeoDecisionNextStep.STRUCTURED_REPLY,
        confidence: intentDecision.confidence,
        commitmentText: input.contentText.slice(0, 400),
        l1DecisionContext: {
          waitingForAgentIds: [],
          transcriptSummary: core.transcriptSummary,
          humanIdentityDigest: core.humanIdentityDigest,
          classifierContextBrief: [
            `pre_context_fp=${core.decisionFingerprint}`,
            core.vectorEvidence ? `vec=${core.vectorEvidence.slice(0, 320)}` : '',
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 4000),
        },
      };
      const normalized = this.l1PostNormalizer.normalize(stub, ceoUnion);
      const idMeta =
        intentDecision.metadata && typeof intentDecision.metadata === 'object'
          ? (intentDecision.metadata as Record<string, unknown>)
          : {};
      const routePathHint = typeof idMeta.routePath === 'string' ? idMeta.routePath : undefined;
      return {
        ...metadata,
        pipelineL1DecisionContext: normalized.l1DecisionContext,
        pipelineL1PlanningCard: this.buildPipelineL1PlanningCard(normalized.l1DecisionContext, {
          unified,
          classifierCacheKey: core.cacheKey,
          legacyRoute: {
            intentType: String(intentDecision.intentType ?? ''),
            confidence: intentDecision.confidence,
            shouldExecute: intentDecision.shouldExecute === true,
            routePathHint,
          },
        }),
        pipelineL1ClassifierCacheKey: core.cacheKey,
      };
    } catch (err: unknown) {
      this.logger.warn('pipeline_v2.unified_l1_classifier_failed', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        error: err instanceof Error ? err.message : String(err),
      });
      return metadata;
    }
  }

  private async maybeReturnSyncHeavyPausedResult(params: {
    input: CollaborationPipelineV2RunInput;
    traceId: string;
    heavyKind: string;
    intentDecision?: IntentDecision;
    intentDecision2026_1?: CollaborationIntentDecisionV20261;
  }): Promise<CollaborationPipelineV2RunResult | null> {
    const paused = await this.orchestrationPause.isPaused({
      companyId: params.input.companyId,
      roomId: params.input.roomId,
      threadId: params.input.threadId,
    });
    if (!paused) return null;
    this.logger.log('foundry.collaboration.main_room.sync_heavy_skipped_paused', {
      companyId: params.input.companyId,
      roomId: params.input.roomId,
      messageId: params.input.messageId,
      traceId: params.traceId,
      heavyKind: params.heavyKind,
    });
    const legacyIntent =
      params.intentDecision ??
      ({
        schemaVersion: '1.0',
        intentType: 'unknown',
        targetMode: 'ceo_layer',
        targetType: 'system',
        targetIds: [],
        targetLayer: 'strategy',
        confidence: 0.9,
        messageCategory: 'chat',
        responseMode: 'direct_reply',
        shouldReply: false,
        shouldExecute: false,
        routingHints: {
          suggestedDepartments: [],
          requiresParallelism: false,
          riskLevel: 'low',
        },
        explanation: 'sync_heavy_skipped_orchestration_paused',
        traceId: params.traceId,
        roomId: params.input.roomId,
        requestedBy: params.input.humanSenderId ?? 'human',
        classifierSource: 'hybrid',
        llmUsed: false,
        evidence: {},
        metadata: {},
      } as IntentDecision);
    return this.wrapDispatchPlanRunResult({
      intentDecision: legacyIntent,
      intentDecision2026_1: params.intentDecision2026_1,
      routePath: 'orchestration_paused',
      message: 'sync_heavy_skipped_orchestration_paused',
      payload: { heavyKind: params.heavyKind, orchestrationPaused: true },
    });
  }

  private wrapDispatchPlanRunResult(params: {
    intentDecision: IntentDecision;
    intentDecision2026_1?: CollaborationIntentDecisionV20261;
    routePath: IntentRoutePath;
    message: string;
    payload: Record<string, unknown>;
  }): CollaborationPipelineV2RunResult {
    const output = {
      status: 'ok' as const,
      message: params.message,
      payload: params.payload,
    };
    if (params.intentDecision2026_1) {
      return {
        intentContract: 'unified_intent_v2026_1',
        routePath: params.routePath,
        intentDecision: params.intentDecision,
        intentDecision2026_1: params.intentDecision2026_1,
        handledByV2: true,
        output,
      };
    }
    return {
      intentContract: 'legacy_intent_v1',
      routePath: params.routePath,
      intentDecision: params.intentDecision,
      handledByV2: true,
      output,
    };
  }

  /**
   * Markdown Dispatch Plan → Parser → Compiler → auto flush（跳过 legacy Strategy/Orchestration LLM JSON）。
   */
  async runMainRoomDispatchPlanPath(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    intentDecision: IntentDecision;
    intentDecision2026?: CollaborationIntentDecision2026;
    intentDecision2026_1?: CollaborationIntentDecisionV20261;
    traceId: string;
    autoFlush?: boolean;
  }): Promise<CollaborationPipelineV2RunResult> {
    // Check orchestration pause gate before throwing
    if (this.orchestrationPause?.isPaused) {
      const paused = await this.orchestrationPause.isPaused({
        companyId: params.input.companyId,
        roomId: params.input.roomId,
        threadId: params.input.threadId,
      });
      if (paused) {
        return {
          intentContract: 'unified_intent_v2026_1',
          routePath: 'orchestration_paused',
          intentDecision: params.intentDecision,
          intentDecision2026_1: params.intentDecision2026_1,
          handledByV2: true,
          output: {
            status: 'ok',
            message: 'sync_heavy_skipped_orchestration_paused',
            payload: { fastFinalText: '编排已暂停，请等待恢复后再试。', fastReplySource: 'orchestration_paused' },
          },
        };
      }
    }
    return this.buildDispatchPlanRemovedResult(params.intentDecision2026_1);
  }

  /**
   * Listener 先写入 Plan 卡片消息后调用：按波次向各部门主管派活（主群时间线第二拍起）。
   */
  async executeDeferredDispatchPlanFlush(_params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    intentDecision: IntentDecision;
    distributionLegacy: DistributionPlan;
    planDoc: import('@contracts/types').CeoDispatchPlanDocument;
    traceId: string;
    /** CEO 执行计划卡片消息 ID（Listener append 后传入，用于写入派发跳过 metadata） */
    planMessageId?: string | null;
  }): Promise<{ ok: boolean; assignedCount: number; skipped: MainRoomDispatchSkipRow[] }> {
    return { ok: false, assignedCount: 0, skipped: [] };
  }

  private async flushDispatchPlanPendingDistribution(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    intentDecision: IntentDecision;
    intentDecision2026_1?: CollaborationIntentDecisionV20261;
    traceId: string;
    session: import('@contracts/types').MainRoomDispatchPlanSessionPayload;
    distribution: DistributionPlan;
  }): Promise<CollaborationPipelineV2RunResult> {
    return this.buildDispatchPlanRemovedResult(params.intentDecision2026_1);
  }

  async ensureCollaborationMainGoalFromDispatchPlan(_params: {
    input: CollaborationPipelineV2RunInput;
    planDoc: import('@contracts/types').CeoDispatchPlanDocument;
  }): Promise<EnsureMainGoalFromDispatchPlanResult> {
    return { ok: false, reason: 'dispatch services removed' };
  }

  private async requireMainGoalTaskIdForDispatchPlan(_params: {
    input: CollaborationPipelineV2RunInput;
    planDoc: import('@contracts/types').CeoDispatchPlanDocument;
  }): Promise<EnsureMainGoalFromDispatchPlanResult> {
    return { ok: false, reason: 'dispatch services removed' };
  }

  private buildDispatchPlanRemovedResult(
    intentDecision2026_1?: CollaborationIntentDecisionV20261,
  ): CollaborationPipelineV2RunResult {
    return {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'orchestration',
      intentDecision: {} as IntentDecision,
      intentDecision2026_1: intentDecision2026_1 ?? {} as CollaborationIntentDecisionV20261,
      handledByV2: true,
      output: {
        status: 'error',
        message: 'dispatch_plan_path_removed',
        payload: { fastFinalText: '编排计划路径已移除，请使用工具循环模式。', fastReplySource: 'dispatch_plan_removed' },
      },
    };
  }

  private buildDispatchAssignFailedRunResult(params: {
    intentDecision: IntentDecision;
    intentDecision2026_1?: CollaborationIntentDecisionV20261;
    reason: string;
    userMessage: string;
    skipped?: MainRoomDispatchSkipRow[];
    companyId?: string;
    roomId?: string;
    threadId?: string | null;
    traceId?: string;
  }): CollaborationPipelineV2RunResult {
    this.routeCounter.add(1, { routePath: 'dispatch_assign_failed', roomType: 'main' });
    this.dispatchPlanCounter.add(1, { outcome: 'assign_failed', roomType: 'main' });
    if (params.companyId && params.roomId) {
      void this.programLifecycle.emitFailure({
        companyId: params.companyId,
        roomId: params.roomId,
        threadId: params.threadId,
        traceId: params.traceId,
        summary: params.userMessage.slice(0, 200),
        metadata: { reason: params.reason, skippedCount: params.skipped?.length ?? 0 },
      });
    }
    return this.wrapDispatchPlanRunResult({
      intentDecision: params.intentDecision,
      intentDecision2026_1: params.intentDecision2026_1,
      routePath: 'dispatch_assign_failed',
      message: 'Dispatch plan assign failed.',
      payload: {
        fastFinalText: params.userMessage.slice(0, 800),
        dispatchAssignFailure: {
          reason: params.reason,
          skipped: params.skipped ?? [],
        },
        ceoStructuredContract: '2026.pr4',
        metadata: { kind: 'dispatch_assign_failed', routePath: 'dispatch_assign_failed' },
      },
    });
  }

  async patchDispatchPlanFlushFailedMetadata(params: {
    companyId: string;
    planMessageId: string;
    flushError: string;
    flushPending?: boolean;
  }): Promise<void> {
    const messageId = String(params.planMessageId ?? '').trim();
    if (!messageId) return;
    const rpcTimeout = Math.max(4_000, Math.min(20_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    try {
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.messages.patchMetadata', {
            companyId: params.companyId,
            actor: this.workerActor(),
            messageId,
            metadata: {
              flushFailed: true,
              flushError: params.flushError.slice(0, 500),
              flushPending: params.flushPending !== false,
              dispatched: false,
            },
          })
          .pipe(timeout({ first: rpcTimeout })),
      );
    } catch (e: unknown) {
      this.logger.warn('main_room.dispatch_plan.patch_flush_failed_metadata', {
        companyId: params.companyId,
        messageId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async patchDispatchPlanFlushSuccessMetadata(params: {
    companyId: string;
    planMessageId: string;
    assignedCount: number;
  }): Promise<void> {
    const messageId = String(params.planMessageId ?? '').trim();
    if (!messageId) return;
    const rpcTimeout = Math.max(4_000, Math.min(20_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    try {
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.messages.patchMetadata', {
            companyId: params.companyId,
            actor: this.workerActor(),
            messageId,
            metadata: {
              dispatched: true,
              flushPending: false,
              flushFailed: false,
              dispatchAssignedCount: params.assignedCount,
            },
          })
          .pipe(timeout({ first: rpcTimeout })),
      );
    } catch (e: unknown) {
      this.logger.warn('main_room.dispatch_plan.patch_flush_success_metadata', {
        companyId: params.companyId,
        messageId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async maybeRequestBreakdownAfterDispatchPlan(_params: {
    input: CollaborationPipelineV2RunInput;
    planDoc: import('@contracts/types').CeoDispatchPlanDocument;
  }): Promise<void> {
    // no-op: dispatch services removed
  }

  async handleL1Path(
    intentDecision: IntentDecision,
    input: CollaborationPipelineV2RunInput,
    chainOpts?: { memoryContext?: MainRoomLeadMemoryContext; roomContext?: RoomContext },
  ): Promise<CollaborationPipelineV2RunResult> {
    const heavyKindL1 = readReplayHeavyPipelineKindFromIntent(intentDecision);
    if (
      intentHasReplayDelegatedExecution(intentDecision) &&
      this.config.shouldUseCeoDispatchPlanPath() &&
      (heavyKindL1 === 'dispatch_plan_compile_and_flush' || heavyKindL1 === 'dispatch_plan_revise')
    ) {
      const roomContext =
        chainOpts?.roomContext ??
        (await this.roomContextService.buildRoomContext({
          companyId: input.companyId,
          roomId: input.roomId,
        }));
      const traceIdL1 = String(input.executionTokenId ?? input.messageId).trim();
      return await this.runMainRoomDispatchPlanPath({
        input,
        roomContext,
        intentDecision,
        traceId: traceIdL1,
        autoFlush: heavyKindL1 !== 'dispatch_plan_revise',
      });
    }

    /** Replay 已委托重链时不得走 summon 短路（否则仅 CEO 直连 NL / orchestration NL，战略 planning·distribute·监督不会跑）。 */
    if (
      isSummonRoutingIntentCeoV2(intentDecision) &&
      !intentHasReplayDelegatedExecution(intentDecision)
    ) {
      const targets = this.pipeline.getResolvedTargetAgentIds(intentDecision);
      const unified = tryUnifiedIntentFromPipelineIntentDecision(intentDecision);
      if (targets.length > 0) {
        this.logger.log('pipeline_v2.l1_path_summon_short_circuit', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          branch: 'direct_reply',
          targetCount: targets.length,
        });
        return await this.pipeline.handleDirectedReplyPath(
          intentDecision,
          input,
          unified ? { intentDecision2026_1: unified } : undefined,
        );
      }
      this.logger.log('pipeline_v2.l1_path_summon_short_circuit', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        branch: 'orchestration_nl',
        targetCount: 0,
      });
      return await this.handleOrchestrationPath(intentDecision, input);
    }

    const traceIdPlanning = String(input.executionTokenId ?? input.messageId).trim();
    const roomContext =
      chainOpts?.roomContext ??
      (await this.roomContextService.buildRoomContext({
        companyId: input.companyId,
        roomId: input.roomId,
      }));
    return await this.runMainRoomDispatchPlanPath({
      input,
      roomContext,
      intentDecision,
      traceId: traceIdPlanning,
      autoFlush: heavyKindL1 !== 'dispatch_plan_revise',
    });
  }

  async ensureApprovalRequest(
    input: CollaborationPipelineV2RunInput,
    planning: { traceId: string; goal: string; approvalReason?: string; planId?: string },
    intentDecision: IntentDecision,
  ): Promise<string> {
    if (input.approvalRequestId) return input.approvalRequestId;
    const planId = String(planning.planId ?? '').trim();
    const created = await firstValueFrom(
      this.apiRpc
        .send<{ id?: string }>('approval.create', {
          companyId: input.companyId,
          actor: this.workerActor(),
          actionType: 'collaboration.ceo.v2.execute',
          riskLevel: intentDecision.routingHints.riskLevel === 'critical' ? 'L3' : 'L2',
          context: {
            roomId: input.roomId,
            messageId: input.messageId,
            traceId: planning.traceId,
            goal: planning.goal,
            reason: planning.approvalReason ?? 'planning.approvalFlag=true',
            ...(planId ? { planId } : {}),
            ...(String(input.messageCategory ?? '').trim() === 'task_publish'
              ? { messageCategory: 'task_publish' }
              : {}),
          },
        })
        .pipe(timeout({ first: 15_000 })),
    );
    const approvalId = String(created?.id ?? '').trim();
    if (!approvalId) throw new Error('ceo_v2_approval_create_failed');
    return approvalId;
  }

  /** 对话状态：可见 CEO 回复指纹（用于抑制连续相同 supervision / NL 表面文案）。 */
  private replyFingerprint(text: string): string {
    return createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex');
  }

  private async fetchLastCeoAgentSurfaceContent(params: {
    companyId: string;
    roomId: string;
    ceoAgentId: string;
  }): Promise<string | null> {
    const list = await firstValueFrom(
      this.apiRpc
        .send<{ items?: Array<{ senderType?: string; senderId?: string; content?: string | null }> }>(
          'collaboration.messages.list',
          {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
            limit: 64,
          },
        )
        .pipe(timeout({ first: Math.max(3_000, this.config.getCollaborationMentionRpcTimeoutMs()) })),
    ).catch(() => ({ items: [] as Array<{ senderType?: string; senderId?: string; content?: string | null }> }));
    const rows = Array.isArray(list?.items) ? list.items : [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (String(r?.senderType ?? '').toLowerCase() !== 'agent') continue;
      if (String(r?.senderId ?? '').trim() !== params.ceoAgentId) continue;
      const c = String(r?.content ?? '').trim();
      if (!c) continue;
      if (c.includes('执行进行中') && c.includes('workflow=')) continue;
      return c;
    }
    return null;
  }

  private async isDuplicateOfLastCeoSurfaceReply(
    input: CollaborationPipelineV2RunInput,
    candidateText: string,
  ): Promise<boolean> {
    const aid = input.ceoAgentId?.trim();
    if (!aid || !candidateText.trim()) return false;
    const prev = await this.fetchLastCeoAgentSurfaceContent({
      companyId: input.companyId,
      roomId: input.roomId,
      ceoAgentId: aid,
    });
    if (!prev) return false;
    return this.replyFingerprint(prev) === this.replyFingerprint(candidateText);
  }

  async runMainRoomOrchestrationSupervisionCompletion(params: {
    legacyIntent: IntentDecision;
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    planning2026: CollaborationPlanningResult2026;
    legacyPlanning: PlanningResult;
    memoryContext: { hitCount: number };
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: CollaborationIntentDecisionV20261;
    traceId: string;
    executionStateStages: string[];
  }): Promise<CollaborationPipelineV2RunResult> {
    const {
      legacyIntent,
      input,
      roomContext,
      planning2026,
      legacyPlanning,
      memoryContext,
      intentDecision2026,
      intentDecision2026_1,
      traceId,
      executionStateStages,
    } = params;

    const intentSlugs = (legacyIntent.routingHints?.suggestedDepartments ?? [])
      .map((x: unknown) => String(x ?? '').trim()).filter(Boolean);
    const legacyPlanningForDist = await this.planningAssignablePool.enrichPlanning(legacyPlanning, {
      companyId: input.companyId,
      roomId: input.roomId,
      intentSlugs,
      skipIfPresent: true,
    });
    const distributionLegacy = await this.orchestrationService.distribute(legacyPlanningForDist, {
      intentSlugs,
      companyId: input.companyId,
      roomId: input.roomId,
    });
    await this.pipeline.recordExecutionStateTransition({
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      stage: 'in_progress',
      intentDecision: legacyIntent,
      note: 'orchestration_distributed',
      planId: legacyPlanningForDist.planId,
      distributionId: distributionLegacy.distributionId,
    });
    executionStateStages.push('in_progress');

    const distribution2026 = to2026DistributionPlan({
      planning: planning2026,
      distribution: distributionLegacy,
    });

    const routed = await this.supervision.executeSupervisionFlow(
      legacyIntent,
      input,
      legacyPlanningForDist,
      distributionLegacy,
      'supervision',
      executionStateStages,
    );
    const payload = (routed.output?.payload ?? {}) as Record<string, unknown>;
    const supervisionDeferred =
      payload.supervisionDeferred === true ||
      (payload.supervisionMode === 'async' &&
        payload.temporal != null &&
        typeof payload.temporal === 'object');
    if (supervisionDeferred) {
      this.routeCounter.add(1, { routePath: 'supervision', roomType: roomContext.roomType });
      return {
        intentContract: 'unified_intent_v2026_1',
        routePath: 'supervision',
        intentDecision: routed.intentDecision,
        intentDecision2026_1,
        handledByV2: routed.handledByV2,
        output: {
          status: 'ok',
          message: 'Supervision deferred to Temporal (async).',
          payload: {
            ...payload,
            supervisionDeferred: true,
            intentDecision2026,
            intentDecision2026_1,
            planning: planning2026,
            planningLegacy: legacyPlanningForDist,
            distribution: distribution2026,
            distributionLegacy,
            executionStateStages: Array.from(new Set(executionStateStages)),
            ceoStructuredContract: '2026.pr4',
          },
        },
      };
    }
    const heavyLegacy = (payload.heavyExecutionOutput ?? null) as Record<string, unknown> | null;
    const heavy2026 = to2026HeavyExecutionOutput({
      planning: planning2026,
      distribution: distribution2026,
      heavyLegacy,
    });

    await this.memoryCrossCutService.persistAfterSupervision({
      companyId: input.companyId,
      roomId: input.roomId,
      traceId,
      messageId: input.messageId,
      roomType: roomContext.roomType,
      strategySummary: planning2026.strategyGoal,
      orchestrationSummary: `departments=${distribution2026.departmentTasks.map((x) => x.departmentSlug).join(',')}`,
      supervisionSummary: heavy2026.finalSummary ?? heavy2026.finalText,
      departmentSlugs: distribution2026.departmentTasks.map((x) => x.departmentSlug),
      heartbeatCorrelation: input.heartbeatCorrelation,
      layerRoomHint: buildMemoryLayerRoomHint(roomContext),
    });

    const feedbackPositive =
      typeof heavyLegacy?.['metadata'] === 'object' &&
      heavyLegacy?.['metadata'] &&
      Boolean((heavyLegacy['metadata'] as Record<string, unknown>)['userFeedbackPositive']);
    await this.rlhfSamplerService.sampleAfterSupervision({
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      traceId,
      userPrompt: input.contentText,
      intentDecision: intentDecision2026,
      planning: planning2026,
      supervision: heavy2026,
      userFeedbackPositive: feedbackPositive,
    });

    let fastFinalText =
      typeof payload.fastFinalText === 'string' && payload.fastFinalText.trim()
        ? String(payload.fastFinalText)
        : heavy2026.finalText;

    const dup = await this.isDuplicateOfLastCeoSurfaceReply(input, fastFinalText);
    if (dup) {
      this.logger.warn('foundry.ceo.v2.main_room.duplicate_reply_suppressed', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        fingerprint: this.replyFingerprint(fastFinalText),
      });
      try {
        const refreshInput: CollaborationPipelineV2RunInput = {
          ...input,
          contentText: `${input.contentText}\n\n[conversation_state:v1] duplicate_visible_reply_suppressed — regenerate a distinct answer grounded in the latest user turn.`,
        };
        const refreshed = await this.generateOrchestrationModelReply(
          legacyIntent,
          refreshInput,
          this.pickOrchestrationReplyOptions(legacyIntent),
        );
        const r = refreshed?.trim();
        if (r) fastFinalText = r;
      } catch (e) {
        this.logger.warn('foundry.ceo.v2.main_room.duplicate_refresh_failed', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const supervisionEmployeeResults = this.supervisionEmployeeResultsFromHeavyLegacy(heavyLegacy);

    this.routeCounter.add(1, { routePath: 'supervision', roomType: roomContext.roomType });
    this.supervisionOutcome.add(1, {
      status: heavy2026.blockedReason ? 'blocked' : 'ok',
      roomType: roomContext.roomType,
    });
    if (heavy2026.partials.length > 0) {
      this.partialFeedbackCounter.add(heavy2026.partials.length, { roomType: roomContext.roomType });
    }
    void this.memoryCrossCutService
      .persistAfterSurfaceReply({
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        traceId,
        replyText: fastFinalText,
        roomType: roomContext.roomType,
        heartbeatCorrelation: input.heartbeatCorrelation,
      })
      .catch((e: unknown) => {
        this.logger.debug('orchestration.persist_after_surface_reply_failed', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          message: e instanceof Error ? e.message : String(e),
        });
      });

    return {
      intentContract: 'unified_intent_v2026_1',
      routePath: routed.routePath,
      intentDecision: routed.intentDecision,
      intentDecision2026_1,
      handledByV2: routed.handledByV2,
      output: {
        ...routed.output,
        message: 'Handled by 2026 main room chain (intent-layer/strategy/orchestration/supervision).',
        payload: {
          ...payload,
          memoryContextHitCount: memoryContext.hitCount,
          intentDecision2026,
          intentDecision2026_1,
          planning: planning2026,
          planningLegacy: legacyPlanningForDist,
          distribution: distribution2026,
          distributionLegacy,
          heavyExecutionOutput: heavy2026,
          heavyExecutionOutputLegacy: heavyLegacy,
          executionStateStages: Array.from(new Set(executionStateStages)),
          fastFinalText,
          fastReplySource:
            typeof payload.fastReplySource === 'string' ? payload.fastReplySource : 'supervision_inline',
          ceoStructuredContract: '2026.pr4',
          ...(supervisionEmployeeResults?.length ? { employeeResults: supervisionEmployeeResults } : {}),
        },
      },
    };
  }

  /** 供 orchestration-runs metadata 提取 artifact / skillExecutionId（与 supervise metadata 对齐）。 */
  supervisionEmployeeResultsFromHeavyLegacy(
    heavyLegacy: Record<string, unknown> | null,
  ): Array<Record<string, unknown>> | null {
    if (!heavyLegacy || typeof heavyLegacy !== 'object') return null;
    const meta =
      heavyLegacy.metadata && typeof heavyLegacy.metadata === 'object' && !Array.isArray(heavyLegacy.metadata)
        ? (heavyLegacy.metadata as Record<string, unknown>)
        : null;
    const digest = meta?.employeeExecutionDigest;
    if (!Array.isArray(digest) || !digest.length) return null;
    return digest as Array<Record<string, unknown>>;
  }

  /**
   * 主群 goal lock：将 L2 分发计划中的部门任务落成「部门子目标」任务（`tasks.goals.assignToDepartmentDirector`），
   * 使部门主管在部门群侧可基于 `goalTargetRoomId` 与 Pending 链路继续执行。
   */
  async dispatchDepartmentDirectorGoalsFromDistribution(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    distributionLegacy: DistributionPlan;
    blockedReason?: string;
    distributionFlush?: boolean;
    emitCompensationNotice?: boolean;
  }): Promise<MainRoomDispatchFlushResult> {
    return { skipped: [], assignedCount: 0 };
  }

  /** 派发 flush 完成后，将跳过部门写入执行计划消息 metadata（触发 WS metadata_updated）。 */
  private async patchDispatchPlanFlushSkippedMetadata(params: {
    companyId: string;
    planMessageId: string;
    skipped: MainRoomDispatchSkipRow[];
  }): Promise<void> {
    const messageId = String(params.planMessageId ?? '').trim();
    if (!messageId || !params.skipped.length) return;
    const rpcTimeout = Math.max(4_000, Math.min(20_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    const rows = params.skipped.slice(0, 24).map((row) => ({
      departmentSlug: row.departmentSlug.slice(0, 64),
      reason: row.reason,
      ...(row.planTaskId ? { planTaskId: row.planTaskId.slice(0, 128) } : {}),
    }));
    try {
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.messages.patchMetadata', {
            companyId: params.companyId,
            actor: this.workerActor(),
            messageId,
            metadata: { dispatchFlushSkipped: rows },
          })
          .pipe(timeout({ first: rpcTimeout })),
      );
    } catch (e: unknown) {
      this.logger.warn('main_room.dispatch_plan.patch_skipped_metadata_failed', {
        companyId: params.companyId,
        messageId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * 主群 goal lock：编排+监督成功后自动 RPC `tasks.requestBreakdown`（与「定稿再编排」同一产品开关，无额外 env）。
   * 监督 blocked 时不触发；成功发起后 `breakdownDispatched` 幂等。
   */
  async maybeRequestMainRoomGoalBreakdownAfterOrchestration(_params: {
    input: CollaborationPipelineV2RunInput;
    planning2026: CollaborationPlanningResult2026;
    blockedReason?: string;
  }): Promise<void> {
    // no-op: dispatch services removed
  }

  async ensureCollaborationMainGoalFromDraft(_params: {
    input: CollaborationPipelineV2RunInput;
    planning2026: CollaborationPlanningResult2026;
    legacyPlanning: PlanningResult;
  }): Promise<void> {
    // no-op: dispatch services removed
  }

  async emitStrategyGoalDraftSurfaceReply(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: CollaborationIntentDecisionV20261;
    planning2026: CollaborationPlanningResult2026;
    legacyPlanning: PlanningResult;
    traceId: string;
    executionStateStages: string[];
    authorizedHeavyExecution: boolean;
  }): Promise<CollaborationPipelineV2RunResult> {
    return this.buildDispatchPlanRemovedResult(params.intentDecision2026_1);
  }

  async flushMainRoomDistributionDispatchAfterConfirm(_params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    traceId: string;
    intentDecision2026: CollaborationIntentDecision2026;
    planning2026: CollaborationPlanningResult2026;
    distributionLegacy: DistributionPlan;
  }): Promise<CollaborationPipelineV2RunResult> {
    return this.buildDispatchPlanRemovedResult();
  }

  private workerActor() {
    return { id: process.env.WORKER_ACTOR_USER_ID ?? '00000000-0000-0000-0000-000000000000', roles: ['admin'] as string[] };
  }

  /** Planning HumanMessage：多区块卡片（pre-context · unified SSOT · legacy 对齐 · telemetry）。 */
  private buildPipelineL1PlanningCard(
    ctx: L1DecisionContext,
    extras?: {
      unified?: CollaborationIntentDecisionV20261;
      classifierCacheKey?: string;
      legacyRoute?: {
        intentType?: string;
        confidence?: number;
        shouldExecute?: boolean;
        routePathHint?: string;
      };
    },
  ): Record<string, unknown> {
    const clip = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max);
    const ids = Array.isArray(ctx.waitingForAgentIds)
      ? ctx.waitingForAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean).slice(0, 24)
      : [];
    const u = extras?.unified;
    const rh = u?.routingHints;
    const sections: Record<string, unknown> = {
      preContext: {
        identityDigest: clip(ctx.humanIdentityDigest, 520),
        transcriptSummary: clip(ctx.transcriptSummary, 1100),
        classifierBrief: clip(ctx.classifierContextBrief, 2600),
        waitingForAgentIds: ids,
      },
      telemetry: {
        classifierCacheKey: extras?.classifierCacheKey ?? '',
        cardBuiltAt: new Date().toISOString(),
      },
    };
    if (u) {
      sections.unifiedIntent = {
        intentType: u.intentType,
        confidence: u.confidence,
        ...(u.audienceConfidence !== undefined ? { audienceConfidence: u.audienceConfidence } : {}),
        ...(u.strategyConfidence !== undefined ? { strategyConfidence: u.strategyConfidence } : {}),
        explanation: clip(u.explanation, 640),
        traceId: u.traceId,
        roomId: u.roomId,
        routing: rh
          ? (() => {
              const r = rh as unknown as Record<string, unknown>;
              const rawTargets = r.targetAgentIds;
              return {
                shouldExecute: Boolean(rh.shouldExecute),
                riskLevel: rh.riskLevel,
                requiresParallelism: Boolean(rh.requiresParallelism),
                suggestedDepartmentSlugs: Array.isArray(rh.suggestedDepartmentSlugs)
                  ? rh.suggestedDepartmentSlugs.slice(0, 12)
                  : [],
                targetAgentIds: Array.isArray(rawTargets)
                  ? rawTargets.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 8)
                  : [],
              };
            })()
          : {},
      };
    }
    const lr = extras?.legacyRoute;
    if (lr && (lr.intentType !== undefined || lr.routePathHint !== undefined)) {
      sections.legacyRouteAlignment = {
        intentType: lr.intentType ?? '',
        confidence: lr.confidence ?? null,
        shouldExecute: Boolean(lr.shouldExecute),
        routePathHint: lr.routePathHint ?? '',
        note: 'Legacy IntentDecision shape co-routed with unified SSOT for L2/L3 compatibility.',
      };
    }
    return {
      schemaVersion: '2026.1',
      kind: 'pipeline_l1_planning_card',
      cardRevision: '2026.1-p2',
      title: 'Main room L1 planning context',
      subtitle: 'Intent 2026.1 unified path — read sections in order; ignore unknown keys.',
      sections,
    };
  }
}
