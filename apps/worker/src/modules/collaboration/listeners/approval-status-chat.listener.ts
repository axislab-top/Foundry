import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { ApprovalStatusChangedEvent } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';
import { ConversationOutputSanitizerService } from '../conversation-output-sanitizer.service.js';
import { CollaborationPipelineV2Coordinator } from '../pipeline-v2/collaboration-pipeline-v2.coordinator.js';

@Injectable()
export class ApprovalStatusChatListener implements OnModuleInit {
  private readonly logger = new Logger(ApprovalStatusChatListener.name);
  private readonly startedAtByApproval = new Map<string, number>();
  private readonly resumedApprovalIds = new Set<string>();

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
    private readonly pipelineV2Coordinator: CollaborationPipelineV2Coordinator,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<ApprovalStatusChangedEvent>(
      'approval.status.changed',
      this.handle.bind(this),
      { queue: 'worker-collab-approval-status-chat-queue', durable: true, prefetchCount: 20 },
    );
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async handle(event: ApprovalStatusChangedEvent): Promise<void> {
    const st = event.data.status;
    this.monitoring.incApprovalOutcome(st);
    if (st === 'pending') {
      this.startedAtByApproval.set(event.data.approvalRequestId, Date.now());
      return;
    }
    const started = this.startedAtByApproval.get(event.data.approvalRequestId);
    if (started) {
      this.monitoring.observeApprovalLatency((Date.now() - started) / 1000);
      this.startedAtByApproval.delete(event.data.approvalRequestId);
    }
    if (!(st === 'approved' || st === 'rejected' || st === 'expired')) return;
    try {
      const approvalDetail = await firstValueFrom(
        this.apiRpc
          .send<{ id?: string; status?: string; actionType?: string | null; context?: Record<string, unknown> | null } | null>(
            'approval.findOne',
            {
              companyId: event.companyId,
              actor: this.workerActor(),
              approvalId: event.data.approvalRequestId,
            },
          )
          .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
      ).catch(() => null);
      const context =
        approvalDetail && typeof approvalDetail.context === 'object' && !Array.isArray(approvalDetail.context)
          ? approvalDetail.context
          : null;
      const roomIdFromContext =
        context && typeof context.roomId === 'string' ? context.roomId.trim() : '';

      const room = !roomIdFromContext
        ? await firstValueFrom(
            this.apiRpc
              .send<{ id?: string } | null>('collaboration.rooms.findMain', {
                companyId: event.companyId,
                actor: this.workerActor(),
              })
              .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
          )
        : null;
      const roomId = roomIdFromContext || room?.id?.trim();
      if (!roomId) return;
      const ceo = await firstValueFrom(
        this.apiRpc
          .send<{ items?: Array<{ id?: string }> }>('agents.findAll', {
            companyId: event.companyId,
            actor: this.workerActor(),
            role: 'ceo',
            status: 'active',
            page: 1,
            pageSize: 1,
          })
          .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
      );
      const ceoId = ceo?.items?.[0]?.id?.trim();
      if (!ceoId) return;
      const content =
        st === 'approved'
          ? `【审批通过】approvalId=${event.data.approvalRequestId}，可继续执行。`
          : st === 'rejected'
            ? `【审批拒绝】approvalId=${event.data.approvalRequestId}，本次执行已停止。`
            : `【审批超时】approvalId=${event.data.approvalRequestId}，请重新发起或调整方案。`;
      const visible = ConversationOutputSanitizerService.toVisibleLayer(content);
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.messages.appendAgent', {
            companyId: event.companyId,
            actor: this.workerActor(),
            roomId,
            agentId: ceoId,
            content: visible,
            messageType: 'text',
            metadata: {
              approvalStatus: st,
              approvalRequestId: event.data.approvalRequestId,
              executionTokenId: event.data.executionTokenId ?? null,
            },
          })
          .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
      );

      await this.tryResumePipelineAfterApproval({
        companyId: event.companyId,
        approvalRequestId: event.data.approvalRequestId,
        status: st,
        roomId,
        approvalDetail,
      });
    } catch (e: unknown) {
      this.logger.warn('approval status chat notify failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async tryResumePipelineAfterApproval(params: {
    companyId: string;
    approvalRequestId: string;
    status: 'approved' | 'rejected' | 'expired';
    roomId: string;
    approvalDetail: { id?: string; status?: string; actionType?: string | null; context?: Record<string, unknown> | null } | null;
  }): Promise<void> {
    if (params.status !== 'approved') return;
    if (this.resumedApprovalIds.has(params.approvalRequestId)) return;

    const actionType = String(params.approvalDetail?.actionType ?? '').trim();
    if (actionType !== 'collaboration.ceo.v2.execute') return;

    const context =
      params.approvalDetail?.context &&
      typeof params.approvalDetail.context === 'object' &&
      !Array.isArray(params.approvalDetail.context)
        ? (params.approvalDetail.context as Record<string, unknown>)
        : null;

    const sourceMessageId =
      (context && typeof context.messageId === 'string' && context.messageId.trim()) ||
      (context && typeof context.traceId === 'string' && context.traceId.trim()) ||
      params.approvalRequestId;
    const goalText =
      (context && typeof context.goal === 'string' && context.goal.trim()) ||
      '审批已通过，请继续执行既定计划。';

    const ceo = await firstValueFrom(
      this.apiRpc
        .send<{ items?: Array<{ id?: string }> }>('agents.findAll', {
          companyId: params.companyId,
          actor: this.workerActor(),
          role: 'ceo',
          status: 'active',
          page: 1,
          pageSize: 1,
        })
        .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    ).catch(() => ({ items: [] }));
    const ceoId = ceo?.items?.[0]?.id?.trim();
    if (!ceoId) return;

    this.resumedApprovalIds.add(params.approvalRequestId);
    try {
      const result = await this.pipelineV2Coordinator.run({
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: sourceMessageId,
        routingRootMessageId: sourceMessageId,
        contentText: goalText,
        senderType: 'human',
        messageSource: 'approval.status.changed',
        threadId: null,
        mentionedAgentIds: [],
        mentionedNodeIds: [],
        messageCategory: 'task_publish',
        ceoAgentId: ceoId,
        approvalRequestId: params.approvalRequestId,
        postApprovalSilent: false,
        alreadyHeavyProcessed: false,
        humanSenderId: null,
      });

      const resumeText = this.buildResumeFinalText(result.output?.payload);
      const resumeCard = this.buildResumeRichCard(result.output?.payload, result.routePath);
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.messages.appendAgent', {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
            agentId: ceoId,
            content: ConversationOutputSanitizerService.toVisibleLayer(resumeText),
            messageType: 'text',
            metadata: {
              source: 'ceo_v2_post_approval_resume',
              approvalStatus: 'approved',
              approvalRequestId: params.approvalRequestId,
              routePath: result.routePath,
              richCard: resumeCard,
            },
          })
          .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
      );
    } catch (e: unknown) {
      this.resumedApprovalIds.delete(params.approvalRequestId);
      throw e;
    }
  }

  private buildResumeFinalText(payload: Record<string, unknown> | undefined): string {
    const fast = payload && typeof payload.fastFinalText === 'string' ? payload.fastFinalText.trim() : '';
    if (fast) return fast;
    const temporal = payload && typeof payload.temporal === 'object' ? (payload.temporal as Record<string, unknown>) : null;
    const workflowId = temporal && typeof temporal.workflowId === 'string' ? temporal.workflowId.trim() : '';
    if (workflowId) {
      return `审批已通过，已自动恢复执行，工作流已启动（${workflowId}）。`;
    }
    const planning = payload && typeof payload.planning === 'object' ? (payload.planning as Record<string, unknown>) : null;
    const goal = planning && typeof planning.goal === 'string' ? planning.goal.trim() : '';
    return goal ? `审批已通过，已恢复执行。\n目标：${goal}` : '审批已通过，已自动恢复执行。';
  }

  private buildResumeRichCard(
    payload: Record<string, unknown> | undefined,
    routePath: string,
  ): Record<string, unknown> {
    const temporal =
      payload && typeof payload.temporal === 'object' ? (payload.temporal as Record<string, unknown>) : null;
    const planning =
      payload && typeof payload.planning === 'object' ? (payload.planning as Record<string, unknown>) : null;
    const distribution =
      payload && typeof payload.distribution === 'object'
        ? (payload.distribution as Record<string, unknown>)
        : null;
    const workflowId = temporal && typeof temporal.workflowId === 'string' ? temporal.workflowId.trim() : '';
    const planId = planning && typeof planning.planId === 'string' ? planning.planId.trim() : '';
    const goal = planning && typeof planning.goal === 'string' ? planning.goal.trim() : '';
    const tasks = distribution && Array.isArray(distribution.tasks) ? distribution.tasks : [];

    return {
      kind: 'ceo_v2_resume',
      cardType: 'approval_resume',
      routePath,
      goal: goal || null,
      planId: planId || null,
      workflowId: workflowId || null,
      distributionTaskCount: tasks.length,
      executionMode: workflowId ? 'temporal' : 'inline',
    };
  }
}

