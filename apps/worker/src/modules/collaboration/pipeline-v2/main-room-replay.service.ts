import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { metrics } from '@opentelemetry/api';
import { firstValueFrom, timeout } from 'rxjs';
import type { CollaborationIntentDecisionV20261, IntentDecision } from '@contracts/types';
import { buildCollaborationIntentDecisionV20261 } from '../intent/intent-unified-mapping.js';
import {
  NextStep,
  type LightStructuredOutputV2,
} from '@foundry/contracts/types/collaboration';
import { ConfigService } from '../../../common/config/config.service.js';
import { DirectCollabReplyService } from '../direct-collab-reply.service.js';
import { buildStrategyPatchPayloadFromReplaySummary } from '../main-room-replay-draft-patch.util.js';
import { ReplayExecutionDelegateError } from '../main-room-replay-delegate-errors.js';
// Removed: MainRoomDispatchPlanSessionService (deleted)
import { MainRoomReplayMetadataService } from '../replay/main-room-replay-metadata.service.js';
import type {
  IntentDecision as CollaborationIntentDecision2026,
  RoomContext,
} from '../contracts/collaboration-2026.contracts.js';
import type { CollaborationMainRoomIntentService } from './main-room-intent.service.js';
import type { CollaborationPipelineV2Service } from './collaboration-pipeline-v2.service.js';
import {
  lazyCollaborationMainRoomIntentService,
  lazyCollaborationPipelineV2Service,
} from './pipeline-v2.forward-ref.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
} from './collaboration-pipeline-v2.types.js';
import type { CeoAlignmentMetadata, CeoPipelineProgressMetadata } from '@foundry/contracts/types/ceo-alignment';

export type ExecuteMainRoomReplayUserFacingCopyParams = {
  input: CollaborationPipelineV2RunInput;
  roomContext: RoomContext;
  intentDecision2026: CollaborationIntentDecision2026;
  intentDecision2026_1: CollaborationIntentDecisionV20261;
  traceId: string;
  authorizedHeavyExecution: boolean;
  finalText: string;
  fastReplySource: string;
  ceoAlignment?: CeoAlignmentMetadata;
  ceoPipelineProgress?: CeoPipelineProgressMetadata;
};

/** Pipeline V2：主群 Replay / delegate 用户可见副本与重链 ack。 */
@Injectable()
export class CollaborationMainRoomReplayService {
  private readonly logger = new Logger(CollaborationMainRoomReplayService.name);
  private readonly routeCounter = metrics
    .getMeter('foundry.collaboration')
    .createCounter('foundry.collaboration.route_path.total');

  constructor(
    private readonly config: ConfigService,
    private readonly directReply: DirectCollabReplyService,
    private readonly replayMetadata: MainRoomReplayMetadataService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    @Inject(forwardRef(lazyCollaborationPipelineV2Service))
    private readonly pipeline: CollaborationPipelineV2Service,
    @Inject(forwardRef(lazyCollaborationMainRoomIntentService))
    private readonly intent: CollaborationMainRoomIntentService,
  ) {}

  /**
   * **Intent→replay** 子形态：CEO 将 unified/layer 上 **服务端策略** 写入的 `userFacingReply` 写入群。
   */
  async executeMainRoomReplayUserFacingCopy(
    params: ExecuteMainRoomReplayUserFacingCopyParams,
  ): Promise<CollaborationPipelineV2RunResult> {
    const { input, roomContext, intentDecision2026, intentDecision2026_1, traceId, authorizedHeavyExecution } =
      params;
    const ceoId = String(input.ceoAgentId ?? '').trim();
    const text = String(params.finalText ?? '').trim();
    if (!text) {
      this.logger.warn('main_room.user_facing_copy_empty', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        traceId,
        fastReplySource: params.fastReplySource,
      });
      const fallbackText = '收到，正在处理中。请稍候。';
      if (ceoId) {
        const fallbackOutput: LightStructuredOutputV2 = {
          version: 'v2',
          nextStep: NextStep.STRUCTURED_REPLY,
          finalText: fallbackText,
          commitmentText: input.contentText.slice(0, 400),
          suggestedTasks: [],
          memoryReferences: [],
          metadata: { pipeline: 'v2', routePath: 'orchestration', fastReplySource: 'empty_finaltext_fallback' },
        };
        await this.directReply.reply({
          companyId: input.companyId,
          roomId: input.roomId,
          agentId: ceoId,
          sourceMessageId: input.messageId,
          threadId: input.threadId ?? null,
          output: fallbackOutput,
          intentDecision2026_1,
          heartbeatCorrelation: input.heartbeatCorrelation,
        });
      }
      return {
        intentContract: 'unified_intent_v2026_1',
        routePath: 'orchestration',
        intentDecision: this.intent.buildLegacyIntentDecisionFromUnifiedPipeline({
          input,
          layerDecision: intentDecision2026,
          unified: intentDecision2026_1,
          flags: { authorizedHeavyExecution },
        }),
        intentDecision2026_1,
        handledByV2: true,
        output: {
          status: 'ok',
          message: 'Main room user-facing copy used fallback: empty finalText.',
          payload: { inlineReplyHandled: true, emptyFinalText: true, usedFallback: true },
        },
      };
    }
    if (!ceoId) {
      this.logger.warn('main_room.user_facing_intent_missing_ceo_agent', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        traceId,
      });
      return {
        intentContract: 'unified_intent_v2026_1',
        routePath: 'orchestration',
        intentDecision: this.intent.buildLegacyIntentDecisionFromUnifiedPipeline({
          input,
          layerDecision: intentDecision2026,
          unified: intentDecision2026_1,
          flags: { authorizedHeavyExecution },
        }),
        intentDecision2026_1,
        handledByV2: true,
        output: {
          status: 'ok',
          message: 'Main room policy userFacingReply skipped: missing ceoAgentId.',
          payload: { inlineReplyHandled: false, directAgentUnresolved: true },
        },
      };
    }

    const legacyIntent = this.intent.buildLegacyIntentDecisionFromUnifiedPipeline({
      input,
      layerDecision: intentDecision2026,
      unified: intentDecision2026_1,
      flags: { authorizedHeavyExecution },
    });
    legacyIntent.metadata = {
      ...(legacyIntent.metadata && typeof legacyIntent.metadata === 'object' ? legacyIntent.metadata : {}),
      routePath: 'orchestration',
      source: params.fastReplySource,
    } as Record<string, unknown>;

    const output: LightStructuredOutputV2 = {
      version: 'v2',
      nextStep: NextStep.STRUCTURED_REPLY,
      finalText: text.slice(0, 8000),
      commitmentText: input.contentText.slice(0, 400),
      suggestedTasks: [],
      memoryReferences: [],
      metadata: {
        pipeline: 'v2',
        routePath: 'orchestration',
        targetMode: legacyIntent.targetMode,
        fastReplySource: params.fastReplySource,
        ...(params.ceoAlignment ? { ceoAlignment: params.ceoAlignment } : {}),
        ...(params.ceoPipelineProgress ? { ceoPipelineProgress: params.ceoPipelineProgress } : {}),
      },
    };
    if (params.ceoAlignment) {
      void this.replayMetadata
        .patchTriggerAlignment({
          companyId: input.companyId,
          messageId: input.messageId,
          alignment: params.ceoAlignment,
        })
        .catch(() => undefined);
    }
    await this.directReply.reply({
      companyId: input.companyId,
      roomId: input.roomId,
      agentId: ceoId,
      sourceMessageId: input.messageId,
      threadId: input.threadId ?? null,
      output,
      intentDecision2026_1,
      heartbeatCorrelation: input.heartbeatCorrelation,
    });
    this.routeCounter.add(1, { routePath: 'orchestration', roomType: roomContext.roomType });
    this.logger.log('pipeline_v2_route_decided', {
      event: 'foundry.ceo.v2.enabled',
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      routePath: 'orchestration',
      intentType: intentDecision2026.intentType,
      confidence: intentDecision2026.confidence,
      classifier: params.fastReplySource,
      intentDecision2026_1,
    });
    const userFacingReplySource =
      params.fastReplySource === 'main_room_replay_direct_agent_copy'
        ? 'direct_agent_unresolved'
        : params.fastReplySource.startsWith('main_room_replay_delegate')
          ? 'replay_delegate'
          : 'intent_layer';

    return {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'orchestration',
      intentDecision: legacyIntent,
      intentDecision2026_1,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'CEO posted replay or policy user-facing copy.',
        payload: {
          inlineReplyHandled: true,
          responderAgentIds: [ceoId],
          directAgentUnresolved: params.fastReplySource === 'main_room_replay_direct_agent_copy',
          userFacingReplySource,
          fastReplySource: params.fastReplySource,
          ...(params.ceoAlignment ? { ceoAlignment: params.ceoAlignment } : {}),
        },
      },
    };
  }

  /**
   * Replay 执行委托契约/解析失败：`routePath=replay_delegate_error`，未进入 Strategy/Orchestration/Supervision 重链。
   */
  buildReplayDelegateErrorRunResult(params: {
    input: CollaborationPipelineV2RunInput;
    error: ReplayExecutionDelegateError;
    intentDecision2026_1?: CollaborationIntentDecisionV20261;
  }): CollaborationPipelineV2RunResult {
    const { input, error, intentDecision2026_1: overrideUnified } = params;
    const fallbackTrace = String(input.executionTokenId ?? input.messageId).trim();
    const fallbackUnified =
      overrideUnified ??
      buildCollaborationIntentDecisionV20261({
        traceId: fallbackTrace,
        roomId: input.roomId,
        audienceConfidence: 0.35,
        layer: {
          intentType: 'unknown',
          confidence: 0.35,
          explanation: `replay_delegate_error:${error.code}`,
          routingHints: {
            riskLevel: 'medium',
            requiresParallelism: false,
            shouldExecute: false,
          },
          targetDepartmentSlugs: [],
        },
        hasValidDirectAgentTargets: false,
      });
    const upstreamDetail =
      error.code === 'upstream' ? String(error.message ?? '').trim().slice(0, 2000) : '';
    const hint =
      error.code === 'contract_violation'
        ? '当前任务进度与预期不一致，请重新描述你的需求后再试。'
        : error.code === 'parse_failed'
          ? '处理过程中出现问题，请换一种表达方式或稍后重试。'
          : upstreamDetail
            ? `处理过程中出现异常，请稍后重试。`
            : '处理过程中出现问题，请稍后重试。';
    const legacyIntentDel: IntentDecision = {
      schemaVersion: '1.0',
      intentType: 'unknown',
      targetMode: 'ceo_layer',
      targetType: 'system',
      targetIds: [],
      targetLayer: null,
      confidence: 0.35,
      shouldReply: true,
      shouldExecute: false,
      messageCategory: 'chat',
      responseMode: 'direct_reply',
      routingHints: {
        suggestedDepartments: [],
        requiresParallelism: false,
        riskLevel: 'medium',
      },
      explanation: `replay_delegate_error:${error.code}`,
      traceId: fallbackTrace,
      roomId: input.roomId,
      requestedBy: input.humanSenderId ?? 'human',
      classifierSource: 'fallback',
      llmUsed: true,
      metadata: {
        intentDecision2026_1: fallbackUnified as unknown as Record<string, unknown>,
        replayDelegateErrorCode: error.code,
        ...(upstreamDetail ? { replayDelegateUpstreamMessage: upstreamDetail } : {}),
      },
    };
    return {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'replay_delegate_error',
      intentDecision: legacyIntentDel,
      intentDecision2026_1: fallbackUnified,
      handledByV2: true,
      output: {
        status: 'error',
        message: 'Replay delegate contract or upstream error.',
        payload: {
          fastFinalText: hint.slice(0, 8000),
          fastReplySource: 'main_room_replay_delegate_error',
          intentDecision2026_1: fallbackUnified,
          replayDelegateErrorCode: error.code,
          ...(upstreamDetail ? { replayDelegateUpstreamMessage: upstreamDetail } : {}),
        },
      },
    };
  }

  /** replay 委托进入重链前：对用户可见的进度收口。 */
  async postMainRoomReplayHeavyPipelineAck(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    traceId: string;
    ackText?: string | null;
  }): Promise<void> {
    const { input, roomContext, traceId } = params;
    const ceoId = String(input.ceoAgentId ?? '').trim();
    if (!ceoId || roomContext.roomType !== 'main') return;

    const custom = String(params.ackText ?? '').trim();
    const ackText =
      custom ||
      [
        '【Strategy】已开始为你制定战略目标。',
        '我会结合主群上下文生成「主目标 + 关键结果」草案，并以卡片展示。你可先在输入框补充口径；收到卡片后可用自然语言说明修改，或点卡片上的「与 Replay 调整草稿」。',
        '确认目标后请点「确认并开始部门编排」或发送「定稿」等快捷语，进入 Orchestration 为各部门生成分工草案；部门草稿确认后再下发到各部门群。',
        '若本步触发人工审批，通过后将自动继续。',
      ].join('\n');
    const progress: CeoPipelineProgressMetadata = {
      stage: 'strategy',
      status: 'started',
      correlationId: traceId,
      traceId,
      updatedAt: new Date().toISOString(),
    };
    const output: LightStructuredOutputV2 = {
      version: 'v2',
      nextStep: NextStep.STRUCTURED_REPLY,
      finalText: ackText,
      commitmentText: String(input.contentText ?? '').trim().slice(0, 400),
      suggestedTasks: [],
      memoryReferences: [],
      metadata: {
        pipeline: 'v2',
        routePath: 'fast_path',
        fastReplySource: custom ? 'main_room_replay_heavy_pipeline_ack' : 'main_room_replay_heavy_pipeline_ack_default',
        ceoReplayPhase: 'replay_delegate_strategy_pending',
        ceoPipelineProgress: progress,
        traceId,
      },
    };
    void this.replayMetadata
      .patchTriggerPipelineProgress({
        companyId: input.companyId,
        messageId: input.messageId,
        progress,
      })
      .catch(() => undefined);
    await this.directReply.reply({
      companyId: input.companyId,
      roomId: input.roomId,
      agentId: ceoId,
      sourceMessageId: input.messageId,
      threadId: input.threadId ?? null,
      output,
      heartbeatCorrelation: input.heartbeatCorrelation,
    });
    this.logger.log('foundry.ceo.replay.heavy_pipeline_ack', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      traceId,
    });
  }

  /** Replay 细化后（draftGoalSummary）可选同步进主群战略目标 Redis 草稿。 */
  async maybeReplayPatchStrategyDraftFromSummary(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    humanUserId: string;
    draftGoalSummary: string;
  }): Promise<void> {
    if (!this.config.isMainRoomReplayPatchStrategyDraftFromSummaryEnabled()) return;
    const gl = null; // STUB: dispatch plan session service removed
    if (!gl || gl.dispatched) return;
    const patchPayload = buildStrategyPatchPayloadFromReplaySummary(params.draftGoalSummary);
    if (!patchPayload) return;
    const rpcTimeout = Math.max(4_000, Math.min(20_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    try {
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.mainRoomDraft.strategyGoal.patch', {
            companyId: params.companyId,
            actor: { id: params.humanUserId, roles: [] as string[] },
            roomId: params.roomId,
            threadId: params.threadId ?? undefined,
            strategyGoal: patchPayload.strategyGoal,
            strategicPhases: patchPayload.strategicPhases,
          })
          .pipe(timeout({ first: rpcTimeout })),
      );
    } catch (e: unknown) {
      this.logger.warn('main_room.replay_strategy_draft_patch_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
