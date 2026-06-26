import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  CollaborationIntentDecisionV20261,
  IntentDecision,
  IntentRoutePath,
} from '@contracts/types';
import {
  NextStep,
  type LightStructuredOutputV2,
} from '@foundry/contracts/types/collaboration';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
  MainRoomLeadMemoryContext,
  RunMainRoomFlowParams,
  RunMainRoomPostIntentRouteParams,
} from './collaboration-pipeline-v2.types.js';
import { buildMemoryLayerRoomHint } from './memory-layer-room-hint.util.js';
import {
  buildStrategyCeoPackMemoryQuerySuffix,
  resolveStrategyPlanningProfile,
} from '../strategy-planning-profile.util.js';
import {
  intentDecisionWithResolvedTargetIds,
  mapWithConcurrency,
  patchUnifiedRoutingTargetIds,
  sanitizeUnifiedUserFacingForMultiDirectGroup,
  stripCeoFromAudienceMultiSummonTargets,
} from './direct-group-reply-policy.util.js';
import { DirectCollabReplyService } from '../direct-collab-reply.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { AgentExecutionService } from '../../agents/services/agent-execution.service.js';
import { CompanyCortexService } from '../../company-runtime/company-cortex.service.js';
import { MemoryCrossCutService } from '../memory/memory-cross-cut.service.js';
import type {
  IntentDecision as CollaborationIntentDecision2026,
  RoomContext,
} from '../contracts/collaboration-2026.contracts.js';
import { buildRoomMemberPromptBlock, RoomContextService } from '../context/room-context.service.js';
import { planIncludesBlock } from '../context/context-grounding-plan.js';
import { MainRoomAudienceRoutingContextService } from '../intent/main-room-audience-routing-context.service.js';
import type { CollaborationMainRoomFlowService } from './main-room-flow.service.js';
import type { CollaborationMainRoomIntentService } from './main-room-intent.service.js';
import type { CollaborationMainRoomReplayService } from './main-room-replay.service.js';
import type { CollaborationMainRoomSupervisionService } from './main-room-supervision.service.js';
import type { CollaborationMainRoomOrchestrationService } from './main-room-orchestration.service.js';
import type { CollaborationPipelineRuleFallbackService } from './pipeline-rule-fallback.service.js';
import {
  lazyCollaborationMainRoomFlowService,
  lazyCollaborationMainRoomIntentService,
  lazyCollaborationMainRoomOrchestrationService,
  lazyCollaborationMainRoomReplayService,
  lazyCollaborationMainRoomSupervisionService,
  lazyCollaborationPipelineRuleFallbackService,
} from './pipeline-v2.forward-ref.js';
import { resolvePipelineRoutePath } from './pipeline-v2-route-path.util.js';
import { logSwallowedSideEffect } from './pipeline-side-effect.util.js';

@Injectable()
export class CollaborationPipelineV2Service {
  private readonly logger = new Logger(CollaborationPipelineV2Service.name);

  constructor(
    private readonly config: ConfigService,
    private readonly roomContextService: RoomContextService,
    private readonly directReply: DirectCollabReplyService,
    private readonly agentExecution: AgentExecutionService,
    private readonly companyCortex: CompanyCortexService,
    private readonly memoryCrossCutService: MemoryCrossCutService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    @Inject(forwardRef(lazyCollaborationPipelineRuleFallbackService))
    private readonly ruleFallback: CollaborationPipelineRuleFallbackService,
    @Inject(forwardRef(lazyCollaborationMainRoomReplayService))
    private readonly replay: CollaborationMainRoomReplayService,
    @Inject(forwardRef(lazyCollaborationMainRoomSupervisionService))
    private readonly supervision: CollaborationMainRoomSupervisionService,
    @Inject(forwardRef(lazyCollaborationMainRoomFlowService))
    private readonly flow: CollaborationMainRoomFlowService,
    @Inject(forwardRef(lazyCollaborationMainRoomIntentService))
    private readonly intent: CollaborationMainRoomIntentService,
    @Inject(forwardRef(lazyCollaborationMainRoomOrchestrationService))
    private readonly orchestration: CollaborationMainRoomOrchestrationService,
  ) {}

  /** 规则兜底路由：直连或治理入口（供 {@link CollaborationPipelineRuleFallbackService} 调用）。 */
  async dispatchRuleFallbackRoute(
    intentDecision: IntentDecision,
    input: CollaborationPipelineV2RunInput,
    routePath: IntentRoutePath,
  ): Promise<CollaborationPipelineV2RunResult> {
    if (routePath === 'direct_agent' || routePath === 'direct_group') {
      return this.handleDirectedReplyPath(intentDecision, input);
    }
    return this.handleCeoGovernanceEntry(intentDecision, input, routePath, undefined);
  }

  async buildMainRoomStrategyPlanningUserContent(
    params: Parameters<CollaborationMainRoomFlowService['buildMainRoomStrategyPlanningUserContent']>[0],
  ): Promise<string> {
    return this.flow.buildMainRoomStrategyPlanningUserContent(params);
  }

  prepareMainRoomAudienceRoutingRecognizeContext(
    params: Parameters<MainRoomAudienceRoutingContextService['prepareMainRoomAudienceRoutingRecognizeContext']>[0],
  ): ReturnType<MainRoomAudienceRoutingContextService['prepareMainRoomAudienceRoutingRecognizeContext']> {
    return this.flow.prepareMainRoomAudienceRoutingRecognizeContext(params);
  }

  async fastReply(params: Parameters<CollaborationMainRoomFlowService['fastReply']>[0]): Promise<void> {
    return this.flow.fastReply(params);
  }

  async runMainRoomFlow(params: RunMainRoomFlowParams): Promise<CollaborationPipelineV2RunResult> {
    return this.flow.runMainRoomFlow(params);
  }

  async runDeferredHeavyPipeline(
    params: Parameters<
      import('./main-room-flow.service.js').CollaborationMainRoomFlowService['runDeferredHeavyPipeline']
    >[0],
  ): Promise<CollaborationPipelineV2RunResult> {
    return this.flow.runDeferredHeavyPipeline(params);
  }

  async runMainRoomPostIntentRoute(
    params: RunMainRoomPostIntentRouteParams,
  ): Promise<CollaborationPipelineV2RunResult | null> {
    return this.flow.runMainRoomPostIntentRoute(params);
  }

  async runDepartmentRoomDirectorModelReply(
    params: Parameters<CollaborationMainRoomFlowService['runDepartmentRoomDirectorModelReply']>[0],
  ): Promise<{ handled: boolean; directorAgentId?: string; reason?: string }> {
    return this.flow.runDepartmentRoomDirectorModelReply(params);
  }

  async run(input: CollaborationPipelineV2RunInput): Promise<CollaborationPipelineV2RunResult> {
    let roomContext: RoomContext;
    try {
      roomContext = await this.roomContextService.buildRoomContext({
        companyId: input.companyId,
        roomId: input.roomId,
      });
    } catch (err: unknown) {
      this.logger.warn('pipeline_v2_room_context_failed_fallback_legacy_intent', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        err: err instanceof Error ? err.message : String(err),
      });
      return this.ruleFallback.runRuleFallbackPipeline(input, 'room_context_failed');
    }

    if (roomContext.roomType === 'main') {
      return this.flow.runMainRoomFlow({ input, roomContext });
    }

    return this.ruleFallback.runRuleFallbackPipeline(input, 'non_main_room');
  }

  async runRuleFallbackPipeline(
    input: CollaborationPipelineV2RunInput,
    reason: 'room_context_failed' | 'non_main_room',
  ): Promise<CollaborationPipelineV2RunResult> {
    return this.ruleFallback.runRuleFallbackPipeline(input, reason);
  }

  async runMainRoomPipelineViaIntentLayer(
    inputParam: CollaborationPipelineV2RunInput,
    roomContext: RoomContext,
    traceId: string,
  ): Promise<CollaborationPipelineV2RunResult> {
    return this.intent.runMainRoomPipelineViaIntentLayer(inputParam, roomContext, traceId);
  }

  buildLegacyIntentDecisionFromUnifiedPipeline(
    params: Parameters<CollaborationMainRoomIntentService['buildLegacyIntentDecisionFromUnifiedPipeline']>[0],
  ): IntentDecision {
    return this.intent.buildLegacyIntentDecisionFromUnifiedPipeline(params);
  }

  finalizeMainRoomIntentLayerState(
    layerFromAudience: CollaborationIntentDecision2026,
    input: CollaborationPipelineV2RunInput,
  ): RunMainRoomPostIntentRouteParams['mergedMainRoom'] {
    return this.intent.finalizeMainRoomIntentLayerState(layerFromAudience, input);
  }

  buildDepartmentRoomDirectorStubLayerDecision(
    params: Parameters<CollaborationMainRoomIntentService['buildDepartmentRoomDirectorStubLayerDecision']>[0],
  ): CollaborationIntentDecision2026 {
    return this.intent.buildDepartmentRoomDirectorStubLayerDecision(params);
  }

  buildUnifiedIntentFromLayer(
    layerDecision: CollaborationIntentDecision2026,
    input: CollaborationPipelineV2RunInput,
    traceIdHint: string,
  ): CollaborationIntentDecisionV20261 {
    return this.intent.buildUnifiedIntentFromLayer(layerDecision, input, traceIdHint);
  }

  async applyMainRoomIntentSummonEnrichAndDirectorValidation(
    params: Parameters<CollaborationMainRoomIntentService['applyMainRoomIntentSummonEnrichAndDirectorValidation']>[0],
  ): Promise<void> {
    return this.intent.applyMainRoomIntentSummonEnrichAndDirectorValidation(params);
  }

  async executeMainRoomExplicitDirectedPath(
    params: Parameters<CollaborationMainRoomIntentService['executeMainRoomExplicitDirectedPath']>[0],
  ): Promise<CollaborationPipelineV2RunResult> {
    return this.intent.executeMainRoomExplicitDirectedPath(params);
  }

  executeMainRoomReplayUserFacingCopy(
    params: Parameters<CollaborationMainRoomReplayService['executeMainRoomReplayUserFacingCopy']>[0],
  ): Promise<CollaborationPipelineV2RunResult> {
    return this.replay.executeMainRoomReplayUserFacingCopy(params);
  }

  toLegacyIntentDecisionForMainFlow(params: {
    input: CollaborationPipelineV2RunInput;
    intentDecision: CollaborationIntentDecision2026;
  }): IntentDecision {
    const suggestedDepartments = params.intentDecision.targetDepartmentSlugs.slice(0, 12);
    return {
      schemaVersion: '1.0',
      intentType: params.intentDecision.intentType as any,
      targetMode: 'execution_pipeline',
      targetType: 'system',
      targetLayer: 'supervision',
      targetIds: [],
      confidence: params.intentDecision.confidence,
      messageCategory: 'chat',
      responseMode: params.intentDecision.routingHints.responseMode as any,
      shouldReply: true,
      shouldExecute: params.intentDecision.routingHints.shouldExecute,
      routingHints: {
        suggestedDepartments,
        requiresParallelism: params.intentDecision.routingHints.requiresParallelism,
        riskLevel: params.intentDecision.routingHints.riskLevel as any,
      },
      explanation: params.intentDecision.explanation,
      traceId: params.intentDecision.traceId,
      roomId: params.input.roomId,
      requestedBy: params.input.humanSenderId ?? 'human',
      classifierSource: 'hybrid',
      llmUsed: true,
      evidence: {},
      metadata: {
        routePath: 'supervision',
        source: 'intent_layer_service',
        intentDecision2026: params.intentDecision,
      },
    };
  }

  /**
   * 用户可见治理受理前缀；仅 `COLLAB_GOVERNANCE_ACK_VISIBLE=true` 时生成（默认关闭，供回滚/审计对照）。
   */
  private buildGovernanceAck(input: CollaborationPipelineV2RunInput, routePath: IntentRoutePath): string {
    if (!this.config.getCollabGovernanceAckVisible()) {
      return '';
    }
    const userText = String(input.contentText ?? '').trim().slice(0, 80);
    const prefix = userText ? `已收到：${userText}` : '已收到你的消息';
    if (routePath === 'execution') {
      return `${prefix}。我先完成治理受理，再分发到战略执行链路处理。`;
    }
    return `${prefix}。我先完成治理受理，再给出下一步回复。`;
  }

  /**
   * PR2：治理入口下游无可见正文时，用 `planning.goal` 或简短自然摘要填充（不使用 governanceAck）。
   */
  private resolveGovernanceEntrySurfaceFallbackText(
    input: CollaborationPipelineV2RunInput,
    payload: Record<string, unknown>,
  ): string {
    const planning = payload.planning;
    if (planning && typeof planning === 'object') {
      const goal = String((planning as Record<string, unknown>).goal ?? '').trim();
      if (goal) return goal.slice(0, 800);
    }
    const hint = String(input.contentText ?? '').trim().slice(0, 120);
    if (hint) {
      return `我看了你的消息，正在处理「${hint}」相关事项，有进展马上同步你。`;
    }
    return '我在跟进你刚才提的事项，有结果会第一时间告诉你。';
  }

  buildCollaborationPlanningResult2026FromCeoV2(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['buildCollaborationPlanningResult2026FromCeoV2']>
  ) {
    return this.orchestration.buildCollaborationPlanningResult2026FromCeoV2(...args);
  }

  pickOrchestrationReplyOptions(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['pickOrchestrationReplyOptions']>
  ) {
    return this.orchestration.pickOrchestrationReplyOptions(...args);
  }

  buildCeoApprovalPendingFastFinalText(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['buildCeoApprovalPendingFastFinalText']>
  ) {
    return this.orchestration.buildCeoApprovalPendingFastFinalText(...args);
  }

  handleOrchestrationPath(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['handleOrchestrationPath']>
  ) {
    return this.orchestration.handleOrchestrationPath(...args);
  }

  generateOrchestrationModelReply(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['generateOrchestrationModelReply']>
  ) {
    return this.orchestration.generateOrchestrationModelReply(...args);
  }

  enrichPlanningMetadataWithUnifiedL1Classifier(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['enrichPlanningMetadataWithUnifiedL1Classifier']>
  ) {
    return this.orchestration.enrichPlanningMetadataWithUnifiedL1Classifier(...args);
  }

  handleL1Path(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['handleL1Path']>
  ) {
    return this.orchestration.handleL1Path(...args);
  }

  ensureApprovalRequest(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['ensureApprovalRequest']>
  ) {
    return this.orchestration.ensureApprovalRequest(...args);
  }

  runMainRoomOrchestrationSupervisionCompletion(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['runMainRoomOrchestrationSupervisionCompletion']>
  ) {
    return this.orchestration.runMainRoomOrchestrationSupervisionCompletion(...args);
  }

  ensureCollaborationMainGoalFromDraft(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['ensureCollaborationMainGoalFromDraft']>
  ) {
    return this.orchestration.ensureCollaborationMainGoalFromDraft(...args);
  }

  emitStrategyGoalDraftSurfaceReply(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['emitStrategyGoalDraftSurfaceReply']>
  ) {
    return this.orchestration.emitStrategyGoalDraftSurfaceReply(...args);
  }

  flushMainRoomDistributionDispatchAfterConfirm(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['flushMainRoomDistributionDispatchAfterConfirm']>
  ) {
    return this.orchestration.flushMainRoomDistributionDispatchAfterConfirm(...args);
  }

  executeDeferredDispatchPlanFlush(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['executeDeferredDispatchPlanFlush']>
  ) {
    return this.orchestration.executeDeferredDispatchPlanFlush(...args);
  }

  patchDispatchPlanFlushFailedMetadata(
    ...args: Parameters<CollaborationMainRoomOrchestrationService['patchDispatchPlanFlushFailedMetadata']>
  ) {
    return this.orchestration.patchDispatchPlanFlushFailedMetadata(...args);
  }

  async handleCeoGovernanceEntry(
    intentDecision: IntentDecision,
    input: CollaborationPipelineV2RunInput,
    routePath: IntentRoutePath,
    chainOpts?: { memoryContext?: MainRoomLeadMemoryContext; roomContext?: RoomContext },
  ): Promise<CollaborationPipelineV2RunResult> {
    const governanceAck = this.buildGovernanceAck(input, routePath);

    const routed = await this.orchestration.handleL1Path(intentDecision, input, chainOpts);

    const payload = ((routed.output?.payload ?? {}) as Record<string, unknown>);
    const downstreamText = typeof payload.fastFinalText === 'string' ? String(payload.fastFinalText).trim() : '';
    if (governanceAck) {
      payload.fastFinalText = downstreamText ? `${governanceAck}\n\n${downstreamText}` : governanceAck;
      if (typeof payload.fastReplySource !== 'string' || !String(payload.fastReplySource).trim()) {
        payload.fastReplySource = 'governance_entry';
      }
      payload.governanceAck = true;
    } else {
      if (downstreamText) {
        payload.fastFinalText = downstreamText;
      } else {
        payload.fastFinalText = this.resolveGovernanceEntrySurfaceFallbackText(input, payload);
        const existingSource = typeof payload.fastReplySource === 'string' ? String(payload.fastReplySource).trim() : '';
        if (!existingSource) {
          payload.fastReplySource = 'governance_entry_surface_fallback';
        }
      }
      payload.governanceAck = false;
    }
    payload.governanceEntryRoute = routePath;
    if (intentDecision.messageCategory === 'report') {
      const monitorRecord = {
        eventType: 'ceo_report_intake',
        sourceMessageId: input.messageId,
        routingRootMessageId: input.routingRootMessageId ?? input.messageId,
        riskLevel: String(intentDecision.routingHints?.riskLevel ?? 'medium'),
        recordedAt: new Date().toISOString(),
      };
      payload.monitorRecord = monitorRecord;
      this.logger.log('ceo_v2.monitor.recorded', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        routePath,
        monitorRecord,
      });
    }

    return {
      ...routed,
      output: {
        ...routed.output,
        message: `Handled by governance entry (${routePath})`,
        payload,
      },
    };
  }

  async handleDirectedReplyPath(
    intentDecision: IntentDecision,
    input: CollaborationPipelineV2RunInput,
    options?: { intentDecision2026_1?: CollaborationIntentDecisionV20261; fastSingleAgentHandover?: boolean },
  ): Promise<CollaborationPipelineV2RunResult> {
    const unifiedRaw = options?.intentDecision2026_1;
    const maxDirected = this.config.getCollabMainRoomMaxDirectTargets();
    const sliced = this.getResolvedTargetAgentIds(intentDecision).slice(0, maxDirected);
    const stripped = stripCeoFromAudienceMultiSummonTargets({
      targetAgentIds: sliced,
      ceoAgentId: input.ceoAgentId,
      intentType: unifiedRaw?.intentType ?? intentDecision.intentType,
      mentionedAgentIds: input.mentionedAgentIds,
      enabled: this.config.isCollabMainRoomAudienceSummonStripCeoEnabled(),
    });
    if (stripped.length !== sliced.length) {
      this.logger.log('pipeline_v2.direct_group.ceo_stripped_from_audience_summon', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        beforeCount: sliced.length,
        afterCount: stripped.length,
      });
    }
    let unifiedP = patchUnifiedRoutingTargetIds(unifiedRaw, stripped);
    unifiedP = sanitizeUnifiedUserFacingForMultiDirectGroup(
      unifiedP,
      stripped.length,
      this.config.isCollabMainRoomMultiDirectSanitizeUserFacingEnabled(),
    );
    const intentForAgents = intentDecisionWithResolvedTargetIds(intentDecision, stripped);
    const completedAgentIds: string[] = [];
    const routePath = resolvePipelineRoutePath(intentForAgents);
    const fast = options?.fastSingleAgentHandover === true;
    const concurrency = this.config.getCollabMainRoomDirectReplyConcurrency();

    const rows = await mapWithConcurrency(stripped, concurrency, async (agentId) => {
      const generated = await this.generateDirectedAgentReply(
        agentId,
        intentForAgents,
        input,
        unifiedP,
        fast,
      );
      return { agentId, generated };
    });

    for (const { agentId, generated } of rows) {
      if (!generated?.text?.trim()) continue;
      const output: LightStructuredOutputV2 = {
        version: 'v2',
        nextStep: NextStep.STRUCTURED_REPLY,
        finalText: generated.text,
        commitmentText: input.contentText.slice(0, 400),
        suggestedTasks: [],
        memoryReferences: [],
        metadata: {
          pipeline: 'v2',
          routePath,
          targetMode: intentForAgents.targetMode,
          targetLayer: intentForAgents.targetLayer ?? undefined,
        },
      };
      await this.directReply.reply({
        companyId: input.companyId,
        roomId: input.roomId,
        agentId,
        sourceMessageId: input.messageId,
        threadId: input.threadId ?? null,
        output,
        generation: generated,
        roomType: 'main',
        ...(unifiedP ? { intentDecision2026_1: unifiedP } : {}),
      });
      completedAgentIds.push(agentId);
    }
    const baseOut = {
      routePath,
      intentDecision: intentForAgents,
      handledByV2: true,
      output: {
        status: 'ok' as const,
        message:
          completedAgentIds.length > 0
            ? `Handled by directed agent reply path (${completedAgentIds.length} responders).`
            : 'Directed routing resolved, but no in-room agent reply was generated.',
        payload: {
          inlineReplyHandled: completedAgentIds.length > 0,
          responderAgentIds: completedAgentIds,
        },
      },
    };
    if (unifiedP) {
      return {
        intentContract: 'unified_intent_v2026_1',
        ...baseOut,
        intentDecision2026_1: unifiedP,
      };
    }
    return { intentContract: 'legacy_intent_v1', ...baseOut };
  }

  extractRequestedRoles(userMessage: string): string[] {
    const text = String(userMessage ?? '').toLowerCase();
    const mapping: Array<{ role: string; re: RegExp }> = [
      { role: 'sales_director', re: /(销售总监|销售主管|sales director|head of sales)/i },
      { role: 'marketing_director', re: /(市场总监|市场主管|marketing director|head of marketing)/i },
      { role: 'operations_director', re: /(运营总监|运营主管|operations director|head of ops)/i },
      { role: 'finance_director', re: /(财务总监|cfo|finance director)/i },
      { role: 'product_director', re: /(产品总监|产品主管|product director)/i },
      { role: 'engineering_director', re: /(技术总监|研发总监|cto|engineering director)/i },
      { role: 'hr_director', re: /(人事总监|hr总监|hr director)/i },
    ];
    return mapping.filter((x) => x.re.test(text)).map((x) => x.role);
  }

  async generateDirectedAgentReply(
    agentId: string,
    intentDecision: IntentDecision,
    input: CollaborationPipelineV2RunInput,
    intentDecision2026_1?: CollaborationIntentDecisionV20261,
    fastSingleAgentHandover?: boolean,
  ) {
    const roomType =
      input.messageSource === 'department_direct_reply' ? ('department' as const) : ('main' as const);
    return this.agentExecution.executeDirect({
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      agentId,
      contentText: input.contentText,
      intentDecision,
      threadId: input.threadId ?? null,
      humanSenderId: input.humanSenderId ?? null,
      mentionedAgentIds: input.mentionedAgentIds,
      ceoAgentId: input.ceoAgentId ?? null,
      traceId: String(input.executionTokenId ?? input.messageId).trim(),
      intentDecision2026_1,
      fastSingleAgentHandover,
      collaborationExecutionContext: input.collaborationExecutionContext,
      roomType,
    });
  }

  getResolvedTargetAgentIds(intentDecision: IntentDecision): string[] {
    const meta =
      intentDecision.metadata && typeof intentDecision.metadata === 'object'
        ? (intentDecision.metadata as Record<string, unknown>)
        : {};
    const resolved = Array.isArray(meta.resolvedTargetAgentIds)
      ? meta.resolvedTargetAgentIds
      : intentDecision.targetIds;
    return Array.isArray(resolved)
      ? resolved.map((id) => String(id ?? '').trim()).filter(Boolean)
      : [];
  }

  async waitForHumanApprovalSignal(
    input: CollaborationPipelineV2RunInput,
    approvalRequestId: string,
  ): Promise<'approved' | 'rejected' | 'timeout'> {
    const timeoutAt = Date.now() + 10 * 60 * 1000;
    let backoffMs = 1_000;
    const maxBackoffMs = 15_000;
    while (Date.now() < timeoutAt) {
      const row = await firstValueFrom(
        this.apiRpc
          .send<{ status?: string }>('approval.findOne', {
            companyId: input.companyId,
            actor: this.workerActor(),
            approvalId: approvalRequestId,
          })
          .pipe(timeout({ first: 8_000 })),
      ).catch((err: unknown) => {
        this.logger.debug('pipeline_v2.approval_signal_rpc_failed', {
          companyId: input.companyId,
          approvalRequestId,
          message: err instanceof Error ? err.message : String(err),
        });
        return null;
      });
      const status = String(row?.status ?? '').trim().toLowerCase();
      if (status === 'approved' || status === 'rejected') return status;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    }
    return 'timeout';
  }

  /**
   * Intent 之后、Strategy 之前：CEO 完备知识包（房间名单 + Cortex 核心摘要 + 公司级 Memory 事实）。
   */
  async buildPostIntentCeoKnowledgePack(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    roomMemberPromptBlock: string;
    traceId: string;
  }): Promise<string> {
    const { input, roomContext, traceId } = params;
    const plan = input.collaborationExecutionContext?.contextGroundingPlan;
    const includeRoster = planIncludesBlock(plan, 'room_roster');
    const roster = includeRoster
      ? String(params.roomMemberPromptBlock ?? '').trim() ||
        buildRoomMemberPromptBlock(roomContext.memberDirectory ?? [])
      : '';

    const cortex = await this.companyCortex.getCompanyBrainContext({
      companyId: input.companyId,
      roomId: input.roomId,
      userMessage: input.contentText,
      includeProfileGapAssessment: false,
    });

    const deptLine = roomContext.orgSnapshot.departments
      .slice(0, 16)
      .map((d) => `${d.name}(${d.slug})`)
      .join('、');

    const cortexCore = [
      `room_members_count: ${cortex.roomMemberCount}`,
      `active_agents: ${cortex.activeAgentCount}`,
      `company_profile_hit: ${cortex.profileHit}`,
      deptLine ? `key_departments: ${deptLine}` : '',
      cortex.profile ? `company_profile_excerpt: ${cortex.profile.slice(0, 520)}` : '',
      cortex.strategicNotes?.length ? `strategic_notes: ${cortex.strategicNotes.join(' | ').slice(0, 600)}` : '',
      cortex.memorySignals?.length ? `memory_signals: ${cortex.memorySignals.join(' | ').slice(0, 600)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const pack = await this.memoryCrossCutService.retrieveTopCompanyFactsForCeoPack({
      companyId: input.companyId,
      roomId: input.roomId,
      traceId,
      query: `${input.contentText} ${buildStrategyCeoPackMemoryQuerySuffix(
        resolveStrategyPlanningProfile({
          messageCategory: input.messageCategory,
          contentText: input.contentText,
          mode: this.config.getStrategyPlanningProfileMode(),
        }),
      )}`.trim(),
      limit: 3,
      layerRoomHint: buildMemoryLayerRoomHint(roomContext),
    });

    const memoryBlock =
      pack.lines.length > 0
        ? `【公司级 Memory 事实 · Top ${pack.lines.length}】\n${pack.lines.map((x, i) => `${i + 1}. ${x.slice(0, 480)}`).join('\n')}`
        : '【公司级 Memory 事实】当前检索无命中（命名空间可能尚无写入）。';

    const sections = [
      '【CEO_POST_INTENT_KNOWLEDGE_PACK · v2026】以下内容与 Strategy / Orchestration 对齐为权威上下文；回答「公司 / 人员 / 情况」类问题必须优先据此推理。',
      ...(includeRoster && roster
        ? ['### A. room_members（完整 structured 名单）', roster]
        : []),
      '### B. company_cortex_core（人数 · 关键部门 · 档案与目标线索）',
      cortexCore || '(cortex empty)',
      '### C. recent_company_memory_facts',
      memoryBlock,
    ];
    return sections.join('\n\n');
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async loadExecutionStateSnapshot(companyId: string, roomId: string): Promise<string> {
    try {
      const hits = await firstValueFrom(
        this.apiRpc
          .send<Array<{ content?: string }>>('memory.search', {
            companyId,
            actor: this.workerActor(),
            query: `execution state room ${roomId} status transition`,
            topK: 4,
            namespace: `company:${companyId}:ceo:v2:execution_state`,
          })
          .pipe(timeout({ first: 1_500 })),
      );
      const lines = (Array.isArray(hits) ? hits : [])
        .map((x) => String(x?.content ?? '').trim())
        .filter(Boolean)
        .slice(0, 4);
      return lines.join('\n').slice(0, 1200);
    } catch (e: unknown) {
      this.logger.warn('pipeline_v2.execution_state_snapshot_load_failed', {
        companyId,
        roomId,
        message: e instanceof Error ? e.message : String(e),
      });
      return '';
    }
  }

  async recordExecutionStateTransition(input: {
    companyId: string;
    roomId: string;
    messageId: string;
    stage: 'proposed' | 'approved' | 'in_progress' | 'blocked' | 'done' | 'reviewed';
    intentDecision: IntentDecision;
    note: string;
    planId?: string;
    distributionId?: string;
  }): Promise<void> {
    this.logger.log('foundry.ceo.v2.task_state_transition', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      stage: input.stage,
      note: input.note,
      planId: input.planId ?? null,
      distributionId: input.distributionId ?? null,
    });
    await firstValueFrom(
      this.apiRpc
        .send('memory.entries.store', {
          companyId: input.companyId,
          actor: this.workerActor(),
          data: {
            namespace: `company:${input.companyId}:ceo:v2:execution_state`,
            collectionLabel: 'ceo_v2_execution_state',
            sourceType: 'summary',
            content: JSON.stringify({
              stage: input.stage,
              note: input.note,
              messageId: input.messageId,
              roomId: input.roomId,
              intentType: input.intentDecision.intentType,
              routePath:
                typeof input.intentDecision.metadata?.routePath === 'string'
                  ? input.intentDecision.metadata.routePath
                  : null,
              planId: input.planId ?? null,
              distributionId: input.distributionId ?? null,
              updatedAt: new Date().toISOString(),
            }),
            metadata: {
              source: 'collaboration.pipeline-v2',
              stage: input.stage,
              roomId: input.roomId,
              messageId: input.messageId,
              planId: input.planId ?? null,
              distributionId: input.distributionId ?? null,
            },
          },
        })
        .pipe(timeout({ first: 1_800 })),
    ).catch((err) =>
      logSwallowedSideEffect(this.logger, 'foundry.collaboration.execution_state_store_failed', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        stage: input.stage,
      }, err),
    );
  }

  executeSupervisionFlow(
    ...args: Parameters<CollaborationMainRoomSupervisionService['executeSupervisionFlow']>
  ): Promise<CollaborationPipelineV2RunResult> {
    return this.supervision.executeSupervisionFlow(...args);
  }
}
