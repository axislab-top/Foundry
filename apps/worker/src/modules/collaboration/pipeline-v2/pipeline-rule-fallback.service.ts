import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import type { IntentDecision } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';
import { isSummonRoutingIntentCeoV2 } from '../intent/intent-summon-routing.util.js';
import { userMessageIsPureCasual } from '../main-room-user-message.util.js';
import type { CollaborationPipelineV2Service } from './collaboration-pipeline-v2.service.js';
import { lazyCollaborationPipelineV2Service } from './pipeline-v2.forward-ref.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
} from './collaboration-pipeline-v2.types.js';
import { resolvePipelineRoutePath } from './pipeline-v2-route-path.util.js';
import { resolveAuthorizedHeavyExecution } from '../replay/main-room-replay-authorization.util.js';

export type PipelineRuleFallbackReason = 'room_context_failed' | 'non_main_room';

/** 非主群 / 房间上下文失败时的确定性路由兜底（**非**主群 Intent LLM 受众路由）。 */
@Injectable()
export class CollaborationPipelineRuleFallbackService {
  private readonly logger = new Logger(CollaborationPipelineRuleFallbackService.name);
  private readonly pipelineRuleFallbackCounter = metrics
    .getMeter('foundry.collaboration')
    .createCounter('foundry.collaboration.pipeline_rule_fallback.total');

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(lazyCollaborationPipelineV2Service))
    private readonly pipeline: CollaborationPipelineV2Service,
  ) {}

  /**
   * 非主群或房间上下文失败：不使用主群受众 LLM；按 mention / 授权重链 / 默认 CEO 编排规则兜底。
   */
  private buildRuleFallbackIntentDecision(
    input: CollaborationPipelineV2RunInput,
    reason: PipelineRuleFallbackReason,
  ): IntentDecision {
    const traceId = String(input.executionTokenId ?? input.messageId).trim();
    const ceo = String(input.ceoAgentId ?? '').trim();
    const rawIds = (input.mentionedAgentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);
    const ids = (ceo ? rawIds.filter((id) => id !== ceo) : rawIds).slice(
      0,
      this.config.getCollabMainRoomMaxDirectTargets(),
    );
    const text = String(input.contentText ?? '').trim();

    const heavyExecution = resolveAuthorizedHeavyExecution({
      contentText: text,
      messageCategory: input.messageCategory,
    });
    if (heavyExecution) {
      return {
        schemaVersion: '1.0',
        intentType: 'orchestration',
        targetMode: 'ceo_layer',
        targetType: 'system',
        targetIds: [],
        targetLayer: 'strategy',
        confidence: 0.68,
        messageCategory: 'task_publish',
        responseMode: 'execute_then_reply',
        shouldReply: true,
        shouldExecute: true,
        routingHints: {
          suggestedDepartments: [],
          requiresParallelism: true,
          riskLevel: 'medium',
        },
        explanation: `pipeline_rule_fallback:${reason}:authorized_heavy_execution`,
        traceId,
        roomId: input.roomId,
        requestedBy: input.humanSenderId ?? 'human',
        classifierSource: 'fallback',
        llmUsed: false,
        metadata: {
          routePath: 'execution',
          classifier: 'pipeline_rule_fallback',
          fallbackReason: reason,
        },
      };
    }

    if (ids.length > 0) {
      return {
        schemaVersion: '1.0',
        intentType: 'direct_summon',
        targetMode: ids.length > 1 ? 'multi_agent' : 'single_agent',
        targetType: 'agent',
        targetIds: ids,
        targetLayer: null,
        confidence: 0.72,
        messageCategory: (input.messageCategory as IntentDecision['messageCategory']) ?? 'chat',
        responseMode: 'direct_reply',
        shouldReply: true,
        shouldExecute: false,
        routingHints: {
          suggestedDepartments: [],
          requiresParallelism: false,
          riskLevel: 'low',
        },
        explanation: `pipeline_rule_fallback:${reason}:mention_direct`,
        traceId,
        roomId: input.roomId,
        requestedBy: input.humanSenderId ?? 'human',
        classifierSource: 'fallback',
        llmUsed: false,
        metadata: {
          routePath: ids.length > 1 ? 'direct_group' : 'direct_agent',
          classifier: 'pipeline_rule_fallback',
          fallbackReason: reason,
        },
      };
    }

    if (userMessageIsPureCasual(text)) {
      return {
        schemaVersion: '1.0',
        intentType: 'audience_resolution',
        targetMode: 'ceo_layer',
        targetType: 'system',
        targetIds: [],
        targetLayer: 'orchestration',
        confidence: 0.55,
        messageCategory: (input.messageCategory as IntentDecision['messageCategory']) ?? 'chat',
        responseMode: 'direct_reply',
        shouldReply: true,
        shouldExecute: false,
        routingHints: {
          suggestedDepartments: [],
          requiresParallelism: false,
          riskLevel: 'low',
        },
        explanation: `pipeline_rule_fallback:${reason}:casual_orchestration`,
        traceId,
        roomId: input.roomId,
        requestedBy: input.humanSenderId ?? 'human',
        classifierSource: 'fallback',
        llmUsed: false,
        metadata: {
          classifier: 'pipeline_rule_fallback',
          fallbackReason: reason,
        },
      };
    }

    return {
      schemaVersion: '1.0',
      intentType: 'orchestration',
      targetMode: 'ceo_layer',
      targetType: 'system',
      targetIds: [],
      targetLayer: 'orchestration',
      confidence: 0.52,
      messageCategory: (input.messageCategory as IntentDecision['messageCategory']) ?? 'chat',
      responseMode: 'direct_reply',
      shouldReply: true,
      shouldExecute: false,
      routingHints: {
        suggestedDepartments: [],
        requiresParallelism: false,
        riskLevel: 'medium',
      },
      explanation: `pipeline_rule_fallback:${reason}:default_orchestration`,
      traceId,
      roomId: input.roomId,
      requestedBy: input.humanSenderId ?? 'human',
      classifierSource: 'fallback',
      llmUsed: false,
      metadata: {
        routePath: 'orchestration',
        classifier: 'pipeline_rule_fallback',
        fallbackReason: reason,
      },
    };
  }

  async runRuleFallbackPipeline(
    input: CollaborationPipelineV2RunInput,
    reason: PipelineRuleFallbackReason,
  ): Promise<CollaborationPipelineV2RunResult> {
    this.pipelineRuleFallbackCounter.add(1, { reason });
    this.logger.log('pipeline_v2.rule_fallback_intent', {
      reason,
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
    });
    const baseIntent = this.buildRuleFallbackIntentDecision(input, reason);
    const routePath = resolvePipelineRoutePath(baseIntent);

    this.logger.log('pipeline_v2_route_decided', {
      event: 'foundry.ceo.v2.enabled',
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      routePath,
      intentType: baseIntent.intentType,
      confidence: baseIntent.confidence,
      classifier: 'pipeline_rule_fallback',
      isSummonIntent: isSummonRoutingIntentCeoV2(baseIntent),
    });

    return this.pipeline.dispatchRuleFallbackRoute(baseIntent, input, routePath);
  }
}
