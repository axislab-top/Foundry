import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ClientProxy } from '@nestjs/microservices';

import { firstValueFrom, timeout } from 'rxjs';

import { ConfigService } from '../../../common/config/config.service.js';

import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';

import { CollaborationPipelineV2Service } from '../pipeline-v2/collaboration-pipeline-v2.service.js';

import type { CollaborationPipelineV2RunInput } from '../pipeline-v2/collaboration-pipeline-v2.types.js';

import { DirectorAutonomousService } from './director-autonomous.service.js';

import { L1FeatureFlagService } from '../l1/l1-feature-flag.service.js';

import { buildDepartmentOrchestrationMetadata } from './department-orchestration-run.util.js';

import { DepartmentRoomInteractionClassifierService } from './department-room-interaction-classifier.service.js';

import {

  buildDepartmentRoomRoster,

  resolveDepartmentStructuralRoute,

} from './department-room-structural-route.util.js';

import { mapWithConcurrency } from '../pipeline-v2/direct-group-reply-policy.util.js';
import { ResponderThinkingPublisher } from '../pipeline-v2/responder-thinking.publisher.js';



type AgentRow = {

  id?: string;

  role?: string;

  organizationNodeId?: string | null;

  status?: string;

};



const DEGRADED_USER_MESSAGE = '暂时无法生成回复，请稍后重试或联系管理员。';



@Injectable()

export class DepartmentDirectReplyService {

  private readonly logger = new Logger(DepartmentDirectReplyService.name);



  constructor(

    private readonly config: ConfigService,

    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,

    private readonly pipelineV2: CollaborationPipelineV2Service,

    private readonly directorAutonomous: DirectorAutonomousService,

    private readonly l1FeatureFlags: L1FeatureFlagService,

    private readonly departmentClassifier: DepartmentRoomInteractionClassifierService,

    private readonly responderThinking: ResponderThinkingPublisher,

  ) {}



  async reply(params: {

    companyId: string;

    roomId: string;

    messageId: string;

    threadId?: string | null;

    contentText: string;

    roomContext: RoomContext;

    mentionedAgentIds?: string[];

    mentionedNodeIds?: string[];

    humanSenderId?: string | null;

    ceoAgentId?: string | null;

    messageCategory?: string | null;

    clientFeatureFlags?: string[];

  }): Promise<{ handled: boolean; directorAgentId?: string; reason?: string }> {

    const directorAgentId = await this.resolveDepartmentDirectorAgentId({

      companyId: params.companyId,

      roomContext: params.roomContext,

    });

    if (!directorAgentId) {

      this.logger.warn('department_direct_reply_no_director', {

        companyId: params.companyId,

        roomId: params.roomId,

      });

      const ceoFallbackId = await this.resolveFallbackCeoAgentId(params.companyId);

      if (ceoFallbackId) {

        try {

          const clip = String(params.contentText ?? '').trim().slice(0, 240);

          await this.rpc('collaboration.messages.appendAgent', {

            companyId: params.companyId,

            actor: this.workerActor(),

            roomId: params.roomId,

            agentId: ceoFallbackId,

            content: [

              '【系统提示】本部门协作房尚未绑定可在房内发言的 **部门主管（director）** Agent。',

              '请公司管理员在对应组织节点上为主管绑定 director 角色并加入本群后，再发起部门任务协作。',

              clip ? `（用户消息节选：${clip}）` : '',

            ]

              .filter(Boolean)

              .join('\n'),

            messageType: 'text',

            threadId: params.threadId ?? undefined,

            metadata: {

              source: 'department_direct_reply_no_director_notice',

              directReplyToMessageId: params.messageId,

              routingMode: 'department_direct_path',

              roomType: 'department',

              noDirectorFallback: true,

            },

          });

          return { handled: true, directorAgentId: ceoFallbackId, reason: 'no_director_ceo_notice' };

        } catch (e: unknown) {

          this.logger.warn('department_direct_reply_no_director_append_failed', {

            companyId: params.companyId,

            roomId: params.roomId,

            message: e instanceof Error ? e.message : String(e),

          });

        }

      }

      return { handled: false, reason: 'director_not_found' };

    }



    const roster = buildDepartmentRoomRoster(params.roomContext);

    const structural = resolveDepartmentStructuralRoute({

      roomContext: params.roomContext,

      mentionedAgentIds: params.mentionedAgentIds ?? [],

      directorAgentId,

      ceoAgentId: params.ceoAgentId ?? null,

      roster,

    });



    if (structural.kind === 'employee_direct') {

      this.publishDepartmentThinking({
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        agentIds: structural.targetAgentIds,
      });

      const handled = await this.runEmployeeDirectReplies({

        ...params,

        targetAgentIds: structural.targetAgentIds,

      });

      if (handled) {

        void this.upsertDepartmentOrchestrationRunBestEffort({

          companyId: params.companyId,

          roomId: params.roomId,

          sourceMessageId: params.messageId,

          status: 'succeeded',

          stage: 'department_employee_direct',

        });

        return { handled: true, directorAgentId, reason: 'employee_direct' };

      }

    }



    const classification = await this.departmentClassifier.classify({

      companyId: params.companyId,

      roomId: params.roomId,

      messageId: params.messageId,

      contentText: params.contentText,

      roomContext: params.roomContext,

      mentionedAgentIds: params.mentionedAgentIds,

      messageCategory: params.messageCategory ?? null,

      directorAgentId,

    });



    if (classification.interactionMode === 'employee_direct') {

      const targets =

        classification.targetAgentIds.length > 0

          ? classification.targetAgentIds

          : structural.kind === 'employee_direct'

            ? structural.targetAgentIds

            : [];

      if (targets.length > 0) {

        this.publishDepartmentThinking({
          companyId: params.companyId,
          roomId: params.roomId,
          messageId: params.messageId,
          agentIds: targets,
        });

        const handled = await this.runEmployeeDirectReplies({ ...params, targetAgentIds: targets });

        if (handled) {

          void this.upsertDepartmentOrchestrationRunBestEffort({

            companyId: params.companyId,

            roomId: params.roomId,

            sourceMessageId: params.messageId,

            status: 'succeeded',

            stage: 'department_employee_direct',

          });

          return { handled: true, directorAgentId, reason: 'employee_direct_llm' };

        }

      }

    }



    if (classification.interactionMode === 'delegate_tasks') {

      const delegation = await this.directorAutonomous.executeDepartmentDelegation({

        companyId: params.companyId,

        roomId: params.roomId,

        messageId: params.messageId,

        threadId: params.threadId ?? null,

        contentText: params.contentText,

        roomContext: params.roomContext,

        mentionedAgentIds: params.mentionedAgentIds,

        mentionedNodeIds: params.mentionedNodeIds,

        humanSenderId: params.humanSenderId ?? null,

        ceoAgentId: params.ceoAgentId ?? null,

        directorAgentId,

        messageCategory: params.messageCategory ?? null,

        clientFeatureFlags: params.clientFeatureFlags,

        delegationOutline: classification.delegationOutline,

        classificationConfidence: classification.confidence,

        classificationExplanation: classification.explanation,

      });

      if (delegation.handled) {

        return delegation;

      }

    }



    this.publishDepartmentThinking({
      companyId: params.companyId,
      roomId: params.roomId,
      messageId: params.messageId,
      agentIds: [directorAgentId],
    });

    const conversation = await this.runDirectorConversationReply({

      ...params,

      directorAgentId,

    });

    if (conversation.handled) {

      return conversation;

    }



    return this.appendDegradedDirectorNotice({

      companyId: params.companyId,

      roomId: params.roomId,

      messageId: params.messageId,

      threadId: params.threadId ?? null,

      directorAgentId,

      reason: conversation.reason ?? 'model_empty',

    });

  }



  private buildPipelineInput(

    params: {

      companyId: string;

      roomId: string;

      messageId: string;

      threadId?: string | null;

      contentText: string;

      mentionedAgentIds?: string[];

      mentionedNodeIds?: string[];

      humanSenderId?: string | null;

      ceoAgentId?: string | null;

      messageCategory?: string | null;

    },

    targetAgentId: string,

  ): CollaborationPipelineV2RunInput {

    return {

      companyId: params.companyId,

      roomId: params.roomId,

      messageId: params.messageId,

      routingRootMessageId: params.messageId,

      contentText: params.contentText,

      threadId: params.threadId ?? null,

      mentionedAgentIds: [...(params.mentionedAgentIds ?? []), targetAgentId].slice(0, 12),

      mentionedNodeIds: params.mentionedNodeIds ?? [],

      messageCategory: params.messageCategory ?? null,

      ceoAgentId: params.ceoAgentId ?? null,

      humanSenderId: params.humanSenderId ?? null,

      senderType: 'human',

      messageSource: 'department_direct_reply',

    };

  }



  private async runDirectorConversationReply(params: {

    companyId: string;

    roomId: string;

    messageId: string;

    threadId?: string | null;

    contentText: string;

    roomContext: RoomContext;

    mentionedAgentIds?: string[];

    mentionedNodeIds?: string[];

    humanSenderId?: string | null;

    ceoAgentId?: string | null;

    messageCategory?: string | null;

    directorAgentId: string;

  }): Promise<{ handled: boolean; directorAgentId?: string; reason?: string }> {

    const traceId = String(params.messageId).trim();

    const pipelineInput = this.buildPipelineInput(params, params.directorAgentId);

    const modelPath = await this.pipelineV2.runDepartmentRoomDirectorModelReply({

      input: pipelineInput,

      roomContext: params.roomContext,

      directorAgentId: params.directorAgentId,

      traceId,

      forceModelPath: true,

    });

    if (modelPath.handled) {

      void this.upsertDepartmentOrchestrationRunBestEffort({

        companyId: params.companyId,

        roomId: params.roomId,

        sourceMessageId: params.messageId,

        status: 'succeeded',

        stage: 'department_director_reply',

      });

      return modelPath;

    }

    this.logger.warn('department_direct_reply_model_failed', {

      companyId: params.companyId,

      roomId: params.roomId,

      messageId: params.messageId,

      reason: modelPath.reason ?? 'unknown',

    });

    return { handled: false, directorAgentId: params.directorAgentId, reason: modelPath.reason ?? 'model_empty' };

  }



  private async runEmployeeDirectReplies(params: {

    companyId: string;

    roomId: string;

    messageId: string;

    threadId?: string | null;

    contentText: string;

    roomContext: RoomContext;

    mentionedAgentIds?: string[];

    mentionedNodeIds?: string[];

    humanSenderId?: string | null;

    ceoAgentId?: string | null;

    messageCategory?: string | null;

    targetAgentIds: string[];

  }): Promise<boolean> {

    const targets = [...new Set(params.targetAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean))].slice(

      0,

      8,

    );

    if (targets.length === 0) return false;



    const traceId = String(params.messageId).trim();

    const results = await mapWithConcurrency(targets, 3, async (agentId) => {

      const pipelineInput = this.buildPipelineInput(params, agentId);

      return this.pipelineV2.runDepartmentRoomDirectorModelReply({

        input: pipelineInput,

        roomContext: params.roomContext,

        directorAgentId: agentId,

        traceId,

        forceModelPath: true,

      });

    });

    return results.some((r) => r.handled);

  }



  private async appendDegradedDirectorNotice(params: {

    companyId: string;

    roomId: string;

    messageId: string;

    threadId?: string | null;

    directorAgentId: string;

    reason: string;

  }): Promise<{ handled: boolean; directorAgentId: string; reason: string }> {

    this.logger.warn('department_direct_reply_llm_failed', {

      companyId: params.companyId,

      roomId: params.roomId,

      messageId: params.messageId,

      reason: params.reason,

    });

    try {

      this.publishDepartmentThinkingIdle({
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        agentIds: [params.directorAgentId],
      });

      await this.rpc('collaboration.messages.appendAgent', {

        companyId: params.companyId,

        actor: this.workerActor(),

        roomId: params.roomId,

        agentId: params.directorAgentId,

        content: DEGRADED_USER_MESSAGE,

        messageType: 'text',

        threadId: params.threadId ?? undefined,

        metadata: {

          source: 'department_direct_reply_degraded',

          directReplyToMessageId: params.messageId,

          routingMode: 'department_direct_path',

          roomType: 'department',

          degradedReason: params.reason,

        },

      });

      void this.upsertDepartmentOrchestrationRunBestEffort({

        companyId: params.companyId,

        roomId: params.roomId,

        sourceMessageId: params.messageId,

        status: 'failed',

        stage: 'department_director_reply',

        errorMessage: params.reason,

      });

      return { handled: true, directorAgentId: params.directorAgentId, reason: 'degraded_notice' };

    } catch (e: unknown) {

      this.logger.warn('department_direct_reply_degraded_append_failed', {

        companyId: params.companyId,

        roomId: params.roomId,

        message: e instanceof Error ? e.message : String(e),

      });

      return { handled: false, directorAgentId: params.directorAgentId, reason: 'degraded_append_failed' };

    }

  }



  private async resolveDepartmentDirectorAgentId(params: {

    companyId: string;

    roomContext: RoomContext;

  }): Promise<string | null> {

    const organizationNodeId = params.roomContext.organizationNodeId;

    const roomAgentIds = new Set(

      params.roomContext.members.filter((m) => m.memberType === 'agent').map((m) => m.memberId),

    );

    const result = await this.rpc<{ items?: AgentRow[] }>('agents.findAll', {

      companyId: params.companyId,

      actor: this.workerActor(),

      role: 'director',

      status: 'active',

      page: 1,

      pageSize: 100,

    }).catch(() => ({ items: [] }));

    const items = Array.isArray(result.items) ? result.items : [];

    const byNode = items.find((row) => {

      const id = String(row?.id ?? '').trim();

      if (!id || !roomAgentIds.has(id)) return false;

      if (!organizationNodeId) return true;

      return String(row?.organizationNodeId ?? '').trim() === organizationNodeId;

    });

    return byNode?.id ? String(byNode.id).trim() : null;

  }



  private async resolveFallbackCeoAgentId(companyId: string): Promise<string | null> {

    try {

      const result = await this.rpc<{ items?: AgentRow[] }>('agents.findAll', {

        companyId,

        actor: this.workerActor(),

        role: 'ceo',

        status: 'active',

        page: 1,

        pageSize: 4,

      });

      const items = Array.isArray(result.items) ? result.items : [];

      const first = items.find((a) => String(a?.role ?? '').toLowerCase() === 'ceo') ?? items[0];

      const id = typeof first?.id === 'string' ? first.id.trim() : '';

      return id || null;

    } catch {

      return null;

    }

  }



  private publishDepartmentThinking(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    agentIds: string[];
  }): void {
    const agentIds = params.agentIds.map((id) => String(id ?? '').trim()).filter(Boolean);
    if (!agentIds.length) return;
    this.responderThinking.publishBestEffort({
      companyId: params.companyId,
      roomId: params.roomId,
      sourceMessageId: params.messageId,
      status: 'thinking',
      responderAgentIds: agentIds,
      roomType: 'department',
      traceId: params.messageId,
    });
  }

  private publishDepartmentThinkingIdle(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    agentIds: string[];
  }): void {
    const agentIds = params.agentIds.map((id) => String(id ?? '').trim()).filter(Boolean);
    if (!agentIds.length) return;
    this.responderThinking.publishBestEffort({
      companyId: params.companyId,
      roomId: params.roomId,
      sourceMessageId: params.messageId,
      status: 'idle',
      responderAgentIds: agentIds,
      roomType: 'department',
      traceId: params.messageId,
    });
  }

  private workerActor() {

    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };

  }



  private upsertDepartmentOrchestrationRunBestEffort(params: {

    companyId: string;

    roomId: string;

    sourceMessageId: string;

    status: string;

    stage: string;

    delegationsPublished?: number;

    subGoalCount?: number;

    errorMessage?: string | null;

  }): void {

    void this.rpc('collaboration.orchestrationRuns.workerUpsert', {

      companyId: params.companyId,

      actor: this.workerActor(),

      roomId: params.roomId,

      sourceMessageId: params.sourceMessageId,

      status: params.status,

      stage: params.stage,

      metadata: buildDepartmentOrchestrationMetadata({

        status: params.status,

        stage: params.stage,

        delegationsPublished: params.delegationsPublished,

        subGoalCount: params.subGoalCount,

        errorMessage: params.errorMessage ?? null,

      }),

    }).catch((e: unknown) =>

      this.logger.warn('foundry.collaboration.dept_orchestration_run.upsert_failed', {

        companyId: params.companyId,

        roomId: params.roomId,

        sourceMessageId: params.sourceMessageId,

        message: e instanceof Error ? e.message : String(e),

      }),

    );

  }



  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {

    return await firstValueFrom(

      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),

    );

  }

}


