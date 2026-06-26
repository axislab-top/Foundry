import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { MessagingService } from '@service/messaging';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api';
import type {
  BaseEvent,
  CollaborationChatMessageIngestedV2Event,
  CollaborationExecutionCompletedV2Event,
  CollaborationExecutionLifecycleV1Event,
  CollaborationExecutionStateChangedV2Event,
  CollaborationHeartbeatCorrelationPayload,
  CollaborationIntentClassifiedV20261Event,
  CollaborationIntentClassifiedV2Event,
  CollaborationMessageProcessFailedV2Event,
  CollaborationMessageReceivedEvent,
} from '@contracts/events';
import type {
  CeoV2ChatMessageMetadata,
  CeoV2DistributionDraft,
  CollaborationIntentDecisionV20261,
  DistributionPlan,
  PlanningResult,
} from '@contracts/types';
import { migrateLegacyPlanningResultToStrategicPhases } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';
import { serializeUnknownErrorForLog } from '../../../common/logging/serialize-unknown-error.js';
import { TenantContextService } from '@service/tenant';
import { resolveObservabilityRoutePath } from './route-path-observability.util.js';
import { CollaborationPipelineV2Coordinator } from './collaboration-pipeline-v2.coordinator.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
} from './collaboration-pipeline-v2.types.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import { resolvePipelineUnifiedIntentDecision } from './collaboration-pipeline-v2.types.js';
import { snapshotUnifiedIntentForPublish } from './intent-snapshot.util.js';
import type { HeavyExecutionOutput } from '@foundry/contracts/types/collaboration';
import { CeoV2TemporalService } from '../ceo/v2/ceo-v2-temporal.service.js';
import { buildRoomMemberPromptBlock, RoomContextService } from '../context/room-context.service.js';
import { DepartmentDirectReplyService } from '../director/department-direct-reply.service.js';
import { EmployeeAutonomousService } from '../../agents/employee-autonomous.service.js';
import { MainRoomRoundtableService } from '../main-room-roundtable.service.js';
import {
  buildOrchestrationLifecyclePatch,
  extractSupervisionObservabilityFromPayload,
  mapMainRoomFlowToOrchestrationTerminal,
} from './map-main-room-orchestration-terminal.util.js';
import {
  buildMainRoomPipelinePhases,
  mergeOrchestrationMetadata,
} from './pipeline-phase-snapshot.util.js';
import { ResponderThinkingPublisher } from './responder-thinking.publisher.js';
import { MainRoomDispatchCompensationService } from '../dispatch/main-room-dispatch-compensation.service.js';
import { buildCeoOrchestrationStreamId } from '../llm/collaboration-llm-token-stream.service.js';
import { resolveThinkingResponders } from './responder-thinking.util.js';
import { runWithMainRoomFlowTimeout } from './main-room-flow-timeout.util.js';
import type { MainRoomHeavyPipelineKind } from './main-room-heavy-pipeline-entry.util.js';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';

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

function parseClientFeatureFlagsFromMessageMeta(metaRec: Record<string, unknown>): string[] | undefined {
  const raw = metaRec['clientFeatureFlags'] ?? metaRec['ff'] ?? metaRec['featureFlags'];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;&\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

/** 与 `contracts/events` 路由键对齐（避免 Worker Jest 加载 `@contracts/events` dist ESM）。 */
const COLLABORATION_MESSAGE_RECEIVED_LEGACY_RK = 'collaboration.message.received' as const;
const COLLABORATION_CHAT_MESSAGE_INGESTED_V2_RK = 'collaboration.chat.message.ingested.v2' as const;

function parseHeartbeatCorrelationFromMessageMeta(
  metaRec: Record<string, unknown>,
): CollaborationHeartbeatCorrelationPayload | undefined {
  const nested = metaRec.heartbeatCorrelation;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const o = nested as Record<string, unknown>;
    const id = typeof o.heartbeatRunId === 'string' ? o.heartbeatRunId.trim() : '';
    if (!id) return undefined;
    return {
      heartbeatRunId: id,
      tickAt: typeof o.tickAt === 'string' ? o.tickAt : undefined,
      triggerSource: typeof o.triggerSource === 'string' ? o.triggerSource : undefined,
      runKind:
        o.runKind === 'heartbeat' || o.runKind === 'breakdown' || o.runKind === 'graph' ? o.runKind : undefined,
      mainRoomId: typeof o.mainRoomId === 'string' ? o.mainRoomId : o.mainRoomId === null ? null : undefined,
      collaborationSurfaceRoomId:
        typeof o.collaborationSurfaceRoomId === 'string'
          ? o.collaborationSurfaceRoomId
          : o.collaborationSurfaceRoomId === null
            ? null
            : undefined,
    };
  }
  const flatId = typeof metaRec.heartbeatRunId === 'string' ? metaRec.heartbeatRunId.trim() : '';
  if (!flatId) return undefined;
  return {
    heartbeatRunId: flatId,
    tickAt: typeof metaRec.heartbeatTickAt === 'string' ? metaRec.heartbeatTickAt : undefined,
    triggerSource:
      typeof metaRec.heartbeatTriggerSource === 'string' ? metaRec.heartbeatTriggerSource : undefined,
    runKind:
      metaRec.heartbeatRunKind === 'heartbeat' ||
      metaRec.heartbeatRunKind === 'breakdown' ||
      metaRec.heartbeatRunKind === 'graph'
        ? metaRec.heartbeatRunKind
        : undefined,
    mainRoomId: typeof metaRec.heartbeatMainRoomId === 'string' ? metaRec.heartbeatMainRoomId : undefined,
    collaborationSurfaceRoomId:
      typeof metaRec.heartbeatSurfaceRoomId === 'string' ? metaRec.heartbeatSurfaceRoomId : undefined,
  };
}

/**
 * v2 message entrypoint listener.
 *
 * W12：同一队列绑定 legacy `collaboration.message.received` 与领域入站 `collaboration.chat.message.ingested.v2`（互斥发布）。
 *
 * 领域出站（`collaboration.task-delegation.requested`、`employee.task.propose`、`collaboration.agent-message.domain.v2`）
 * 仍由 Dispatcher / Director / Employee / Tasks 发布。
 */
@Injectable()
export class CollaborationPipelineV2Listener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationPipelineV2Listener.name);
  private readonly tracer = trace.getTracer('foundry.collaboration.listener');
  private readonly meter = metrics.getMeter('foundry.collaboration');
  private readonly messageInCounter = this.meter.createCounter('foundry.collaboration.listener.message_in_total');
  private readonly listenerLatency = this.meter.createHistogram('foundry.collaboration.listener.handle_latency_ms');

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly pipelineCoordinator: CollaborationPipelineV2Coordinator,
    private readonly temporal: CeoV2TemporalService,
    private readonly roomContextService: RoomContextService,
    private readonly departmentDirectReply: DepartmentDirectReplyService,
    private readonly employeeAutonomous: EmployeeAutonomousService,
    private readonly mainRoomRoundtable: MainRoomRoundtableService,
    private readonly responderThinking: ResponderThinkingPublisher,
    private readonly dispatchCompensation: MainRoomDispatchCompensationService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    const inboundRoutingKeys = [COLLABORATION_MESSAGE_RECEIVED_LEGACY_RK, COLLABORATION_CHAT_MESSAGE_INGESTED_V2_RK];
    this.messaging.subscribeWithBackoff<CollaborationMessageReceivedEvent | CollaborationChatMessageIngestedV2Event>(
      'collaboration.pipeline.v2.chat_message_inbound',
      async (event) => this.handleMessageReceived(event),
      {
        queue: 'worker-collaboration-message-v2-pipeline-queue',
        routingKey: inboundRoutingKeys,
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  async handleMessageReceived(
    event: CollaborationMessageReceivedEvent | CollaborationChatMessageIngestedV2Event,
  ): Promise<void> {
    const startedAt = Date.now();
    const companyId = String(event?.companyId ?? '').trim();
    const roomId = String(event?.data?.roomId ?? '').trim();
    const messageId = String(event?.data?.messageId ?? '').trim();
    if (!companyId || !roomId || !messageId) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
    const runId = randomUUID();
    this.messageInCounter.add(1, { eventType: event.eventType });
    const span = this.tracer.startSpan('foundry.collaboration.listener.handle_message_received', {
      attributes: {
        'foundry.company_id': companyId,
        'foundry.room_id': roomId,
        'foundry.message_id': messageId,
        'foundry.run_id': runId,
        'foundry.collaboration.inbound_event_type': event.eventType,
      },
    });

    let mainRoomOrchestrationTracked = false;
    let mainRoomOrchestrationSucceeded = false;
    let activeThinkingResponderIds: string[] = [];
    // [阶段1.1] flow 是否已在「生成前」发过 thinking（经 onResponderThinking 回调）。
    // 为 true 时跳过 flow 返回后的兜底 thinking 发布，避免重复气泡。
    let flowPublishedThinking = false;

    // Only process user-authored text messages (not automated system notices).
    const messageType = String(event?.data?.messageType ?? '').trim();
    if (messageType && messageType !== 'text') return;

    try {
      const msg = await this.rpc<ChatMessageRow>('collaboration.messages.get', {
        companyId,
        actor: this.workerActor(),
        messageId,
      });
      const senderType = String(msg?.senderType ?? event?.data?.senderType ?? '').trim().toLowerCase();
      const contentText = String(msg?.content ?? '').trim();
      const meta = msg?.metadata ?? {};
      const metaRec = meta as Record<string, unknown>;

      // W10：员工 Agent 发言 → {@link EmployeeAutonomousService}（任务/custom/部门房；双开关 + 公司 bundle）。
      if (senderType === 'agent') {
        if (contentText.trim()) {
          const roomContextEarly = await this.roomContextService.buildRoomContext({ companyId, roomId });
          const ea = await this.employeeAutonomous.tryHandleAgentCollaborationMessage({
            companyId,
            roomId,
            messageId,
            threadId: msg.threadId ?? event.data.threadId ?? null,
            contentText,
            senderAgentId: String(msg.senderId ?? event.data.senderId ?? '').trim(),
            roomContext: roomContextEarly,
            mentionedAgentIds: Array.isArray(metaRec.mentionedAgentIds)
              ? (metaRec.mentionedAgentIds as string[])
                  .map((id) => String(id ?? '').trim())
                  .filter(Boolean)
                  .slice(0, 12)
              : [],
            mentionedNodeIds: Array.isArray(metaRec.mentionedNodeIds)
              ? (metaRec.mentionedNodeIds as string[])
                  .map((id) => String(id ?? '').trim())
                  .filter(Boolean)
                  .slice(0, 12)
              : [],
            clientFeatureFlags: parseClientFeatureFlagsFromMessageMeta(metaRec),
          });
          if (ea.handled) {
            this.logger.log('foundry.employee.autonomous.handled', {
              companyId,
              roomId,
              messageId,
              elapsedMs: Date.now() - startedAt,
            });
          }
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return;
      }

      // Guard against self-trigger loops: only human-originated messages should enter CEO v2 pipeline below.
      if (senderType !== 'human') return;
      if (!contentText) return;

      const persistedMessageType = String(msg?.messageType ?? event?.data?.messageType ?? '').trim().toLowerCase();
      const automatedSource = String(metaRec.source ?? '').trim();
      if (
        persistedMessageType === 'system' ||
        automatedSource === 'department_task_stage_message' ||
        automatedSource === 'task_governance_summary' ||
        automatedSource === 'task_governance_report' ||
        (typeof metaRec.sourceEventId === 'string' && metaRec.sourceEventId.trim().length > 0)
      ) {
        this.logger.debug('foundry.collaboration.listener.skip_automated_system_message', {
          companyId,
          roomId,
          messageId,
          persistedMessageType,
          automatedSource: automatedSource || null,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return;
      }

      const roomContext = await this.roomContextService.buildRoomContext({ companyId, roomId });

      // W9：部门 / 任务房间优先走 {@link DepartmentDirectReplyService} → Director 自主子图 + 委派事件链。
      // direct（私聊）走 rule fallback 管道（W9.1，见下方分支）；custom 房间走主群 CEO 管道。
      if (roomContext.roomType === 'department' || roomContext.roomType === 'task') {
        const deptMessageCategory =
          typeof metaRec.messageCategory === 'string' ? String(metaRec.messageCategory).trim() : null;
        const direct = await this.departmentDirectReply.reply({
          companyId,
          roomId,
          messageId,
          threadId: msg.threadId ?? event.data.threadId ?? null,
          contentText,
          roomContext,
          mentionedAgentIds: Array.isArray(metaRec.mentionedAgentIds)
            ? (metaRec.mentionedAgentIds as string[]).map((id) => String(id ?? '').trim()).filter(Boolean).slice(0, 12)
            : [],
          mentionedNodeIds: Array.isArray(metaRec.mentionedNodeIds)
            ? (metaRec.mentionedNodeIds as string[]).map((id) => String(id ?? '').trim()).filter(Boolean).slice(0, 12)
            : [],
          humanSenderId: msg.senderId ?? event.data.senderId ?? null,
          ceoAgentId: null,
          messageCategory: deptMessageCategory,
          clientFeatureFlags: parseClientFeatureFlagsFromMessageMeta(metaRec),
        });
        if (direct.handled) {
          this.logger.log('foundry.department.direct_reply.handled', {
            companyId,
            roomId,
            messageId,
            directorAgentId: direct.directorAgentId,
            elapsedMs: Date.now() - startedAt,
          });
        } else {
          this.logger.warn('foundry.department.direct_reply.skipped', {
            companyId,
            roomId,
            messageId,
            reason: direct.reason ?? 'unknown',
            elapsedMs: Date.now() - startedAt,
          });
          await this.appendDepartmentDirectReplyFailureNotice({
            companyId,
            roomId,
            messageId,
            threadId: msg.threadId ?? event.data.threadId ?? null,
            reason: direct.reason ?? 'unknown',
            contentPreview: contentText,
          });
        }
        return;
      }

      // W9.1：direct（私聊）房间走 rule fallback → handleDirectedReplyPath（轻量 LLM 对话 + 自动持久化）。
      // 不进主群 CEO 编排 / 审计 / Temporal 重链。
      if (roomContext.roomType === 'direct') {
        // 从房间成员中提取对方 agent id，注入 mentionedAgentIds 使 rule fallback
        // 生成 direct_summon intent → dispatchRuleFallbackRoute → handleDirectedReplyPath。
        const directRoomAgentIds = roomContext.members
          .filter((m) => m.memberType === 'agent')
          .map((m) => m.memberId)
          .filter(Boolean);
        this.logger.log('foundry.direct_room.entry', {
          companyId,
          roomId,
          messageId,
          memberCount: roomContext.members.length,
          agentIds: directRoomAgentIds,
          memberTypes: roomContext.members.map((m) => m.memberType),
        });
        const directInput: CollaborationPipelineV2RunInput = {
          companyId,
          roomId,
          messageId,
          runId,
          contentText,
          senderType: msg.senderType ?? event.data.senderType,
          messageSource: event.eventType,
          threadId: msg.threadId ?? event.data.threadId ?? null,
          mentionedAgentIds: directRoomAgentIds,
          ceoAgentId: null,
          humanSenderId: (msg.senderType ?? event.data.senderType) === 'human' ? (msg.senderId ?? event.data.senderId ?? null) : null,
          roomMemberPromptBlock: buildRoomMemberPromptBlock(roomContext.memberDirectory ?? []),
        };
        try {
          const directOut = await this.pipelineCoordinator.run(directInput);
          const directPayload = (directOut.output?.payload ?? {}) as Record<string, unknown>;
          this.logger.log('foundry.direct_room.pipeline_completed', {
            companyId,
            roomId,
            messageId,
            routePath: directOut.routePath,
            intentType: directOut.intentDecision.intentType,
            handledByV2: directOut.handledByV2,
            inlineReplyHandled: Boolean(directPayload.inlineReplyHandled),
            responderAgentIds: directPayload.responderAgentIds,
            outputMessage: directOut.output?.message,
            elapsedMs: Date.now() - startedAt,
          });
        } catch (directErr: unknown) {
          this.logger.error('foundry.direct_room.pipeline_failed', {
            companyId,
            roomId,
            messageId,
            error: directErr instanceof Error ? directErr.message : String(directErr),
            stack: directErr instanceof Error ? directErr.stack?.slice(0, 500) : undefined,
            elapsedMs: Date.now() - startedAt,
          });
          await this.publishMessageProcessFailed({
            companyId,
            roomId,
            messageId,
            error: directErr instanceof Error ? directErr.message : String(directErr),
          });
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return;
      }

      const mentionedAgentIds = Array.from(
        new Set(
          [
            ...(Array.isArray(event.data.mentionedAgentIds) ? event.data.mentionedAgentIds : []),
            ...(Array.isArray(metaRec.mentionedAgentIds) ? (metaRec.mentionedAgentIds as string[]) : []),
          ]
            .map((id) => String(id ?? '').trim())
            .filter(Boolean),
        ),
      ).slice(0, 12);
      const mentionedNodeIds = Array.from(
        new Set(
          [
            ...(Array.isArray(event.data.mentionedNodeIds) ? event.data.mentionedNodeIds : []),
            ...(Array.isArray(metaRec.mentionedNodeIds) ? (metaRec.mentionedNodeIds as string[]) : []),
          ]
            .map((id) => String(id ?? '').trim())
            .filter(Boolean),
        ),
      ).slice(0, 12);

      const ceoAgentId = await this.resolveCeoAgentId(companyId).catch((err) => {
        this.logger.warn('foundry.collaboration.ceo_resolve_failed', {
          companyId,
          roomId,
          messageId,
          err: err instanceof Error ? err.message : String(err),
        });
        return null;
      });
      if (!ceoAgentId) {
        this.logger.error('foundry.collaboration.ceo_agent_missing', { companyId, roomId, messageId });
        await this.publishMessageProcessFailed({
          companyId,
          roomId,
          messageId,
          traceId: String(event.data.traceId ?? messageId).trim() || undefined,
          error: 'ceo_agent_not_found: no active CEO agent for company',
        });
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'ceo_agent_not_found' });
        return;
      }

      const heartbeatCorrelation = parseHeartbeatCorrelationFromMessageMeta(metaRec);

      const input: CollaborationPipelineV2RunInput = {
        companyId,
        roomId,
        messageId,
        runId,
        routingRootMessageId: (event.data.traceId ?? undefined) || undefined,
        contentText,
        senderType: msg.senderType ?? event.data.senderType,
        messageSource: event.eventType,
        threadId: msg.threadId ?? event.data.threadId ?? null,
        mentionedAgentIds,
        mentionedNodeIds,
        messageCategory:
          typeof (meta as Record<string, unknown>)?.messageCategory === 'string'
            ? String((meta as Record<string, unknown>).messageCategory)
            : null,
        ceoAgentId,
        forcedMode: typeof (meta as any).forceCollaborationMode === 'string' ? String((meta as any).forceCollaborationMode) : null,
        executionTokenId: typeof (meta as any).executionTokenId === 'string' ? String((meta as any).executionTokenId) : undefined,
        approvalRequestId: typeof (meta as any).approvalRequestId === 'string' ? String((meta as any).approvalRequestId) : undefined,
        postApprovalSilent: Boolean((meta as any).postApprovalSilent),
        alreadyHeavyProcessed: Boolean((meta as any).alreadyHeavyProcessed),
        humanSenderId: (msg.senderType ?? event.data.senderType) === 'human' ? (msg.senderId ?? event.data.senderId ?? null) : null,
        confirmationIntent:
          typeof metaRec.confirmationIntent === 'string' ? String(metaRec.confirmationIntent) : null,
        userConfirmedExecution: metaRec.userConfirmedExecution === true,
        userConfirmedDispatchFlush: metaRec.userConfirmedDispatchFlush === true,
        messageMetadata: metaRec,
        roomMemberPromptBlock: buildRoomMemberPromptBlock(roomContext.memberDirectory ?? []),
        ...(heartbeatCorrelation ? { heartbeatCorrelation } : {}),
        ...(() => {
          const flags: string[] = [];
          if (Array.isArray(metaRec.featureFlags)) {
            for (const x of metaRec.featureFlags as unknown[]) {
              const s = String(x ?? '').trim();
              if (s) flags.push(s);
            }
          }
          const ffRaw = metaRec.ff ?? metaRec['?ff'];
          if (typeof ffRaw === 'string' && ffRaw.trim()) {
            for (const s of ffRaw.split(/[,;]+/)) {
              const t = s.trim();
              if (t) flags.push(t);
            }
          }
          return flags.length ? { clientFeatureFlags: [...new Set(flags)].slice(0, 24) } : {};
        })(),
      };

      mainRoomOrchestrationTracked = true;
      const routingTraceId = String(input.routingRootMessageId ?? messageId).trim();
      this.responderThinking.publishBestEffort({
        companyId,
        roomId,
        sourceMessageId: messageId,
        status: 'routing',
        responderAgentIds: [],
        roomType: 'main',
        runId,
        traceId: routingTraceId,
      });

      const out = await runWithMainRoomFlowTimeout(() =>
        this.pipelineCoordinator.runMainRoomFlow({
          input,
          roomContext,
          // [阶段1.1] flow 在确定接话人、开始生成之前回调；此处即时发"正在思考"。
          // 这样最常见的 CEO 内联/直连回复也能在 LLM 生成前先出现思考气泡。
          onResponderThinking: (notice) => {
            const ids = notice.agentIds.map((id) => String(id ?? '').trim()).filter(Boolean);
            if (ids.length === 0) return;
            flowPublishedThinking = true;
            activeThinkingResponderIds = ids;
            this.responderThinking.publishBestEffort({
              companyId,
              roomId,
              sourceMessageId: messageId,
              status: 'thinking',
              responderAgentIds: ids,
              routePath: notice.routePath,
              intentType: notice.intentType,
              ceoLayer: notice.ceoLayer,
              roomType: 'main',
              runId,
              traceId: routingTraceId,
            });
          },
        }),
      );

      const payloadRecord =
        typeof out.output?.payload === 'object' && out.output.payload !== null
          ? (out.output.payload as Record<string, unknown>)
          : null;
      const traceId = String(input.routingRootMessageId ?? messageId).trim();
      const planningPayload = payloadRecord?.planning as Record<string, unknown> | undefined;
      const planningLegacyPayload = payloadRecord?.planningLegacy as Record<string, unknown> | undefined;
      const planAnchorMessageId = String(
        (typeof planningPayload?.traceId === 'string' && planningPayload.traceId.trim()) ||
          (typeof planningLegacyPayload?.traceId === 'string' && planningLegacyPayload.traceId.trim()) ||
          (typeof out.intentDecision.traceId === 'string' && out.intentDecision.traceId.trim()) ||
          messageId,
      ).trim();
      span.setAttribute('foundry.plan_anchor_message_id', planAnchorMessageId);
      span.setAttribute('foundry.routing_root_message_id', traceId);

      const correlationAuditFields = {
        turnMessageId: messageId,
        planAnchorMessageId,
        routingRootMessageId: traceId,
        runId,
      } as const;

      const temporalWorkflowId = this.readTemporalWorkflowId(out.output?.payload);
      const executionMode = this.resolveExecutionMode(out.routePath, temporalWorkflowId);
      const orchestrationSnapshot = this.extractOrchestrationSnapshot(out.output?.payload);
      const executionStateStages = this.extractExecutionStateStages(out.output?.payload);
      const fastReplySource = this.readFastReplySource(out.output?.payload);

      const orchTerminal = mapMainRoomFlowToOrchestrationTerminal(out, { executionStateStages });
      void this.upsertOrchestrationRunBestEffort({
        companyId,
        roomId,
        sourceMessageId: messageId,
        workerRunId: runId,
        status: orchTerminal.status,
        stage: orchTerminal.stage,
        errorCode: orchTerminal.errorCode,
        errorMessage: orchTerminal.errorMessage,
        metadata: orchTerminal.metadata,
      });
      mainRoomOrchestrationSucceeded = true;

      let intentSnapshotForAudit: Record<string, unknown>;
      try {
        intentSnapshotForAudit = globalThis.structuredClone
          ? (structuredClone(out.intentDecision) as unknown as Record<string, unknown>)
          : ({ ...(out.intentDecision as object) } as unknown as Record<string, unknown>);
      } catch {
        intentSnapshotForAudit = { ...(out.intentDecision as object) } as unknown as Record<string, unknown>;
      }

      // 1) Publish audit events：默认双写 legacy v2 + 2026.1；`COLLAB_INTENT_SINGLE_PUBLISH_V20261` 开启后仅 SSOT
      if (!this.config.isCollabIntentSinglePublishV20261Enabled()) {
        await this.publish<CollaborationIntentClassifiedV2Event>({
          eventType: 'collaboration.intent.classified.v2',
          aggregateType: 'chat_message',
          aggregateId: messageId,
          companyId,
          data: {
            messageId,
            roomId,
            traceId,
            turnMessageId: messageId,
            planAnchorMessageId,
            routingRootMessageId: traceId,
            runId,
            intentDecision: intentSnapshotForAudit,
            routePath: out.routePath,
            executionMode,
            resultSummary: out.output?.message,
            classifiedAt: new Date().toISOString(),
            ...(input.heartbeatCorrelation ? { heartbeatCorrelation: input.heartbeatCorrelation } : {}),
          },
        });
      }

      const unifiedIntent: CollaborationIntentDecisionV20261 | undefined = resolvePipelineUnifiedIntentDecision(
        out,
        payloadRecord,
      );

      const inlineReplyHandledEarly = Boolean(
        (out.output?.payload as Record<string, unknown> | undefined)?.inlineReplyHandled ||
          (out.output?.payload as Record<string, unknown> | undefined)?.roomWriteHandled,
      );
      const thinkingResolved = resolveThinkingResponders({
        routePath: out.routePath,
        intentType: out.intentDecision.intentType,
        ceoAgentId,
        intentDecision2026: unifiedIntent,
        inlineReplyHandled: inlineReplyHandledEarly,
      });
      // [阶段1.1] 兜底：仅当 flow 未在生成前发过 thinking 时（如 legacy 路径 / 关闭 turn-tool 编排），
      // 才用生成后的 routePath 解析结果补发，避免与 onResponderThinking 重复。
      if (!flowPublishedThinking) {
        activeThinkingResponderIds = thinkingResolved.agentIds;
        if (thinkingResolved.agentIds.length > 0) {
          this.responderThinking.publishBestEffort({
            companyId,
            roomId,
            sourceMessageId: messageId,
            status: 'thinking',
            responderAgentIds: thinkingResolved.agentIds,
            routePath: out.routePath,
            intentType: out.intentDecision.intentType,
            ceoLayer: thinkingResolved.ceoLayer,
            roomType: 'main',
            runId,
            traceId,
          });
        }
      }

      // [阶段0.1] 主群链路追踪 SSOT：单行可看出最终走了哪条路。
      // 与 `foundry.collaboration.main_room.intent_decision_2026_1`（intentType/confidence）、
      // `foundry.collaboration.main_room.route_decision`（前置 routeKind）、
      // `foundry.replay.execution_delegate.authorization`（replay 授权结果）按 traceId/runId join 成完整决策链。
      const routeObs = resolveObservabilityRoutePath({
        routePath: out.routePath,
        inlineReplyHandled: inlineReplyHandledEarly,
        deferHeavy: payloadRecord?.deferHeavyPipeline === true,
      });
      this.logger.log('foundry.collaboration.main_room.turn_outcome', {
        companyId,
        roomId,
        messageId,
        traceId,
        runId,
        intentType: out.intentDecision.intentType,
        routePath: routeObs.routePath,
        ...(routeObs.routePathAlias ? { routePathAlias: routeObs.routePathAlias } : {}),
        executionMode,
        temporalWorkflowId: temporalWorkflowId ?? null,
        inlineReplyHandled: inlineReplyHandledEarly,
        thinkingResponderCount: thinkingResolved.agentIds.length,
        ceoLayer: thinkingResolved.ceoLayer ?? null,
        fastReplySource: fastReplySource ?? null,
      });

      // [阶段 2.2] 即时接话已写入房间后，异步跑重编排（dispatch plan / goal lock），不阻塞本回合返回。
      if (payloadRecord?.deferHeavyPipeline === true && payloadRecord.replayHeavyPipelineKind) {
        const heavyKind = String(payloadRecord.replayHeavyPipelineKind).trim() as MainRoomHeavyPipelineKind;
        const deferLayerRaw = payloadRecord.deferHeavyIntentDecision2026;
        const unifiedForDefer = unifiedIntent ?? resolvePipelineUnifiedIntentDecision(out, payloadRecord);
        if (
          heavyKind &&
          unifiedForDefer &&
          deferLayerRaw &&
          typeof deferLayerRaw === 'object' &&
          !Array.isArray(deferLayerRaw)
        ) {
          void this.pipelineCoordinator
            .runDeferredHeavyPipeline({
              input,
              roomContext,
              traceId,
              heavyKind,
              intentDecision2026: deferLayerRaw as CollaborationIntentDecision2026,
              intentDecision2026_1: unifiedForDefer,
            })
            .then(async (heavyOut) => {
              this.logger.log('foundry.collaboration.main_room.deferred_heavy_completed', {
                companyId,
                roomId,
                messageId,
                traceId,
                routePath: heavyOut.routePath,
                heavyKind,
              });
              if (!ceoAgentId) return;
              try {
                await this.finalizeDeferredHeavyOrchestrationOutcome({
                  heavyOut,
                  companyId,
                  roomId,
                  messageId,
                  traceId,
                  runId,
                  input,
                  roomContext,
                  ceoAgentId,
                  temporalWorkflowId,
                  executionMode,
                  fastReplySource: fastReplySource ?? 'main_room_deferred_heavy',
                });
              } catch (finalizeErr: unknown) {
                this.logger.error('foundry.collaboration.main_room.deferred_heavy_finalize_failed', {
                  companyId,
                  roomId,
                  messageId,
                  traceId,
                  heavyKind,
                  routePath: heavyOut.routePath,
                  err: finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr),
                });
              }
            })
            .catch((e: unknown) => {
              const errMessage = e instanceof Error ? e.message : String(e);
              this.logger.error('foundry.collaboration.main_room.deferred_heavy_failed', {
                companyId,
                roomId,
                messageId,
                traceId,
                heavyKind,
                err: errMessage,
              });
              const ceoAgentId = String(input.ceoAgentId ?? '').trim();
              if (ceoAgentId) {
                void this.dispatchCompensation
                  .notifyDeferredHeavyFailure({
                    companyId,
                    mainRoomId: roomId,
                    threadId: input.threadId,
                    ceoAgentId,
                    sourceMessageId: messageId,
                    heavyKind,
                    traceId,
                    errMessage,
                  })
                  .catch((notifyErr: unknown) =>
                    this.logger.warn('foundry.collaboration.main_room.deferred_heavy_notify_failed', {
                      companyId,
                      roomId,
                      messageId,
                      traceId,
                      heavyKind,
                      err: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
                    }),
                  );
              }
            });
        }
      }

      if (unifiedIntent) {
        const unifiedIntentSnapshot = snapshotUnifiedIntentForPublish(unifiedIntent);
        const meta =
          out.intentDecision.metadata && typeof out.intentDecision.metadata === 'object'
            ? (out.intentDecision.metadata as Record<string, unknown>)
            : null;
        const deprecatedAt = this.config.getCollaborationIntentClassifiedV20261DeprecatedAt();
        await this.publish<CollaborationIntentClassifiedV20261Event>({
          eventType: 'collaboration.intent.classified.v2026_1',
          aggregateType: 'chat_message',
          aggregateId: messageId,
          companyId,
          data: {
            schemaVersion: unifiedIntentSnapshot.schemaVersion ?? '2026.1',
            originalMessageId: messageId,
            roomId,
            companyId,
            traceId,
            turnMessageId: messageId,
            planAnchorMessageId,
            routingRootMessageId: traceId,
            runId,
            roomType: roomContext.roomType,
            messageCategory: input.messageCategory ?? null,
            ...(deprecatedAt ? { deprecatedAt } : {}),
            intentDecision: unifiedIntentSnapshot as CollaborationIntentDecisionV20261,
            legacyMapping: {
              routePath: out.routePath,
              legacyIntentType: String(out.intentDecision.intentType ?? ''),
              legacyConfidence: Number(out.intentDecision.confidence ?? 0),
              classifier: typeof meta?.['classifier'] === 'string' ? String(meta['classifier']) : undefined,
            },
            occurredAt: new Date().toISOString(),
            ...(input.heartbeatCorrelation ? { heartbeatCorrelation: input.heartbeatCorrelation } : {}),
          },
        });
      }
      const legacyPerStage = this.config.isCollabExecutionStateLegacyPerStage();
      const lifecycleSingle = this.config.isCollabExecutionLifecycleSingleEvent();
      if (executionStateStages.length > 0 && lifecycleSingle) {
        const terminalStage = executionStateStages[executionStateStages.length - 1]!;
        await this.publish<CollaborationExecutionLifecycleV1Event>({
          eventType: 'collaboration.execution.lifecycle.v1',
          aggregateType: 'chat_message',
          aggregateId: messageId,
          companyId,
          data: {
            messageId,
            roomId,
            traceId,
            ...correlationAuditFields,
            routePath: out.routePath,
            stages: executionStateStages,
            terminalStage,
            executionMode,
            changedAt: new Date().toISOString(),
            ...(input.heartbeatCorrelation ? { heartbeatCorrelation: input.heartbeatCorrelation } : {}),
          },
        });
      }
      const emitLegacyStages =
        legacyPerStage || (!lifecycleSingle && executionStateStages.length > 0);
      if (emitLegacyStages) {
        for (const stage of executionStateStages) {
          await this.publish<CollaborationExecutionStateChangedV2Event>({
            eventType: 'collaboration.execution.state_changed.v2',
            aggregateType: 'chat_message',
            aggregateId: messageId,
            companyId,
            data: {
              messageId,
              roomId,
              traceId,
              ...correlationAuditFields,
              routePath: out.routePath,
              stage,
              executionMode,
              changedAt: new Date().toISOString(),
              ...(input.heartbeatCorrelation ? { heartbeatCorrelation: input.heartbeatCorrelation } : {}),
            },
          });
        }
      }

      // 2) Write back to room (quick/orchestration) or wait supervision output and write final
      const payloadRecEarly = out.output?.payload as Record<string, unknown> | undefined;
      const roomWriteHandled = Boolean(payloadRecEarly?.roomWriteHandled);
      const inlineReplyHandled = Boolean(payloadRecEarly?.inlineReplyHandled) || roomWriteHandled;
      if (inlineReplyHandled) {
        this.logger.log('foundry.ceo.v2.message.appended', {
          companyId,
          roomId,
          messageId,
          mode: roomWriteHandled ? 'room_write_handled' : 'direct_inline',
        });
      } else if (temporalWorkflowId) {
        // supervision path: append provisional start + wait for completion
        await this.appendAgentMessage({
          companyId,
          roomId,
          agentId: ceoAgentId,
          content: '已启动 CEO v2 执行流程，正在按 DAG 顺序编排各部门任务（含 Supervisor 门闸与可选跨部门协调）…',
          threadId: input.threadId ?? undefined,
          provisional: true,
          metadata: this.buildCeoV2Metadata({
            intentType: out.intentDecision.intentType,
            confidence: out.intentDecision.confidence,
            traceId,
            workflowId: temporalWorkflowId,
            executionMode,
            planningSummary: orchestrationSnapshot.planningSummary,
            distributionCount: orchestrationSnapshot.distributionCount,
            executionSemantics: orchestrationSnapshot.executionSemantics,
            ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
            directReplyToMessageId: messageId,
            fastReplySource,
          }),
        });

        void this.upsertOrchestrationRunBestEffort({
          companyId,
          roomId,
          sourceMessageId: messageId,
          workerRunId: runId,
          ...buildOrchestrationLifecyclePatch({
            lifecycle: 'supervising',
            terminalKind: 'supervision',
            stage: 'supervision',
            metadataPatch: {
              routePath: out.routePath,
              executionMode: 'async',
              temporalWorkflowId,
              executionStateStages,
              lifecycleStages: executionStateStages,
              distributionTaskCount: orchestrationSnapshot.distributionCount,
            },
          }),
        });

        const supervisionResult = await this.waitHeavyWithProvisionalUpdates({
          companyId,
          roomId,
          agentId: ceoAgentId,
          threadId: input.threadId ?? undefined,
          traceId,
          intentType: out.intentDecision.intentType,
          confidence: out.intentDecision.confidence,
          workflowId: temporalWorkflowId,
          planningSummary: orchestrationSnapshot.planningSummary,
          distributionCount: orchestrationSnapshot.distributionCount,
          executionSemantics: orchestrationSnapshot.executionSemantics,
          ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
          timeoutMs: 20 * 60 * 1000,
        });

        const finalText = this.buildHeavyFinalText(supervisionResult);
        await this.appendAgentMessage({
          companyId,
          roomId,
          agentId: ceoAgentId,
          content: finalText,
          threadId: input.threadId ?? undefined,
          provisional: false,
          metadata: this.buildCeoV2Metadata({
            intentType: out.intentDecision.intentType,
            confidence: out.intentDecision.confidence,
            traceId,
            workflowId: temporalWorkflowId,
            executionMode,
            planningSummary: orchestrationSnapshot.planningSummary,
            distributionCount: orchestrationSnapshot.distributionCount,
            executionSemantics: orchestrationSnapshot.executionSemantics,
            ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
            finalSummary: this.extractHeavyFinalSummary(supervisionResult),
            directReplyToMessageId: messageId,
            fastReplySource,
          }),
        });
        this.logger.log('foundry.ceo.v2.message.appended', { companyId, roomId, messageId, mode: 'supervision' });

        const heavyLegacyObs =
          supervisionResult && typeof supervisionResult === 'object' && !Array.isArray(supervisionResult)
            ? (supervisionResult as unknown as Record<string, unknown>)
            : null;
        const temporalObsPayload: Record<string, unknown> = {
          heavyExecutionOutputLegacy: heavyLegacyObs,
          supervisionResultSource: 'temporal_department',
        };
        const temporalSupervisionObs = extractSupervisionObservabilityFromPayload(temporalObsPayload);
        const completedLifecyclePatch = buildOrchestrationLifecyclePatch({
          lifecycle: 'completed',
          terminalKind: 'program_complete',
          stage: String(out.routePath ?? 'supervision').trim() || 'supervision',
          metadataPatch: {
            routePath: out.routePath,
            executionMode: 'async',
            temporalWorkflowId,
            ...temporalSupervisionObs,
            executionStateStages,
            lifecycleStages: executionStateStages,
            distributionTaskCount: orchestrationSnapshot.distributionCount,
          },
        });
        void this.upsertOrchestrationRunBestEffort({
          companyId,
          roomId,
          sourceMessageId: messageId,
          workerRunId: runId,
          status: completedLifecyclePatch.status,
          stage: completedLifecyclePatch.stage,
          metadata: mergeOrchestrationMetadata(orchTerminal.metadata, completedLifecyclePatch.metadata),
        });

        await this.publish<CollaborationExecutionCompletedV2Event>({
          eventType: 'collaboration.execution.completed.v2',
          aggregateType: 'chat_message',
          aggregateId: messageId,
          companyId,
          data: {
            messageId,
            roomId,
            traceId,
            ...correlationAuditFields,
            temporalWorkflowId,
            executionMode,
            heavyExecutionOutput: supervisionResult as unknown as Record<string, unknown>,
            completedAt: new Date().toISOString(),
          },
        });
      } else if (
        out.routePath === 'approval'
      ) {
        const payload = out.output?.payload as Record<string, unknown> | undefined;
        const finalText = this.buildApprovalFinalText(payload);
        await this.appendAgentMessage({
          companyId,
          roomId,
          agentId: ceoAgentId,
          content: finalText,
          threadId: input.threadId ?? undefined,
          provisional: false,
          metadata: this.buildCeoV2Metadata({
            intentType: out.intentDecision.intentType,
            confidence: out.intentDecision.confidence,
            traceId,
            workflowId: temporalWorkflowId,
            executionMode,
            planningSummary: orchestrationSnapshot.planningSummary,
            distributionCount: orchestrationSnapshot.distributionCount,
            executionSemantics: orchestrationSnapshot.executionSemantics,
            ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
            directReplyToMessageId: messageId,
            approvalRequestId:
              typeof payload?.approvalRequestId === 'string' ? String(payload.approvalRequestId) : undefined,
            approvalStatus: typeof payload?.approvalStatus === 'string' ? String(payload.approvalStatus) : undefined,
            fastReplySource,
          }),
        });
        this.logger.log('foundry.ceo.v2.message.appended', { companyId, roomId, messageId, mode: 'approval' });
      } else if (out.routePath === 'strategy_contract_failed') {
        const payload = out.output?.payload as Record<string, unknown> | undefined;
        const text =
          typeof payload?.fastFinalText === 'string' && payload.fastFinalText.trim()
            ? String(payload.fastFinalText).trim()
            : '本轮战略目标契约未通过系统校验，暂无法继续编排。请调整需求描述后重试。';
        await this.appendAgentMessage({
          companyId,
          roomId,
          agentId: ceoAgentId,
          content: text,
          threadId: input.threadId ?? undefined,
          provisional: false,
          metadata: this.buildCeoV2Metadata({
            intentType: out.intentDecision.intentType,
            confidence: out.intentDecision.confidence,
            traceId,
            workflowId: temporalWorkflowId,
            executionMode,
            planningSummary: orchestrationSnapshot.planningSummary,
            distributionCount: orchestrationSnapshot.distributionCount,
            executionSemantics: orchestrationSnapshot.executionSemantics,
            ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
            directReplyToMessageId: messageId,
            fastReplySource,
          }),
        });
        this.logger.log('foundry.ceo.v2.message.appended', { companyId, roomId, messageId, mode: 'strategy_contract_failed' });
      } else if (
        out.routePath === 'dispatch_plan' ||
        out.routePath === 'dispatch_plan_flush' ||
        out.routePath === 'dispatch_plan_failed' ||
        out.routePath === 'dispatch_compile_failed' ||
        out.routePath === 'dispatch_assign_failed'
      ) {
        const payload = out.output?.payload as Record<string, unknown> | undefined;
        const text =
          typeof payload?.fastFinalText === 'string' && payload.fastFinalText.trim()
            ? String(payload.fastFinalText).trim()
            : out.routePath === 'dispatch_plan_flush'
              ? payload?.deferDistributionFlush === true
                ? '执行计划已生成，正在向各部门下发…'
                : '执行计划已编译并向各部门下发。'
              : out.routePath === 'dispatch_assign_failed'
                ? '部门派活未能完成，请查看说明后重试。'
                : '执行计划处理未完成，请调整任务描述后重试。';
        const dispatchPlan =
          payload?.dispatchPlan && typeof payload.dispatchPlan === 'object'
            ? (payload.dispatchPlan as Record<string, unknown>)
            : undefined;
        const appendedPlanMessageId = await this.appendAgentMessage({
          companyId,
          roomId,
          agentId: ceoAgentId,
          content: text.slice(0, 8000),
          threadId: input.threadId ?? undefined,
          provisional: false,
          metadata: {
            ...this.buildCeoV2Metadata({
              intentType: out.intentDecision.intentType,
              confidence: out.intentDecision.confidence,
              traceId,
              workflowId: temporalWorkflowId,
              executionMode,
              planningSummary: orchestrationSnapshot.planningSummary,
              distributionCount: orchestrationSnapshot.distributionCount,
              executionSemantics: orchestrationSnapshot.executionSemantics,
              ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
              directReplyToMessageId: messageId,
              fastReplySource,
              kind:
                out.routePath === 'dispatch_plan' || out.routePath === 'dispatch_plan_flush'
                  ? out.routePath
                  : undefined,
              routePath: out.routePath,
            }),
            ...(dispatchPlan
              ? {
                  dispatchPlan: {
                    planId: dispatchPlan.planId,
                    planRevision: dispatchPlan.planRevision,
                    goal: dispatchPlan.goal,
                    assignments: dispatchPlan.assignments,
                    executionOrder: dispatchPlan.executionOrder,
                  },
                  pendingDistributionConfirm: payload?.pendingDistributionConfirm === true,
                  dispatched:
                    out.routePath === 'dispatch_plan_flush' && payload?.deferDistributionFlush !== true,
                  flushPending: payload?.flushPending === true,
                }
              : {}),
            ...(out.routePath === 'dispatch_assign_failed'
              ? {
                  routePath: 'dispatch_assign_failed',
                  dispatchAssignFailure: payload?.dispatchAssignFailure ?? null,
                }
              : {}),
          },
        });
        let flushSucceeded = out.routePath !== 'dispatch_plan_flush' || payload?.deferDistributionFlush !== true;
        if (
          out.routePath === 'dispatch_plan_flush' &&
          payload?.deferDistributionFlush === true &&
          payload?.distributionLegacy &&
          typeof payload.distributionLegacy === 'object' &&
          payload?.dispatchPlan &&
          typeof payload.dispatchPlan === 'object'
        ) {
          const flushParams = {
            input,
            roomContext,
            intentDecision: out.intentDecision,
            distributionLegacy: payload.distributionLegacy as import('@contracts/types').DistributionPlan,
            planDoc: payload.dispatchPlan as import('@contracts/types').CeoDispatchPlanDocument,
            traceId,
            planMessageId: appendedPlanMessageId,
          };
          const runFlush = () => this.pipelineCoordinator.executeDeferredDispatchPlanFlush(flushParams);
          try {
            await runFlush();
            flushSucceeded = true;
          } catch (firstErr: unknown) {
            const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
            this.logger.warn('main_room.dispatch_plan.deferred_flush_failed_retry', {
              companyId,
              roomId,
              messageId,
              planMessageId: appendedPlanMessageId,
              error: firstMsg,
            });
            try {
              await runFlush();
              flushSucceeded = true;
            } catch (retryErr: unknown) {
              flushSucceeded = false;
              const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
              if (appendedPlanMessageId) {
                await this.pipelineCoordinator.patchDispatchPlanFlushFailedMetadata({
                  companyId,
                  planMessageId: appendedPlanMessageId,
                  flushError: retryMsg.slice(0, 500),
                  flushPending: true,
                });
              }
              this.logger.error('main_room.dispatch_plan.deferred_flush_failed', {
                companyId,
                roomId,
                messageId,
                planMessageId: appendedPlanMessageId,
                error: retryMsg,
              });
            }
          }
        }
        if (
          (out.routePath === 'dispatch_plan' || out.routePath === 'dispatch_plan_flush') &&
          flushSucceeded
        ) {
          const dispatchLifecyclePatch = buildOrchestrationLifecyclePatch({
            lifecycle:
              out.routePath === 'dispatch_plan_flush' && flushSucceeded ? 'dept_executing' : 'awaiting_confirm',
            terminalKind:
              out.routePath === 'dispatch_plan_flush' && flushSucceeded ? 'dispatch_plan_flush' : 'dispatch_plan',
            stage: out.routePath,
            metadataPatch: {
              routePath: out.routePath,
              distributionTaskCount: orchestrationSnapshot.distributionCount,
              planMessageId: appendedPlanMessageId ?? null,
              pendingDistributionConfirm: payload?.pendingDistributionConfirm === true,
            },
          });
          void this.upsertOrchestrationRunBestEffort({
            companyId,
            roomId,
            sourceMessageId: messageId,
            workerRunId: runId,
            status: dispatchLifecyclePatch.status,
            stage: dispatchLifecyclePatch.stage,
            metadata: dispatchLifecyclePatch.metadata,
          });
        }
        this.logger.log('foundry.ceo.v2.message.appended', {
          companyId,
          roomId,
          messageId,
          mode: out.routePath,
        });
      } else if (out.routePath === 'strategy_goal_draft') {
        /** 草稿正文已由 `DirectCollabReplyService.reply` 写入；勿再追加「已生成规划与分发结果」占位句 */
        const draftHandled = Boolean((out.output?.payload as Record<string, unknown> | undefined)?.inlineReplyHandled);
        if (!draftHandled) {
          const finalText = this.buildOrchestrationFinalText(out);
          await this.appendAgentMessage({
            companyId,
            roomId,
            agentId: ceoAgentId,
            content: finalText,
            threadId: input.threadId ?? undefined,
            provisional: false,
            metadata: this.buildCeoV2Metadata({
              intentType: out.intentDecision.intentType,
              confidence: out.intentDecision.confidence,
              traceId,
              workflowId: temporalWorkflowId,
              executionMode,
              planningSummary: orchestrationSnapshot.planningSummary,
              distributionCount: orchestrationSnapshot.distributionCount,
              executionSemantics: orchestrationSnapshot.executionSemantics,
              ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
              directReplyToMessageId: messageId,
              fastReplySource,
              streamId: this.resolveCeoOrchestrationStreamId(messageId, ceoAgentId),
            }),
          });
        }
        this.logger.log('foundry.ceo.v2.message.appended', {
          companyId,
          roomId,
          messageId,
          mode: draftHandled ? 'strategy_goal_draft_listener_skip' : 'strategy_goal_draft_fallback_text',
        });
      } else if (
        !inlineReplyHandled &&
        out.routePath !== 'program_ssot' &&
        out.routePath !== 'collaboration_turn' &&
        (out.routePath === 'execution' ||
          out.routePath === 'orchestration' ||
          out.routePath === 'supervision' ||
          out.routePath === 'org_dispatch' ||
          out.routePath === 'broadcast_dispatch')
      ) {
        const finalText = this.buildOrchestrationFinalText(out);
        const payloadRec = out.output?.payload as Record<string, unknown> | undefined;
        const distributionDraft = this.parseDistributionDraftSurface(payloadRec?.distributionDraftSurface);
        await this.appendAgentMessage({
          companyId,
          roomId,
          agentId: ceoAgentId,
          content: finalText,
          threadId: input.threadId ?? undefined,
          provisional: false,
          metadata: this.buildCeoV2Metadata({
            intentType: out.intentDecision.intentType,
            confidence: out.intentDecision.confidence,
            traceId,
            workflowId: temporalWorkflowId,
            executionMode,
            planningSummary: orchestrationSnapshot.planningSummary,
            distributionCount: orchestrationSnapshot.distributionCount,
            executionSemantics: orchestrationSnapshot.executionSemantics,
            ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
            directReplyToMessageId: messageId,
            fastReplySource,
            distributionDraft,
            streamId: this.resolveCeoOrchestrationStreamId(messageId, ceoAgentId),
          }),
        });
        this.logger.log('foundry.ceo.v2.message.appended', { companyId, roomId, messageId, mode: 'orchestration' });
      } else if (
        (out.routePath === 'direct_agent' || out.routePath === 'direct_group') &&
        !inlineReplyHandled
      ) {
        await this.appendAgentMessage({
          companyId,
          roomId,
          agentId: ceoAgentId,
          content:
            '指定成员暂未生成回复。你可以稍后重试、重新 @ 相关同事，或 @CEO 由主群编排继续处理。',
          threadId: input.threadId ?? undefined,
          provisional: false,
          metadata: this.buildCeoV2Metadata({
            intentType: out.intentDecision.intentType,
            confidence: out.intentDecision.confidence,
            traceId,
            workflowId: null,
            executionMode,
            directReplyToMessageId: messageId,
            fastReplySource: 'direct_reply_empty_fallback',
          }),
        });
        this.logger.log('foundry.ceo.v2.message.appended', {
          companyId,
          roomId,
          messageId,
          mode: 'direct_reply_empty',
        });
      } else if (out.routePath === 'replay_delegate_error') {
        const finalText = this.buildOrchestrationFinalText(out);
        await this.appendAgentMessage({
          companyId,
          roomId,
          agentId: ceoAgentId,
          content: finalText,
          threadId: input.threadId ?? undefined,
          provisional: false,
          metadata: this.buildCeoV2Metadata({
            intentType: out.intentDecision.intentType,
            confidence: out.intentDecision.confidence,
            traceId,
            workflowId: null,
            executionMode,
            directReplyToMessageId: messageId,
            fastReplySource: 'main_room_replay_delegate_error',
          }),
        });
        this.logger.log('foundry.ceo.v2.message.appended', {
          companyId,
          roomId,
          messageId,
          mode: 'replay_delegate_error',
        });
      } else if (
        inlineReplyHandled &&
        (out.routePath === 'direct_agent' || out.routePath === 'direct_group')
      ) {
        this.logger.log('foundry.ceo.v2.message.appended', {
          companyId,
          roomId,
          messageId,
          mode: 'direct_conversation_inline',
        });
      } else {
        // strategy/orchestration non-supervision path: write summary output
        const finalText = this.buildOrchestrationSummaryText(out.output?.payload);
        await this.appendAgentMessage({
          companyId,
          roomId,
          agentId: ceoAgentId,
          content: finalText,
          threadId: input.threadId ?? undefined,
          provisional: false,
          metadata: this.buildCeoV2Metadata({
            intentType: out.intentDecision.intentType,
            confidence: out.intentDecision.confidence,
            traceId,
            workflowId: null,
            executionMode,
            planningSummary: orchestrationSnapshot.planningSummary,
            distributionCount: orchestrationSnapshot.distributionCount,
            executionSemantics: orchestrationSnapshot.executionSemantics,
            ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
            finalSummary: orchestrationSnapshot.planningSummary ? 'orchestration 规划与分发已完成' : undefined,
            directReplyToMessageId: messageId,
            fastReplySource,
          }),
        });
        this.logger.log('foundry.ceo.v2.message.appended', { companyId, roomId, messageId, mode: 'orchestration' });
      }

      this.logger.log('foundry.ceo.v2.message.processed', {
        companyId,
        roomId,
        messageId,
        routePath: out.routePath,
        intentType: out.intentDecision.intentType,
        confidence: out.intentDecision.confidence,
        ...(unifiedIntent
          ? {
              unifiedIntentConfidence: Number(unifiedIntent.confidence ?? 0),
              ...(unifiedIntent.audienceConfidence !== undefined
                ? { audienceConfidence: Number(unifiedIntent.audienceConfidence) }
                : {}),
              ...(unifiedIntent.strategyConfidence !== undefined
                ? { strategyConfidence: Number(unifiedIntent.strategyConfidence) }
                : {}),
            }
          : {}),
        planAnchorMessageId,
        runId,
        executionMode,
        temporalWorkflowId,
        elapsedMs: Date.now() - startedAt,
      });

      /** Roundtable：在本轮 CEO 侧处理链末尾调度（含已完成 temporal supervision 等），再排队多 agent 接龙。 */
      void this.mainRoomRoundtable
        .tryScheduleAfterMainRoomPipeline({
          companyId,
          roomId,
          anchorMessageId: messageId,
          roomContext,
          humanSenderId: String(input.humanSenderId ?? msg.senderId ?? '').trim(),
          humanMessageContent: contentText,
          mentionedAgentIds: input.mentionedAgentIds ?? [],
          ceoAgentId,
          threadId: input.threadId ?? null,
        })
        .catch((e: unknown) => {
          this.logger.warn('main_room_roundtable.schedule_failed', {
            companyId,
            roomId,
            messageId,
            error: e instanceof Error ? e.message : String(e),
          });
        });

      // [阶段1.1] 成功收尾兜底清除"正在思考"。内联回复路径（flow 内部直接写房）不会走 listener 的
      // appendAgentMessage→clear，否则生成前发出的气泡会悬挂。此处统一在回合结束清一次（对已清过的
      // 非内联路径是幂等的无害重复）。
      if (activeThinkingResponderIds.length > 0) {
        this.clearResponderThinkingBestEffort({
          companyId,
          roomId,
          sourceMessageId: messageId,
          agentIds: activeThinkingResponderIds,
          runId,
          traceId: String(input.routingRootMessageId ?? messageId).trim(),
          roomType: 'main',
        });
      }

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      if (mainRoomOrchestrationTracked && !mainRoomOrchestrationSucceeded) {
        if (activeThinkingResponderIds.length > 0) {
          this.responderThinking.publishBestEffort({
            companyId,
            roomId,
            sourceMessageId: messageId,
            status: 'idle',
            responderAgentIds: activeThinkingResponderIds,
            roomType: 'main',
            runId,
          });
        }
        void this.upsertOrchestrationRunBestEffort({
          companyId,
          roomId,
          sourceMessageId: messageId,
          workerRunId: runId,
          status: 'failed',
          stage: 'process_failed',
          errorCode: normalizedError.code ? String(normalizedError.code).slice(0, 64) : 'PROCESS_FAILED',
          errorMessage: String(normalizedError.message ?? 'unknown').slice(0, 8000),
          metadata: {
            phases: buildMainRoomPipelinePhases({
              orchestrationStatus: 'failed',
              stage: 'process_failed',
              routePath: 'orchestration',
            }),
          },
        });
      }
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: normalizedError.message });
      this.logger.error('foundry.ceo.v2.message.process_failed', {
        companyId,
        roomId,
        messageId,
        elapsedMs: Date.now() - startedAt,
        errorMessage: normalizedError.message,
        errorName: normalizedError.name,
        errorCode: normalizedError.code,
        errorResponse: normalizedError.response,
        errorStack: normalizedError.stack,
      });
      await this.publishMessageProcessFailed({
        companyId,
        roomId,
        messageId,
        traceId: String(event?.data?.traceId ?? '').trim() || undefined,
        error: normalizedError.message,
      });
    } finally {
      this.listenerLatency.record(Date.now() - startedAt, { handler: 'message_received' });
      span.end();
    }
    });
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async publishMessageProcessFailed(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId?: string;
    error: string;
  }): Promise<void> {
    const failedEvent: CollaborationMessageProcessFailedV2Event = {
      eventId: randomUUID(),
      eventType: 'collaboration.message.process_failed.v2',
      aggregateId: params.messageId || randomUUID(),
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId || undefined,
      data: {
        messageId: params.messageId,
        roomId: params.roomId,
        traceId: params.traceId,
        error: params.error.slice(0, 8000),
        failedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(failedEvent, { routingKey: failedEvent.eventType, persistent: true }).catch((err) => {
      this.logger.warn('foundry.collaboration.message.process_failed.publish_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private upsertOrchestrationRunBestEffort(params: {
    companyId: string;
    roomId: string;
    sourceMessageId: string;
    workerRunId?: string;
    status: string;
    stage?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  }): void {
    void this
      .rpc<unknown>('collaboration.orchestrationRuns.workerUpsert', {
        companyId: params.companyId,
        actor: this.workerActor(),
        roomId: params.roomId,
        sourceMessageId: params.sourceMessageId,
        workerRunId: params.workerRunId,
        status: params.status,
        stage: params.stage ?? undefined,
        errorCode: params.errorCode ?? undefined,
        errorMessage: params.errorMessage ?? undefined,
        metadata: params.metadata ?? undefined,
      })
      .catch((e) =>
        this.logger.warn('foundry.collaboration.orchestration_run.upsert_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          sourceMessageId: params.sourceMessageId,
          status: params.status,
          stage: params.stage ?? null,
          ...serializeUnknownErrorForLog(e),
        }),
      );
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
  }

  private async resolveCeoAgentId(companyId: string): Promise<string | null> {
    const res = await this.rpc<{ items?: Array<{ id?: string }> }>('agents.findAll', {
      companyId,
      actor: this.workerActor(),
      role: 'ceo',
      status: 'active',
      page: 1,
      pageSize: 1,
    }).catch(() => ({ items: [] }));
    return res.items?.[0]?.id?.trim() ?? null;
  }

  private async appendDepartmentDirectReplyFailureNotice(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    threadId?: string | null;
    reason: string;
    contentPreview: string;
  }): Promise<void> {
    const ceoAgentId = await this.resolveCeoAgentId(params.companyId).catch(() => null);
    if (!ceoAgentId) return;
    const clip = String(params.contentPreview ?? '').trim().slice(0, 200);
    const reasonLine =
      params.reason === 'director_not_found'
        ? '本部门协作房尚未绑定可在房内发言的部门主管（director）Agent。'
        : `部门处理未启动（${params.reason}）。`;
    try {
      await this.appendAgentMessage({
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: ceoAgentId,
        content: ['【系统提示】', reasonLine, clip ? `（你的消息节选：${clip}）` : ''].filter(Boolean).join('\n'),
        threadId: params.threadId ?? undefined,
        provisional: false,
        metadata: {
          source: 'department_direct_reply_listener_fallback',
          directReplyToMessageId: params.messageId,
          routingMode: 'department_direct_path',
          noDirectorFallback: params.reason === 'director_not_found',
        },
      });
    } catch (e: unknown) {
      this.logger.warn('foundry.department.direct_reply.listener_fallback_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private clearResponderThinkingBestEffort(params: {
    companyId: string;
    roomId: string;
    sourceMessageId: string;
    agentIds: string[];
    runId?: string;
    traceId?: string;
    roomType?: 'main' | 'department';
  }): void {
    const ids = params.agentIds.map((id) => String(id ?? '').trim()).filter(Boolean);
    if (!ids.length) return;
    this.responderThinking.publishBestEffort({
      companyId: params.companyId,
      roomId: params.roomId,
      sourceMessageId: params.sourceMessageId,
      status: 'idle',
      responderAgentIds: ids,
      roomType: params.roomType,
      runId: params.runId,
      traceId: params.traceId,
    });
  }

  private async appendAgentMessage(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    content: string;
    threadId?: string;
    provisional: boolean;
    metadata: CeoV2ChatMessageMetadata | Record<string, unknown>;
    thinkingSourceMessageId?: string;
    thinkingRunId?: string;
    thinkingTraceId?: string;
    thinkingRoomType?: 'main' | 'department';
  }): Promise<string | undefined> {
    const thinkingSourceMessageId =
      params.thinkingSourceMessageId ??
      (typeof params.metadata?.directReplyToMessageId === 'string'
        ? String(params.metadata.directReplyToMessageId).trim()
        : undefined);
    if (thinkingSourceMessageId) {
      this.clearResponderThinkingBestEffort({
        companyId: params.companyId,
        roomId: params.roomId,
        sourceMessageId: thinkingSourceMessageId,
        agentIds: [params.agentId],
        runId: params.thinkingRunId,
        traceId: params.thinkingTraceId,
        roomType: params.thinkingRoomType ?? 'main',
      });
    }
    const saved = await this.rpc<{ id?: string }>('collaboration.messages.appendAgent', {
      companyId: params.companyId,
      actor: this.workerActor(),
      roomId: params.roomId,
      agentId: params.agentId,
      content: params.content,
      messageType: params.provisional ? 'stream_chunk' : 'text',
      threadId: params.threadId,
      metadata: {
        ...params.metadata,
        provisional: params.provisional,
      },
    });
    const id = typeof saved?.id === 'string' ? saved.id.trim() : '';
    return id || undefined;
  }

  private readFastReplySource(payload: unknown): string | undefined {
    const rec = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const v = rec?.fastReplySource;
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined;
  }

  private parseDistributionDraftSurface(raw: unknown): CeoV2DistributionDraft | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    if (r.schemaVersion !== '1.0') return undefined;
    const rowsRaw = r.rows;
    if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) return undefined;
    const rows: CeoV2DistributionDraft['rows'] = [];
    for (const row of rowsRaw.slice(0, 24)) {
      if (!row || typeof row !== 'object') continue;
      const x = row as Record<string, unknown>;
      rows.push({
        department: String(x.department ?? '').trim().slice(0, 64) || '—',
        priority: String(x.priority ?? '').trim().slice(0, 8) || 'P1',
        deliverable: String(x.deliverable ?? '').trim().slice(0, 4000) || '—',
      });
    }
    if (!rows.length) return undefined;
    return {
      schemaVersion: '1.0',
      distributionId: String(r.distributionId ?? '').trim().slice(0, 128),
      planId: String(r.planId ?? '').trim().slice(0, 128),
      pendingDepartmentDispatchConfirm: Boolean(r.pendingDepartmentDispatchConfirm),
      rows,
    };
  }

  private buildCeoV2Metadata(params: {
    intentType: string;
    confidence: number;
    traceId: string;
    workflowId: string | null;
    executionMode?: 'sync' | 'async';
    planningSummary?: string;
    distributionCount?: number;
    executionSemantics?: string;
    ceoExecutionPlanSummary?: string;
    finalSummary?: string;
    directReplyToMessageId?: string;
    approvalRequestId?: string;
    approvalStatus?: string;
    fastReplySource?: string;
    distributionDraft?: CeoV2DistributionDraft;
    streamId?: string;
    kind?: string;
    routePath?: string;
  }): CeoV2ChatMessageMetadata {
    return {
      source: 'ceo_v2',
      intentType: params.intentType,
      confidence: params.confidence,
      traceId: params.traceId,
      workflowId: params.workflowId ?? undefined,
      executionMode: params.executionMode ?? undefined,
      planningSummary: params.planningSummary,
      distributionCount: typeof params.distributionCount === 'number' ? params.distributionCount : undefined,
      executionSemantics: params.executionSemantics,
      ceoExecutionPlanSummary: params.ceoExecutionPlanSummary,
      finalSummary: params.finalSummary,
      directReplyToMessageId: params.directReplyToMessageId,
      approvalRequestId: params.approvalRequestId,
      approvalStatus: params.approvalStatus,
      fastReplySource: params.fastReplySource,
      ...(params.streamId ? { streamId: params.streamId } : {}),
      ...(params.distributionDraft ? { distributionDraft: params.distributionDraft } : {}),
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.routePath ? { routePath: params.routePath } : {}),
    };
  }

  private resolveCeoOrchestrationStreamId(messageId: string, ceoAgentId: string | null): string | undefined {
    const agentId = String(ceoAgentId ?? '').trim();
    if (!agentId) return undefined;
    return buildCeoOrchestrationStreamId(messageId, agentId);
  }

  private buildOrchestrationFinalText(out: { intentDecision: any; output?: any }): string {
    const payload = out.output?.payload;
    const modelText = String(payload?.fastFinalText ?? '').trim();
    if (modelText) return modelText.slice(0, 8000);
    return '我现在没有生成稳定回复，请把刚才那句再发一次，我会继续基于上下文处理。';
  }

  private buildOrchestrationSummaryText(payload: unknown): string {
    const rec = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const planning = rec?.planning as PlanningResult | undefined;
    const distribution = rec?.distribution as DistributionPlan | undefined;
    const lines: string[] = [];
    if (planning?.goal) lines.push(`目标：${planning.goal}`);
    const phases =
      Array.isArray(planning?.strategicPhases) && planning!.strategicPhases!.length
        ? planning!.strategicPhases!
        : migrateLegacyPlanningResultToStrategicPhases((planning ?? {}) as Record<string, unknown>) ?? [];
    if (phases.length) {
      lines.push('阶段性成果：');
      for (const s of phases.slice(0, 6)) lines.push(`- ${s.title}: ${s.outcome}`);
    }
    if (distribution?.tasks?.length) lines.push(`分发任务数：${distribution.tasks.length}`);
    return (lines.join('\n') || '已生成规划与分发结果。').slice(0, 3800);
  }

  private buildApprovalFinalText(payload: Record<string, unknown> | undefined): string {
    const planning =
      payload?.planning && typeof payload.planning === 'object'
        ? (payload.planning as Record<string, unknown>)
        : undefined;
    const goal = typeof planning?.goal === 'string' ? planning.goal.trim() : '';
    const approvalRequestId =
      typeof payload?.approvalRequestId === 'string' ? String(payload.approvalRequestId).trim() : '';
    const approvalReason =
      typeof payload?.approvalReason === 'string'
        ? String(payload.approvalReason).trim()
        : typeof planning?.approvalReason === 'string'
          ? String(planning.approvalReason).trim()
          : '';
    const lines: string[] = [];
    lines.push('该任务需要人工审批后才能继续执行。');
    if (goal) lines.push(`目标：${goal}`);
    if (approvalRequestId) lines.push(`审批单号：${approvalRequestId}`);
    if (approvalReason) lines.push(`原因：${approvalReason}`);
    lines.push('请前往审批中心处理后，再继续推进。');
    return lines.join('\n').slice(0, 3800);
  }

  private buildHeavyFinalText(out: HeavyExecutionOutput): string {
    const t = String((out as any).finalText ?? '').trim();
    if (t) return t.slice(0, 3800);
    return 'Heavy execution completed.';
  }

  private async waitHeavyWithProvisionalUpdates(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    threadId?: string;
    traceId: string;
    intentType: string;
    confidence: number;
    workflowId: string;
    planningSummary?: string;
    distributionCount?: number;
    executionSemantics?: string;
    ceoExecutionPlanSummary?: string;
    timeoutMs: number;
  }): Promise<HeavyExecutionOutput> {
    const startedAt = Date.now();
    const intervalMs = 20_000;
    const maxUpdates = 6;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (ticks > maxUpdates) return;
      void this.appendAgentMessage({
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
        threadId: params.threadId,
        provisional: true,
        content: `执行进行中…（workflow=${params.workflowId}，已等待 ${Math.floor((Date.now() - startedAt) / 1000)}s）`,
        metadata: this.buildCeoV2Metadata({
          intentType: params.intentType,
          confidence: params.confidence,
          traceId: params.traceId,
          workflowId: params.workflowId,
          planningSummary: params.planningSummary,
          distributionCount: params.distributionCount,
          executionSemantics: params.executionSemantics,
          ceoExecutionPlanSummary: params.ceoExecutionPlanSummary,
        }),
      });
    }, intervalMs);
    try {
      return await this.temporal.waitForHeavyExecutionResult({
        workflowId: params.workflowId,
        timeoutMs: params.timeoutMs,
      });
    } finally {
      clearInterval(timer);
    }
  }

  private readTemporalWorkflowId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const wf = (payload as any)?.temporal?.workflowId;
    const v = typeof wf === 'string' ? wf.trim() : '';
    return v || null;
  }

  /**
   * reply_before_heavy 异步重编排完成后：补发执行计划卡片并向各部门下发（同步路径在 listener 主流程处理）。
   */
  private async finalizeDeferredHeavyOrchestrationOutcome(params: {
    heavyOut: CollaborationPipelineV2RunResult;
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
    runId: string;
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    ceoAgentId: string;
    temporalWorkflowId: string | null;
    executionMode: 'sync' | 'async';
    fastReplySource: string;
  }): Promise<void> {
    const {
      heavyOut,
      companyId,
      roomId,
      messageId,
      traceId,
      runId,
      input,
      roomContext,
      ceoAgentId,
      temporalWorkflowId,
      executionMode,
      fastReplySource,
    } = params;
    const routePath = heavyOut.routePath;
    if (
      routePath !== 'dispatch_plan' &&
      routePath !== 'dispatch_plan_flush' &&
      routePath !== 'dispatch_plan_failed' &&
      routePath !== 'dispatch_compile_failed' &&
      routePath !== 'dispatch_assign_failed'
    ) {
      return;
    }

    const payload = heavyOut.output?.payload as Record<string, unknown> | undefined;
    const orchestrationSnapshot = this.extractOrchestrationSnapshot(payload);
    const text =
      typeof payload?.fastFinalText === 'string' && payload.fastFinalText.trim()
        ? String(payload.fastFinalText).trim()
        : routePath === 'dispatch_plan_flush'
          ? payload?.deferDistributionFlush === true
            ? '执行计划已生成，正在向各部门下发…'
            : '执行计划已编译并向各部门下发。'
          : routePath === 'dispatch_assign_failed'
            ? '部门派活未能完成，请查看说明后重试。'
            : '执行计划处理未完成，请调整任务描述后重试。';
    const dispatchPlan =
      payload?.dispatchPlan && typeof payload.dispatchPlan === 'object'
        ? (payload.dispatchPlan as Record<string, unknown>)
        : undefined;
    const appendedPlanMessageId = await this.appendAgentMessage({
      companyId,
      roomId,
      agentId: ceoAgentId,
      content: text.slice(0, 8000),
      threadId: input.threadId ?? undefined,
      provisional: false,
      metadata: {
        ...this.buildCeoV2Metadata({
          intentType: heavyOut.intentDecision.intentType,
          confidence: heavyOut.intentDecision.confidence,
          traceId,
          workflowId: temporalWorkflowId,
          executionMode,
          planningSummary: orchestrationSnapshot.planningSummary,
          distributionCount: orchestrationSnapshot.distributionCount,
          executionSemantics: orchestrationSnapshot.executionSemantics,
          ceoExecutionPlanSummary: orchestrationSnapshot.ceoExecutionPlanSummary,
          directReplyToMessageId: messageId,
          fastReplySource,
          kind: routePath === 'dispatch_plan' || routePath === 'dispatch_plan_flush' ? routePath : undefined,
          routePath,
        }),
        ...(dispatchPlan
          ? {
              dispatchPlan: {
                planId: dispatchPlan.planId,
                planRevision: dispatchPlan.planRevision,
                goal: dispatchPlan.goal,
                assignments: dispatchPlan.assignments,
                executionOrder: dispatchPlan.executionOrder,
              },
              pendingDistributionConfirm: payload?.pendingDistributionConfirm === true,
              dispatched: routePath === 'dispatch_plan_flush' && payload?.deferDistributionFlush !== true,
              flushPending: payload?.flushPending === true,
            }
          : {}),
        ...(routePath === 'dispatch_assign_failed'
          ? {
              routePath: 'dispatch_assign_failed',
              dispatchAssignFailure: payload?.dispatchAssignFailure ?? null,
            }
          : {}),
      },
    });

    let flushSucceeded = routePath !== 'dispatch_plan_flush' || payload?.deferDistributionFlush !== true;
    if (
      routePath === 'dispatch_plan_flush' &&
      payload?.deferDistributionFlush === true &&
      payload?.distributionLegacy &&
      typeof payload.distributionLegacy === 'object' &&
      payload?.dispatchPlan &&
      typeof payload.dispatchPlan === 'object'
    ) {
      const flushParams = {
        input,
        roomContext,
        intentDecision: heavyOut.intentDecision,
        distributionLegacy: payload.distributionLegacy as DistributionPlan,
        planDoc: payload.dispatchPlan as import('@contracts/types').CeoDispatchPlanDocument,
        traceId,
        planMessageId: appendedPlanMessageId,
      };
      const runFlush = () => this.pipelineCoordinator.executeDeferredDispatchPlanFlush(flushParams);
      try {
        await runFlush();
        flushSucceeded = true;
      } catch (firstErr: unknown) {
        const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        this.logger.warn('main_room.dispatch_plan.deferred_flush_failed_retry', {
          companyId,
          roomId,
          messageId,
          planMessageId: appendedPlanMessageId,
          error: firstMsg,
          source: 'deferred_heavy',
        });
        try {
          await runFlush();
          flushSucceeded = true;
        } catch (retryErr: unknown) {
          flushSucceeded = false;
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          if (appendedPlanMessageId) {
            await this.pipelineCoordinator.patchDispatchPlanFlushFailedMetadata({
              companyId,
              planMessageId: appendedPlanMessageId,
              flushError: retryMsg.slice(0, 500),
              flushPending: true,
            });
          }
          this.logger.error('main_room.dispatch_plan.deferred_flush_failed', {
            companyId,
            roomId,
            messageId,
            planMessageId: appendedPlanMessageId,
            error: retryMsg,
            source: 'deferred_heavy',
          });
        }
      }
    }

    if ((routePath === 'dispatch_plan' || routePath === 'dispatch_plan_flush') && flushSucceeded) {
      const dispatchLifecyclePatch = buildOrchestrationLifecyclePatch({
        lifecycle: routePath === 'dispatch_plan_flush' && flushSucceeded ? 'dept_executing' : 'awaiting_confirm',
        terminalKind: routePath === 'dispatch_plan_flush' && flushSucceeded ? 'dispatch_plan_flush' : 'dispatch_plan',
        stage: routePath,
        metadataPatch: {
          routePath,
          distributionTaskCount: orchestrationSnapshot.distributionCount,
          planMessageId: appendedPlanMessageId ?? null,
          pendingDistributionConfirm: payload?.pendingDistributionConfirm === true,
          deferredHeavy: true,
        },
      });
      void this.upsertOrchestrationRunBestEffort({
        companyId,
        roomId,
        sourceMessageId: messageId,
        workerRunId: runId,
        status: dispatchLifecyclePatch.status,
        stage: dispatchLifecyclePatch.stage,
        metadata: dispatchLifecyclePatch.metadata,
      });
    }

    this.logger.log('foundry.ceo.v2.message.appended', {
      companyId,
      roomId,
      messageId,
      mode: `deferred_heavy_${routePath}`,
      planMessageId: appendedPlanMessageId ?? null,
      flushSucceeded,
    });
  }

  private extractOrchestrationSnapshot(payload: unknown): {
    planningSummary?: string;
    distributionCount?: number;
    executionSemantics?: string;
    ceoExecutionPlanSummary?: string;
  } {
    const rec = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const planning = rec?.planning as PlanningResult | undefined;
    const distribution = rec?.distribution as DistributionPlan | undefined;
    const sem = String(distribution?.executionSemantics ?? '').trim();
    const ep = distribution?.executionPlan;
    const gateCount = ep?.nodes?.filter((n) => n.incomingGate === 'supervisor_release').length ?? 0;
    const taskCount = Array.isArray(distribution?.tasks) ? distribution!.tasks!.length : 0;
    const ceoExecutionPlanSummary =
      taskCount > 0
        ? ep
          ? `${sem || 'sequential_waves'} · ${taskCount} tasks · ${gateCount} supervisor gates`.slice(0, 400)
          : `${sem || 'sequential_waves'} · ${taskCount} tasks`.slice(0, 400)
        : undefined;
    return {
      planningSummary: planning?.goal ? String(planning.goal).trim().slice(0, 320) : undefined,
      distributionCount: taskCount || undefined,
      executionSemantics: sem || undefined,
      ceoExecutionPlanSummary,
    };
  }

  private extractHeavyFinalSummary(out: HeavyExecutionOutput): string | undefined {
    const s = String((out as any).finalText ?? '').trim();
    return s ? s.slice(0, 500) : undefined;
  }

  private extractExecutionStateStages(
    payload: unknown,
  ): Array<'proposed' | 'approved' | 'in_progress' | 'blocked' | 'done' | 'reviewed'> {
    const rec = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const raw = Array.isArray(rec?.executionStateStages) ? rec.executionStateStages : [];
    const accepted = new Set(['proposed', 'approved', 'in_progress', 'blocked', 'done', 'reviewed']);
    return raw
      .map((x) => String(x ?? '').trim())
      .filter((x): x is 'proposed' | 'approved' | 'in_progress' | 'blocked' | 'done' | 'reviewed' =>
        accepted.has(x),
      );
  }

  private resolveExecutionMode(routePath: string, temporalWorkflowId: string | null): 'sync' | 'async' {
    if (temporalWorkflowId) return 'async';
    if (
      routePath === 'execution' ||
      routePath === 'strategy' ||
      routePath === 'approval' ||
      routePath === 'strategy_contract_failed' ||
      routePath === 'dispatch_plan' ||
      routePath === 'dispatch_plan_flush' ||
      routePath === 'dispatch_plan_failed' ||
      routePath === 'dispatch_compile_failed'
    ) {
      return 'sync';
    }
    return 'sync';
  }

  private async publish<T extends BaseEvent>(partial: Omit<T, 'eventId' | 'occurredAt' | 'version'> & { data: any }): Promise<void> {
    const evt: T = {
      ...(partial as any),
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      version: 1,
    };
    await this.messaging
      .publish(evt, { routingKey: evt.eventType, persistent: true })
      .then(() => {
        this.logger.log('foundry.ceo.v2.event.published', { eventType: evt.eventType, aggregateId: evt.aggregateId });
      });
  }

  private normalizeError(error: unknown): {
    message: string;
    name?: string;
    code?: string;
    stack?: string;
    response?: unknown;
  } {
    if (error instanceof Error) {
      const anyError = error as Error & {
        code?: string;
        response?: unknown;
        cause?: unknown;
      };
      return {
        message: anyError.message || 'Unknown error',
        name: anyError.name,
        code: typeof anyError.code === 'string' ? anyError.code : undefined,
        stack: anyError.stack,
        response: anyError.response ?? anyError.cause,
      };
    }
    if (error && typeof error === 'object') {
      const rec = error as Record<string, unknown>;
      const message =
        typeof rec.message === 'string'
          ? rec.message
          : typeof rec.error === 'string'
            ? rec.error
            : JSON.stringify(rec);
      return {
        message: message || 'Unknown non-error exception',
        name: typeof rec.name === 'string' ? rec.name : undefined,
        code: typeof rec.code === 'string' ? rec.code : undefined,
        response: rec,
      };
    }
    return { message: String(error) };
  }
}

