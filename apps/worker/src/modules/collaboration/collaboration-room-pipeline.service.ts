import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { Command, interrupt } from '@langchain/langgraph';
import { firstValueFrom, timeout } from 'rxjs';
import { AutonomousCheckpointService } from '../autonomous/autonomous-checkpoint.service.js';
import { ConfigService } from '../../common/config/config.service.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CeoDecisionService, type CeoDecisionResult } from './ceo-decision.service.js';
import {
  buildCollaborationRoomPipelineGraph,
  type RoomPipelineState,
} from './collaboration-room-pipeline.graph.js';
import { CollaborationCeoBreakdownService } from './collaboration-ceo-breakdown.service.js';
import { DirectCollabReplyService } from './direct-collab-reply.service.js';
import { DiscussionCollabService } from './discussion-collab.service.js';
import type { CollaborationRoutedIntent } from './intent-types.js';
import { COLLAB_LLM_TRACE } from '../../common/logging/collab-llm-trace.util.js';

export interface CollaborationRoomPipelineRunInput {
  companyId: string;
  roomId: string;
  messageId: string;
  contentText: string;
  threadId?: string | null;
  mentionedAgentIds: string[];
  ceoAgentId: string | null;
  forcedMode?: string | null;
}

export interface CollaborationRoomPipelineRunResult {
  decision: CeoDecisionResult;
  resumedFromInterrupt: boolean;
}

@Injectable()
export class CollaborationRoomPipelineService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CollaborationRoomPipelineService.name);
  private graph!: ReturnType<typeof buildCollaborationRoomPipelineGraph>;

  constructor(
    private readonly autonomousCheckpoint: AutonomousCheckpointService,
    private readonly ceoDecision: CeoDecisionService,
    private readonly breakdown: CollaborationCeoBreakdownService,
    private readonly directReply: DirectCollabReplyService,
    private readonly discussion: DiscussionCollabService,
    private readonly config: ConfigService,
    private readonly idempotency: IdempotencyService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  onApplicationBootstrap() {
    this.compileGraph();
  }

  private compileGraph() {
    const checkpointer = this.autonomousCheckpoint.getCheckpointer();
    this.graph = buildCollaborationRoomPipelineGraph(
      {
        resolveDecision: (s) => this.handleResolveDecision(s),
        runDiscussion: (s) => this.handleRunDiscussion(s),
        runDirect: (s) => this.handleRunDirect(s),
        runExecution: (s) => this.handleRunExecution(s),
        runApprovalAck: (s) => this.handleRunApprovalAck(s),
        humanApprovalGate: (s) => this.handleHumanApprovalGate(s),
        postApprovalEcho: (s) => this.handlePostApprovalEcho(s),
        maybeCeoCasual: (s) => this.handleMaybeCeoCasual(s),
      },
      checkpointer,
    );
    this.logger.log('Collaboration room pipeline graph compiled (Phase 2)');
  }

  pipelineThreadId(companyId: string, roomId: string): string {
    return `collab_room:${companyId}:${roomId}`;
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private rpcTimeoutMs() {
    return this.config.getCollaborationMentionRpcTimeoutMs();
  }

  private async rpcWithRetry<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    const timeoutMs = this.rpcTimeoutMs();
    return await firstValueFrom(this.apiRpc.send<T>(pattern, payload).pipe(timeout(timeoutMs)));
  }

  private forceModeToDecision(mode: string): CollaborationRoutedIntent {
    if (mode === 'approval_wait') return 'approval';
    if (mode === 'discussion' || mode === 'direct' || mode === 'execution') return mode;
    return 'discussion';
  }

  private async hasPendingInterrupt(cfg: { configurable: { thread_id: string } }): Promise<boolean> {
    try {
      const st = await this.graph.getState(cfg);
      const tasks = st.tasks as Array<{ interrupts?: unknown[] }> | undefined;
      return Boolean(tasks?.some((t) => Array.isArray(t.interrupts) && t.interrupts.length > 0));
    } catch {
      return false;
    }
  }

  async run(input: CollaborationRoomPipelineRunInput): Promise<CollaborationRoomPipelineRunResult> {
    if (!this.graph) this.compileGraph();
    const thread_id = this.pipelineThreadId(input.companyId, input.roomId);
    const cfg = { configurable: { thread_id } };

    const pending = await this.hasPendingInterrupt(cfg);
    this.logger.log(`${COLLAB_LLM_TRACE} | pipeline.run`, {
      thread_id,
      messageId: input.messageId,
      companyId: input.companyId,
      roomId: input.roomId,
      resumeInterrupt: pending,
      forcedMode: input.forcedMode ?? null,
    });

    if (pending) {
      await this.graph.invoke(
        new Command({
          resume: input.contentText,
          update: {
            messageId: input.messageId,
            contentText: input.contentText,
            threadId: input.threadId ?? undefined,
            mentionedAgentIds: input.mentionedAgentIds,
            ceoAgentId: input.ceoAgentId,
            approvalHumanReply: undefined,
          },
        }),
        cfg,
      );
      const final = await this.graph.getState(cfg);
      const decision = final.values.decision as CeoDecisionResult | null;
      if (!decision) {
        throw new Error('Room pipeline: missing decision after resume');
      }
      this.logger.log(`${COLLAB_LLM_TRACE} | pipeline.run_done`, {
        messageId: input.messageId,
        resumedFromInterrupt: true,
        mode: decision.mode,
      });
      return { decision, resumedFromInterrupt: true };
    }

    await this.graph.invoke(
      {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        contentText: input.contentText,
        threadId: input.threadId ?? undefined,
        mentionedAgentIds: input.mentionedAgentIds,
        ceoAgentId: input.ceoAgentId,
        forcedMode: input.forcedMode ?? undefined,
        decision: null,
        approvalHumanReply: undefined,
        pipelineLog: [],
      },
      cfg,
    );

    const finalAfterRun = await this.graph.getState(cfg);
    const decision = finalAfterRun.values.decision as CeoDecisionResult | null;
    if (!decision) {
      throw new Error('Room pipeline: missing decision after run');
    }
    this.logger.log(`${COLLAB_LLM_TRACE} | pipeline.run_done`, {
      messageId: input.messageId,
      resumedFromInterrupt: false,
      mode: decision.mode,
    });
    return { decision, resumedFromInterrupt: false };
  }

  private async handleResolveDecision(s: RoomPipelineState): Promise<Partial<RoomPipelineState>> {
    const fm = s.forcedMode;
    if (
      typeof fm === 'string' &&
      ['discussion', 'direct', 'execution', 'approval_wait'].includes(fm)
    ) {
      const mode = this.forceModeToDecision(fm);
      const modExtra = this.ceoDecision.getDiscussionModeration({
        mode,
        parsedAllowlist: undefined,
        parsedMax: undefined,
        mentionedAgentIds: s.mentionedAgentIds,
        ceoId: s.ceoAgentId,
      });
      const decision: CeoDecisionResult = {
        mode,
        confidence: 1,
        mentionedAgentIds: s.mentionedAgentIds,
        ...modExtra,
        latencyMs: 0,
        cacheHit: false,
      };
      this.logger.log(`${COLLAB_LLM_TRACE} | node.resolveDecision`, {
        messageId: s.messageId,
        source: 'forced',
        mode: decision.mode,
      });
      return { decision, pipelineLog: ['resolve_forced'] };
    }

    const decision = await this.ceoDecision.decide({
      companyId: s.companyId,
      roomId: s.roomId,
      messageId: s.messageId,
      contentText: s.contentText,
      threadId: s.threadId,
      mentionedAgentIds: s.mentionedAgentIds,
      ceoAgentId: s.ceoAgentId,
    });
    this.logger.log(`${COLLAB_LLM_TRACE} | node.resolveDecision`, {
      messageId: s.messageId,
      source: 'ceo_decision',
      mode: decision.mode,
      confidence: decision.confidence,
    });
    return { decision, pipelineLog: ['resolve_llm'] };
  }

  private async handleRunDiscussion(s: RoomPipelineState): Promise<Partial<RoomPipelineState>> {
    const d = s.decision;
    const maxC =
      d?.discussionMaxSpeakers ?? this.config.getDiscussionModerationMaxSpeakers();
    const allow = d?.discussionSpeakerAllowlist ?? [];
    const hasSummary = Boolean(d?.actionSummary?.trim());
    this.logger.log(`${COLLAB_LLM_TRACE} | node.discussion`, {
      messageId: s.messageId,
      roomId: s.roomId,
      moderation: Boolean(d && (hasSummary || allow.length > 0)),
    });
    await this.discussion.onHumanMessage({
      companyId: s.companyId,
      roomId: s.roomId,
      threadId: s.threadId,
      content: s.contentText,
      ceoAgentId: s.ceoAgentId,
      ceoModeration:
        d && (hasSummary || allow.length > 0)
          ? {
              actionSummary: d.actionSummary,
              allowedAgentIds: allow,
              maxConcurrent: maxC,
            }
          : undefined,
    });
    return { pipelineLog: ['discussion'] };
  }

  private async handleRunDirect(s: RoomPipelineState): Promise<Partial<RoomPipelineState>> {
    this.logger.log(`${COLLAB_LLM_TRACE} | node.direct_enter`, { messageId: s.messageId });
    const ceoId = s.ceoAgentId;
    const nonCeoMentions = ceoId
      ? s.mentionedAgentIds.filter((id) => id !== ceoId)
      : s.mentionedAgentIds;
    if (nonCeoMentions.length !== 1) {
      this.logger.log(`${COLLAB_LLM_TRACE} | node.direct_skip`, {
        messageId: s.messageId,
        reason: 'mentions',
      });
      return { pipelineLog: ['direct_skip_mentions'] };
    }
    const agentId = nonCeoMentions[0]!;
    const isMember = await this.breakdown.isAgentMember(s.companyId, s.roomId, agentId);
    if (!isMember) {
      this.logger.log(`${COLLAB_LLM_TRACE} | node.direct_skip`, {
        messageId: s.messageId,
        reason: 'not_member',
        agentId,
      });
      return { pipelineLog: ['direct_skip_not_member'] };
    }
    const idemDirect = `collab:direct:${s.messageId}:${agentId}`;
    if (!this.idempotency.markIfNew(idemDirect, 60 * 60_000)) {
      this.logger.log(`${COLLAB_LLM_TRACE} | node.direct_skip`, {
        messageId: s.messageId,
        reason: 'idempotency',
      });
      return { pipelineLog: ['direct_skip_idem'] };
    }
    this.logger.log(`${COLLAB_LLM_TRACE} | node.direct_reply`, {
      messageId: s.messageId,
      targetAgentId: agentId,
    });
    await this.directReply.reply({
      companyId: s.companyId,
      roomId: s.roomId,
      agentId,
      userMessage: s.contentText,
      sourceMessageId: s.messageId,
      threadId: s.threadId ?? null,
    });
    return { pipelineLog: ['direct_replied'] };
  }

  private async handleRunExecution(s: RoomPipelineState): Promise<Partial<RoomPipelineState>> {
    this.logger.log(`${COLLAB_LLM_TRACE} | node.execution`, { messageId: s.messageId });
    if (!s.ceoAgentId) {
      return { pipelineLog: ['execution_skip_no_ceo'] };
    }
    await this.breakdown.requestBreakdown({
      companyId: s.companyId,
      roomId: s.roomId,
      messageId: s.messageId,
      ceoId: s.ceoAgentId,
      contentText: s.contentText,
    });
    return { pipelineLog: ['execution_breakdown'] };
  }

  private async handleRunApprovalAck(_s: RoomPipelineState): Promise<Partial<RoomPipelineState>> {
    return { pipelineLog: ['approval_ack'] };
  }

  private async handleHumanApprovalGate(s: RoomPipelineState): Promise<Partial<RoomPipelineState>> {
    if (!this.config.isCeoRoomApprovalInterruptEnabled()) {
      if (s.ceoAgentId) {
        const title = s.decision?.approvalTitle ?? '需要您的确认';
        const body = s.decision?.actionSummary ?? '';
        try {
          await this.rpcWithRetry('collaboration.messages.appendAgent', {
            companyId: s.companyId,
            actor: this.workerActor(),
            roomId: s.roomId,
            agentId: s.ceoAgentId,
            content: `【待您确认】${title}\n${body}`.slice(0, 8000),
            messageType: 'text',
            threadId: s.threadId ?? undefined,
            metadata: { ceoApprovalNotice: true, sourceMessageId: s.messageId },
          });
        } catch (e: unknown) {
          this.logger.warn('approval notice append failed', {
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return { pipelineLog: ['approval_notice_only'] };
    }

    const payload = {
      type: 'collaboration_ceo_approval_wait',
      title: s.decision?.approvalTitle ?? '',
      summary: s.decision?.actionSummary ?? '',
      roomId: s.roomId,
      messageId: s.messageId,
    };
    const answer = interrupt(payload);
    const reply = typeof answer === 'string' ? answer : JSON.stringify(answer);
    return { approvalHumanReply: reply, pipelineLog: ['approval_interrupt_resumed'] };
  }

  private async handlePostApprovalEcho(s: RoomPipelineState): Promise<Partial<RoomPipelineState>> {
    const reply = s.approvalHumanReply?.trim();
    if (!reply || !s.ceoAgentId) {
      return { pipelineLog: ['approval_echo_skip'] };
    }
    const isMember = await this.breakdown.isAgentMember(s.companyId, s.roomId, s.ceoAgentId);
    if (!isMember) return { pipelineLog: ['approval_echo_skip_member'] };
    try {
      await this.rpcWithRetry('collaboration.messages.appendAgent', {
        companyId: s.companyId,
        actor: this.workerActor(),
        roomId: s.roomId,
        agentId: s.ceoAgentId,
        content: `【CEO】已收到您的确认回复：${reply.slice(0, 500)}`,
        messageType: 'text',
        threadId: s.threadId ?? undefined,
        metadata: { ceoApprovalEcho: true, sourceMessageId: s.messageId },
      });
    } catch (e: unknown) {
      this.logger.warn('approval echo append failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
    return { pipelineLog: ['approval_echo'] };
  }

  private async handleMaybeCeoCasual(s: RoomPipelineState): Promise<Partial<RoomPipelineState>> {
    const intentMode = s.decision?.mode ?? '';
    const {
      companyId,
      roomId,
      messageId,
      contentText,
      ceoAgentId,
      mentionedAgentIds: mentionedFromDb,
      threadId,
    } = s;
    if (intentMode !== 'discussion' || !ceoAgentId) {
      this.logger.log(`${COLLAB_LLM_TRACE} | node.ceo_casual_skip`, {
        messageId,
        reason: intentMode !== 'discussion' ? 'not_discussion' : 'no_ceo',
      });
      return { pipelineLog: ['casual_skip'] };
    }
    if (mentionedFromDb.length === 0 || !mentionedFromDb.every((id) => id === ceoAgentId)) {
      this.logger.log(`${COLLAB_LLM_TRACE} | node.ceo_casual_skip`, {
        messageId,
        reason: 'mentions',
        mentionedCount: mentionedFromDb.length,
      });
      return { pipelineLog: ['casual_skip_mentions'] };
    }
    if (/(总结|纪要|归纳|梳理|概括|开始执行|立刻执行|执行计划|上线|拆解)/.test(contentText)) {
      this.logger.log(`${COLLAB_LLM_TRACE} | node.ceo_casual_skip`, { messageId, reason: 'keywords' });
      return { pipelineLog: ['casual_skip_keywords'] };
    }
    const idemKey = `collab:ceoCasual:${messageId}`;
    if (!this.idempotency.markIfNew(idemKey, 60 * 60_000)) {
      this.logger.log(`${COLLAB_LLM_TRACE} | node.ceo_casual_skip`, { messageId, reason: 'idempotency' });
      return { pipelineLog: ['casual_skip_idem'] };
    }
    const isMember = await this.breakdown.isAgentMember(companyId, roomId, ceoAgentId);
    if (!isMember) {
      this.logger.log(`${COLLAB_LLM_TRACE} | node.ceo_casual_skip`, { messageId, reason: 'ceo_not_in_room' });
      return { pipelineLog: ['casual_skip_member'] };
    }
    this.logger.log(`${COLLAB_LLM_TRACE} | node.ceo_casual_llm`, {
      messageId,
      ceoAgentId,
      threadId: threadId ?? null,
      contentLen: contentText.length,
    });
    try {
      await this.directReply.reply({
        companyId,
        roomId,
        agentId: ceoAgentId,
        userMessage: contentText,
        sourceMessageId: messageId,
        threadId: threadId ?? null,
      });
      this.logger.log(`${COLLAB_LLM_TRACE} | node.ceo_casual_ok`, { messageId, ceoAgentId });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.warn('CEO casual LLM reply failed, using static fallback', {
        message: errMsg,
        messageId,
        trace: COLLAB_LLM_TRACE,
      });
      try {
        await this.rpcWithRetry('collaboration.messages.appendAgent', {
          companyId,
          actor: this.workerActor(),
          roomId,
          agentId: ceoAgentId,
          content:
            '您好，已收到消息。若平台管理员尚未在密钥池与 Marketplace（CEO 模板）绑定中为本公司分配到可用密钥，或当前预算/配额不可用，我无法生成个性化回复。需要任务拆解与执行时，请说明目标或使用「开始执行」「执行计划」等说法并 @我。',
          messageType: 'text',
          threadId: threadId ?? undefined,
          metadata: { ceoCasualFallback: true, replyToMessageId: messageId },
        });
      } catch (rpcErr: unknown) {
        this.logger.warn('CEO static fallback append failed', {
          message: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
        });
      }
    }
    return { pipelineLog: ['casual_done'] };
  }
}
