import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { DistributionPlan, IntentDecision, IntentRoutePath, PlanningResult } from '@contracts/types';
import { NextStep } from '@foundry/contracts/types/collaboration';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import { CeoV2SupervisionService } from '../ceo/v2/ceo-v2-supervision.service.js';
import { CeoV2TemporalService } from '../ceo/v2/ceo-v2-temporal.service.js';
import { decideCeoV2HeavyTemporalPreference } from '../ceo/v2/ceo-v2-heavy-temporal-decision.util.js';
import { DirectCollabReplyService } from '../direct-collab-reply.service.js';
import { serializePlanningTurnContext } from '../context/planning-turn-context.serialization.js';
import { isCeoAudienceIntentType } from '../intent/intent-audience.util.js';
import type { CollaborationPipelineV2Service } from './collaboration-pipeline-v2.service.js';
import type { CollaborationMainRoomOrchestrationService } from './main-room-orchestration.service.js';
import {
  lazyCollaborationMainRoomOrchestrationService,
  lazyCollaborationPipelineV2Service,
} from './pipeline-v2.forward-ref.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
} from './collaboration-pipeline-v2.types.js';
import { intentHasReplayDelegatedExecution } from './pipeline-v2-replay.util.js';

/** Temporal 去重锁 TTL：15 分钟（覆盖大部分 Heavy 执行时长）。 */
const TEMPORAL_DEDUP_LOCK_TTL_MS = 15 * 60 * 1000;

export type ExecuteSupervisionFlowOptions = { forceInlineSupervision?: boolean };

/** Pipeline V2：主群监督 / Temporal 重链路阶段。 */
@Injectable()
export class CollaborationMainRoomSupervisionService {
  private readonly logger = new Logger(CollaborationMainRoomSupervisionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly collabRedis: CollabRedisCacheService,
    private readonly supervisionService: CeoV2SupervisionService,
    private readonly temporalService: CeoV2TemporalService,
    private readonly directReply: DirectCollabReplyService,
    @Inject(forwardRef(lazyCollaborationPipelineV2Service))
    private readonly pipeline: CollaborationPipelineV2Service,
    @Inject(forwardRef(lazyCollaborationMainRoomOrchestrationService))
    private readonly orchestration: CollaborationMainRoomOrchestrationService,
  ) {}

  async executeSupervisionFlow(
    intentDecision: IntentDecision,
    input: CollaborationPipelineV2RunInput,
    planningResult: PlanningResult,
    distribution: DistributionPlan & { planAnchorMessageId?: string; runId?: string; traceId?: string },
    routePath: IntentRoutePath,
    executionStateStages: string[] = [],
    supervisionOpts?: ExecuteSupervisionFlowOptions,
  ): Promise<CollaborationPipelineV2RunResult> {
    const routingRootMessageId = String(input.routingRootMessageId ?? input.messageId).trim() || input.messageId;
    const turnMessageId = String(input.messageId).trim();
    const planAnchorMessageId = String(
      distribution?.planAnchorMessageId ??
        distribution?.traceId ??
        planningResult?.planAnchorMessageId ??
        planningResult?.traceId ??
        '',
    ).trim();
    const resolvedPlanAnchor = planAnchorMessageId || routingRootMessageId;
    const runId = String(distribution?.runId ?? input.runId ?? '').trim();
    const distributionPlan: DistributionPlan = {
      ...distribution,
      traceId: resolvedPlanAnchor,
      planAnchorMessageId: resolvedPlanAnchor,
      turnMessageId,
      routingRootMessageId,
      ...(runId ? { runId } : {}),
      metadata: {
        ...(distribution?.metadata ?? {}),
        planAnchorMessageId: resolvedPlanAnchor,
        turnMessageId,
        routingRootMessageId,
        traceId: resolvedPlanAnchor,
        ...(runId ? { runId } : {}),
      },
    };
    const temporalWorkerEnabled =
      this.config.isWorkerL3TemporalV1Enabled() || this.config.isWorkerL3TemporalProtocolAlignEnabled();
    const allowCompanies = this.config.getL3TemporalRolloutCompanies();
    const companyInTemporalAllowlist = allowCompanies.includes(String(input.companyId ?? '').trim());
    const rolloutPct = this.config.getL3TemporalRolloutPercentage();
    const cid = String(input.companyId ?? '').trim();
    const rolloutBucket = cid ? [...cid].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 100 : 0;
    const temporalDecision = decideCeoV2HeavyTemporalPreference({
      intentDecision,
      temporalWorkerEnabled,
      companyInTemporalAllowlist,
      rolloutPercent: rolloutPct,
      rolloutBucket,
      heavyDefaultTemporal: this.config.isCollabCeoV2HeavyDefaultTemporal(),
    });
    const preferTemporal =
      temporalDecision.preferTemporal && supervisionOpts?.forceInlineSupervision !== true;
    if (supervisionOpts?.forceInlineSupervision && temporalDecision.preferTemporal) {
      this.logger.log('foundry.ceo.v2.supervision.path', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        distributionId: distributionPlan.distributionId,
        supervisionResultSource: 'skill_execution',
        temporalReason: 'main_room_force_inline_supervision',
      });
    }
    if (preferTemporal) {
      this.logger.log('foundry.ceo.v2.supervision.temporal_decision', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        planAnchorMessageId: resolvedPlanAnchor,
        turnMessageId,
        routingRootMessageId,
        runId: runId || undefined,
        reason: temporalDecision.reason,
        rolloutPercent: rolloutPct,
        rolloutBucket,
        companyInTemporalAllowlist,
        heavyDefaultTemporal: this.config.isCollabCeoV2HeavyDefaultTemporal(),
      });
      // 去重锁：防止同 distributionId 的 Temporal 重复启动（消息重试、进程重启等场景）。
      const dedupKey = `${this.config.getRedisKeyPrefix()}:temporal_dedup:${distributionPlan.distributionId}`;
      const acquiredDedup = await this.collabRedis.setPx(dedupKey, '1', TEMPORAL_DEDUP_LOCK_TTL_MS);
      if (!acquiredDedup) {
        this.logger.warn('foundry.ceo.v2.supervision.temporal_dedup_skipped', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          distributionId: distributionPlan.distributionId,
        });
        return {
          intentContract: 'legacy_intent_v1',
          routePath,
          intentDecision,
          handledByV2: true,
          output: {
            status: 'ok',
            message: 'Supervisor execution already started via Temporal (dedup).',
            payload: {
              planning: planningResult,
              distribution,
              executionStateStages,
              supervisionResultSource: 'temporal_department',
              supervisionMode: 'async',
              supervisionDeferred: true,
              distributionId: distributionPlan.distributionId,
              ceoStructuredContract: '2026.pr4',
              temporalDedupHit: true,
            },
          },
        };
      }
      try {
        const started = await this.temporalService.startHeavyExecution(intentDecision, {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          contentText: input.contentText,
          ceoAgentId: input.ceoAgentId,
          humanSenderId: input.humanSenderId ?? null,
          threadId: input.threadId ?? null,
          routingRootMessageId: input.routingRootMessageId ?? input.messageId,
          planAnchorMessageId: resolvedPlanAnchor,
          runId: runId || undefined,
          distributionPlan,
          planningTurnContext: input.collaborationExecutionContext
            ? serializePlanningTurnContext(input.collaborationExecutionContext)
            : undefined,
        });
        this.logger.log('foundry.ceo.v2.supervision.path', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          distributionId: distributionPlan.distributionId,
          supervisionResultSource: 'temporal_department',
          supervisionMode: 'async',
          temporalReason: temporalDecision.reason,
        });
        return {
          intentContract: 'legacy_intent_v1',
          routePath,
          intentDecision,
          handledByV2: true,
          output: {
            status: 'ok',
            message: 'Supervisor execution started via Temporal.',
            payload: {
              planning: planningResult,
              distribution,
              executionStateStages,
              temporal: started,
              supervisionResultSource: 'temporal_department',
              supervisionMode: 'async',
              supervisionDeferred: true,
              distributionId: distributionPlan.distributionId,
              ceoStructuredContract: '2026.pr4',
            },
          },
        };
      } catch (e: unknown) {
        // Temporal 启动失败：释放去重锁以便重试。
        await this.collabRedis.del(dedupKey).catch(() => undefined);
        const msg = String((e as { message?: string })?.message ?? '');
        const temporalConnectFailed =
          msg.includes('Failed to connect before the deadline') ||
          msg.includes('deadline') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('temporal');
        if (!temporalConnectFailed) throw e;
        this.logger.error('foundry.ceo.v2.temporal.unavailable_fallback', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          intentType: intentDecision.intentType,
          errorMessage: msg,
        });
      }
    }

    const shouldRunInlineSupervision =
      intentDecision.shouldExecute === true ||
      intentDecision.targetLayer === 'supervision' ||
      intentHasReplayDelegatedExecution(intentDecision);
    if (!shouldRunInlineSupervision) {
      const metaEarly =
        intentDecision.metadata && typeof intentDecision.metadata === 'object'
          ? (intentDecision.metadata as Record<string, unknown>)
          : null;
      const fromMainRoomIntentLayerEarly = String(metaEarly?.source ?? '') === 'intent_layer_service';
      const conversationalWhenSkipped =
        isCeoAudienceIntentType(intentDecision.intentType) || fromMainRoomIntentLayerEarly;
      let fastFinalTextSkipped: string | undefined;
      let fastReplySourceSkipped = 'supervision_skipped_no_inline';
      if (conversationalWhenSkipped) {
        try {
          const nl = await this.orchestration.generateOrchestrationModelReply(
            intentDecision,
            input,
            this.orchestration.pickOrchestrationReplyOptions(intentDecision),
          );
          const trimmed = nl?.trim();
          if (trimmed) {
            fastFinalTextSkipped = trimmed.slice(0, 8000);
            fastReplySourceSkipped = 'supervision_skipped_orchestration_nl';
          }
        } catch (e) {
          this.logger.warn('foundry.ceo.v2.supervision.skipped_orchestration_nl_failed', {
            companyId: input.companyId,
            roomId: input.roomId,
            messageId: input.messageId,
            intentType: intentDecision.intentType,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return {
        intentContract: 'legacy_intent_v1',
        routePath,
        intentDecision,
        handledByV2: true,
        output: {
          status: 'ok',
          message: 'Execution path skipped supervision by policy.',
          payload: {
            planning: planningResult,
            distribution,
            ceoStructuredContract: '2026.pr4',
            ...(fastFinalTextSkipped
              ? { fastFinalText: fastFinalTextSkipped, fastReplySource: fastReplySourceSkipped }
              : {}),
          },
        },
      };
    }

    const inlineSupervisionStartedAt = Date.now();
    const ceoAgentForSplit = String(input.ceoAgentId ?? '').trim();
    if (this.config.isCollabSupervisionSplitEnabled() && ceoAgentForSplit) {
      try {
        await this.directReply.reply({
          companyId: input.companyId,
          roomId: input.roomId,
          agentId: ceoAgentForSplit,
          sourceMessageId: input.messageId,
          threadId: input.threadId ?? null,
          output: {
            version: 'v2',
            nextStep: NextStep.STRUCTURED_REPLY,
            finalText: '任务已分发至相关部门，正在生成监督摘要…',
            commitmentText: '',
            suggestedTasks: [],
            memoryReferences: [],
            metadata: {
              pipeline: 'v2',
              routePath: 'supervision',
              fastReplySource: 'supervision_split_ack',
              richCard: {
                kind: 'ceo_main_room',
                cardType: 'supervision_progress',
                title: '执行更新',
                body: '已完成部门分工，监督层正在汇总结论。',
              },
            },
          },
        });
      } catch (e: unknown) {
        this.logger.warn('foundry.ceo.v2.supervision.split_ack_failed', {
          companyId: input.companyId,
          messageId: input.messageId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const supervisionResult = await this.supervisionService.supervise(distributionPlan);
    const supervisionStatusEarly = String((supervisionResult as { status?: string })?.status ?? 'completed').trim();
    let inlineText =
      String((supervisionResult as { finalText?: string })?.finalText ?? '')
        .trim()
        .slice(0, 8000) ||
      (supervisionStatusEarly === 'failed'
        ? '部分部门交付未通过验收，尚不能结案；请查看各部门群交付卡片。'
        : '监督层执行已完成。');
    const meta =
      intentDecision.metadata && typeof intentDecision.metadata === 'object'
        ? (intentDecision.metadata as Record<string, unknown>)
        : null;
    const fromMainRoomIntentLayer = String(meta?.source ?? '') === 'intent_layer_service';
    const metaSupEarly = distributionPlan.metadata as Record<string, unknown> | undefined;
    const deferInlineEarly = metaSupEarly?.deferInlineEmployeeExecution === true;
    const conversationalSupervision = isCeoAudienceIntentType(intentDecision.intentType) || fromMainRoomIntentLayer;
    let usedOrchestrationNl = false;
    if (conversationalSupervision && !deferInlineEarly) {
      try {
        const nl = await this.orchestration.generateOrchestrationModelReply(
          intentDecision,
          input,
          this.orchestration.pickOrchestrationReplyOptions(intentDecision),
        );
        const trimmed = nl?.trim();
        if (trimmed) {
          inlineText = trimmed.slice(0, 8000);
          usedOrchestrationNl = true;
        }
      } catch (e) {
        this.logger.warn('foundry.ceo.v2.supervision.orchestration_nl_failed', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          intentType: intentDecision.intentType,
          fromMainRoomIntentLayer,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const supervisionStatus = String((supervisionResult as { status?: string })?.status ?? 'completed').trim();
    await this.pipeline.recordExecutionStateTransition({
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      stage: supervisionStatus === 'completed' ? 'done' : supervisionStatus === 'failed' ? 'blocked' : 'done',
      intentDecision,
      note: `supervision_${supervisionStatus}`,
      planId: planningResult?.planId,
      distributionId: distribution?.distributionId,
    });
    executionStateStages.push(supervisionStatus === 'failed' ? 'blocked' : 'done');
    await this.pipeline.recordExecutionStateTransition({
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      stage: 'reviewed',
      intentDecision,
      note: 'supervision_reviewed',
      planId: planningResult?.planId,
      distributionId: distribution?.distributionId,
    });
    executionStateStages.push('reviewed');
    const supervisionInlineElapsedMs = Date.now() - inlineSupervisionStartedAt;
    const supervisionInlineBudgetMs = this.config.getCollabSupervisionInlineBudgetMs();
    this.logger.log('foundry.ceo.v2.execution_outcome', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      routePath,
      status: supervisionStatus,
      planId: planningResult?.planId ?? null,
      distributionId: distribution?.distributionId ?? null,
      supervisionInlineElapsedMs,
      supervisionInlineBudgetMs,
    });
    if (supervisionInlineElapsedMs > supervisionInlineBudgetMs) {
      this.logger.warn('foundry.ceo.v2.supervision.inline_budget_exceeded', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        planAnchorMessageId: resolvedPlanAnchor,
        turnMessageId,
        routingRootMessageId,
        runId: runId || undefined,
        supervisionInlineElapsedMs,
        supervisionInlineBudgetMs,
      });
    }
    const heavyTagged: Record<string, unknown> =
      supervisionResult && typeof supervisionResult === 'object' && !Array.isArray(supervisionResult)
        ? { ...(supervisionResult as unknown as Record<string, unknown>), ceoStructuredContract: '2026.pr4' }
        : { value: supervisionResult, ceoStructuredContract: '2026.pr4' };
    const finalTextProvenance = usedOrchestrationNl ? 'orchestration_nl' : 'supervision';
    this.logger.log('foundry.ceo.v2.supervision.path', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      distributionId: distributionPlan.distributionId,
      supervisionResultSource: 'skill_execution',
      supervisionMode: 'inline',
    });
    return {
      intentContract: 'legacy_intent_v1',
      routePath,
      intentDecision,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'Supervisor executed inline (non-temporal).',
        payload: {
          planning: planningResult,
          distribution,
          supervision: true,
          supervisionMode: 'inline',
          supervisionResultSource: 'skill_execution',
          distributionId: distributionPlan.distributionId,
          executionStateStages,
          heavyExecutionOutput: heavyTagged,
          ceoStructuredContract: '2026.pr4',
          fastFinalText: inlineText,
          fastReplySource: usedOrchestrationNl ? 'supervision_inline_orchestration_nl' : 'supervision_inline',
          finalTextProvenance,
        },
      },
    };
  }
}
