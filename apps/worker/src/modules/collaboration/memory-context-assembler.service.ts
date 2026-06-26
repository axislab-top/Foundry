import { Injectable } from '@nestjs/common';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';
import type { CollaborationIntentDecisionV20261, MemoryReference } from '@contracts/types';
import { ConfigService } from '../../common/config/config.service.js';
import type { CollaborationExecutionContext } from './context/collaboration-execution-context.js';
import { planIncludesBlock } from './context/context-grounding-plan.js';
import { GroupChatContextService } from './group-chat-context.service.js';
import { ContextCompressionService } from './context-compression.service.js';
import { MemoryCrossCutService } from './memory/memory-cross-cut.service.js';
import { OrgContextPackService } from './org-context-pack.service.js';

export type AssembledMemoryContext = {
  messages: BaseMessage[];
  auxiliarySystemText?: string;
  /** W13：Graph/向量检索的结构化引用（供上游写入消息 metadata 或观测） */
  memoryReferences?: MemoryReference[];
  diagnostics: {
    transcriptCount: number;
    compressionTriggered: boolean;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    transcriptKeptTurns: number;
  };
};

/**
 * 直聊 / orchestration 上下文组装。
 *
 * P2.2：仅当 `routingHints.targetAgentIds` 非空时，
 * 向 `buildAuxiliaryContextForReply` 传入 `directSummonOptions.isDirectSummoned=true`；
 * 画像与【最近对话】块的具体顺序与内容由 GroupChatContextService 统一编排。
 */
@Injectable()
export class MemoryContextAssemblerService {
  constructor(
    private readonly config: ConfigService,
    private readonly groupChatContext: GroupChatContextService,
    private readonly compression: ContextCompressionService,
    private readonly memoryCrossCut: MemoryCrossCutService,
    private readonly orgContextPack: OrgContextPackService,
  ) {}

  async assembleForOrchestration(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    messageId: string;
    latestUserText: string;
    /** 2026：与 Memory 横切一致的权威成员目录文本，置于 transcript 前端 */
    roomMemberPromptBlock?: string | null;
    /** 主群组织节点部门快照（与成员目录分离） */
    orgSnapshotPromptBlock?: string | null;
    /** false：跳过 roster；true：有 block 则注入；缺省有 block 即注入。主群编排由管线在存在 `roomMemberPromptBlock` 时传 true。 */
    injectRoomMemberDirectory?: boolean;
    /** Phase 3.6：与主群 lead `retrieveBeforeIntent` 对齐，避免 CEO NL 组装再走 `memory.search` */
    collaborationExecutionContext?: CollaborationExecutionContext;
  }): Promise<AssembledMemoryContext> {
    const timeoutMs = Math.max(3_000, this.config.getCollaborationMentionRpcTimeoutMs());
    const execCtx = params.collaborationExecutionContext;
    const leadHitsOrchestration = execCtx?.memoryHits;
    const reuseLeadHits =
      this.config.isMemoryRetrievalDeduplicationEnabled() &&
      execCtx?.leadMemorySearchDone === true &&
      Array.isArray(leadHitsOrchestration) &&
      leadHitsOrchestration.length > 0;
    if (reuseLeadHits) {
      this.memoryCrossCut.recordRetrievalDuplicateSkipped('orchestration_assemble');
    }

    const retrievalPromise = reuseLeadHits && execCtx
      ? Promise.resolve(this.groupChatContext.formatLeadCollaborationMemoryHitsAsRetrievalPack(execCtx.memoryHits))
      : this.groupChatContext
          .buildRetrievedMemoryBlock({
            companyId: params.companyId,
            roomId: params.roomId,
            query: params.latestUserText,
            timeoutMs,
            topK: Math.min(6, this.config.getGroupChatMemoryRetrievalTopK?.() ?? 4),
          })
          .catch(() => ({ block: '', entryIds: [] as string[], memoryReferences: [] as MemoryReference[] }));

    const [transcript, statePack, retrieved] = await Promise.all([
      this.groupChatContext
        .loadTranscriptMessages({
          companyId: params.companyId,
          roomId: params.roomId,
          threadId: params.threadId ?? null,
          excludeMessageId: params.messageId,
          maxMessages: 12,
          timeoutMs,
        })
        .catch(() => []),
      this.groupChatContext
        .buildConversationStateBlock({
          companyId: params.companyId,
          roomId: params.roomId,
          threadId: params.threadId ?? null,
          timeoutMs,
        })
        .catch(() => null),
      retrievalPromise,
    ]);

    const compressed = this.compression.compress({
      transcript,
      stateBlock: String(statePack?.block ?? '').trim(),
      retrievalBlock: String(retrieved?.block ?? '').trim(),
      hardBudgetTokens: 3000,
      rawTranscriptMaxTurns: 6,
    });

    const plan = execCtx?.contextGroundingPlan;
    const orgSnap = String(params.orgSnapshotPromptBlock ?? '').trim();
    const injectOrg =
      params.injectRoomMemberDirectory === false
        ? false
        : planIncludesBlock(plan, 'org_snapshot') && Boolean(orgSnap);
    const orgInjected: BaseMessage[] = injectOrg
      ? [new HumanMessage(`[2026 structured conversation_state — organization.org_snapshot]\n${orgSnap}`)]
      : [];

    const roster = String(params.roomMemberPromptBlock ?? '').trim();
    let injectRoster = planIncludesBlock(plan, 'room_roster') && Boolean(roster);
    if (params.injectRoomMemberDirectory === false) injectRoster = false;
    const injectedRoster: BaseMessage[] = injectRoster
      ? [new HumanMessage(`[2026 structured conversation_state — room_member_directory]\n${roster}`)]
      : [];

    return {
      messages: [...orgInjected, ...injectedRoster, ...compressed.messages],
      auxiliarySystemText: '',
      memoryReferences: retrieved.memoryReferences ?? [],
      diagnostics: {
        transcriptCount: transcript.length,
        compressionTriggered: compressed.diagnostics.triggered,
        estimatedInputTokens: compressed.diagnostics.estimatedInputTokens,
        estimatedOutputTokens: compressed.diagnostics.estimatedOutputTokens,
        transcriptKeptTurns: compressed.diagnostics.transcriptKeptTurns,
      },
    };
  }

  async assembleForDirected(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    agentRole?: string | null;
    threadId?: string | null;
    messageId: string;
    latestUserText: string;
    humanUserId?: string | null;
    /** P1.2：主群 unified intent，注入直聊 auxiliary（与 legacy L1 上下文并列） */
    intentDecision2026_1?: CollaborationIntentDecisionV20261;
    /** P0：用于 auxiliary 内抑制画像追问 hint（弱路由未带 targetAgentIds 时） */
    mentionedAgentIds?: string[];
    ceoAgentId?: string | null;
    collaborationExecutionContext?: CollaborationExecutionContext;
  }): Promise<AssembledMemoryContext> {
    const timeoutMs = Math.max(5_000, this.config.getCollaborationMentionRpcTimeoutMs());
    const targetAgentIds = params.intentDecision2026_1?.routingHints?.targetAgentIds;
    const isDirectSummoned = Array.isArray(targetAgentIds) && targetAgentIds.length > 0;

    const dedupOn = this.config.isMemoryRetrievalDeduplicationEnabled();
    const execCtx = params.collaborationExecutionContext;
    const leadHitsDirected = execCtx?.memoryHits;
    const reuseLeadHits =
      dedupOn &&
      execCtx?.leadMemorySearchDone === true &&
      Array.isArray(leadHitsDirected) &&
      leadHitsDirected.length > 0;
    if (reuseLeadHits) {
      this.memoryCrossCut.recordRetrievalDuplicateSkipped('group_chat_auxiliary');
    }

    const aux = await this.groupChatContext
      .buildAuxiliaryContextForReply({
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
        threadId: params.threadId ?? null,
        latestUserText: params.latestUserText,
        excludeMessageId: params.messageId,
        timeoutMs,
        ceoContext: 'replay',
        humanUserId: params.humanUserId ?? null,
        replyingToCeo: false,
        intentDecision2026_1: params.intentDecision2026_1,
        mentionedAgentIds: params.mentionedAgentIds,
        ceoAgentId: params.ceoAgentId ?? null,
        directSummonOptions: isDirectSummoned
          ? { isDirectSummoned: true, targetAgentId: params.agentId }
          : undefined,
        reuseLeadCollaborationMemorySearch: reuseLeadHits,
        leadCollaborationMemoryHits: reuseLeadHits && execCtx ? execCtx.memoryHits : undefined,
        intentPhaseLeadPromptContext:
          typeof execCtx?.leadPromptContext === 'string' && execCtx.leadPromptContext.trim()
            ? execCtx.leadPromptContext
            : undefined,
        contextGroundingPlan: execCtx?.contextGroundingPlan,
      })
      .catch(() => ({
        transcript: [] as BaseMessage[],
        auxiliarySystemText: '',
        memoryEntryIds: [] as string[],
        memoryReferences: [] as MemoryReference[],
      }));

    const policy = this.resolveDirectedPolicy(params.agentRole);
    let auxiliarySystemText = this.applyAuxiliaryPolicy(
      String(aux.auxiliarySystemText ?? '').trim(),
      policy,
    );

    const traceId = String(params.messageId ?? '').trim();
    const rosterInject = await this.orgContextPack
      .buildDepartmentRosterPromptForAgent({
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
        agentRole: params.agentRole ?? null,
        traceId,
        humanUserId: params.humanUserId ?? null,
      })
      .catch(() => ({ block: '', pack: null }));
    if (rosterInject.block) {
      auxiliarySystemText = [rosterInject.block, auxiliarySystemText].filter(Boolean).join('\n\n');
    }

    const compressed = this.compression.compress({
      transcript: aux.transcript ?? [],
      stateBlock: '',
      retrievalBlock: auxiliarySystemText,
      hardBudgetTokens: policy.hardBudgetTokens,
      rawTranscriptMaxTurns: policy.rawTranscriptMaxTurns,
    });

    const rosterMessage =
      rosterInject.block.trim().length > 0
        ? [new HumanMessage(`[2026 structured conversation_state — organization.department_roster]\n${rosterInject.block}`)]
        : [];

    return {
      messages: [...rosterMessage, ...compressed.messages],
      auxiliarySystemText,
      memoryReferences: aux.memoryReferences ?? [],
      diagnostics: {
        transcriptCount: Array.isArray(aux.transcript) ? aux.transcript.length : 0,
        compressionTriggered: compressed.diagnostics.triggered,
        estimatedInputTokens: compressed.diagnostics.estimatedInputTokens,
        estimatedOutputTokens: compressed.diagnostics.estimatedOutputTokens,
        transcriptKeptTurns: compressed.diagnostics.transcriptKeptTurns,
      },
    };
  }

  private resolveDirectedPolicy(role: string | null | undefined): {
    mode: 'executive' | 'employee';
    hardBudgetTokens: number;
    rawTranscriptMaxTurns: number;
  } {
    const r = String(role ?? '').trim().toLowerCase();
    const executive = r === 'ceo' || r.includes('director') || r.includes('supervisor') || r.includes('manager');
    if (executive) {
      return {
        mode: 'executive',
        hardBudgetTokens: 2600,
        rawTranscriptMaxTurns: 6,
      };
    }
    return {
      mode: 'employee',
      hardBudgetTokens: 1800,
      rawTranscriptMaxTurns: 8,
    };
  }

  private applyAuxiliaryPolicy(
    auxiliarySystemText: string,
    policy: { mode: 'executive' | 'employee' },
  ): string {
    if (!auxiliarySystemText.trim()) return '';
    if (policy.mode === 'executive') return auxiliarySystemText;

    // Employee mode: keep narrow, task-centric memory only.
    const blocks = auxiliarySystemText
      .split(/\n\s*\n/g)
      .map((x) => x.trim())
      .filter(Boolean);
    const kept = blocks.filter(
      (b) =>
        b.startsWith('【直聊任务') ||
        b.startsWith('【公司画像') ||
        b.startsWith('【最近对话') ||
        b.startsWith('【对话状态') ||
        b.startsWith('【L1决策上下文复用】') ||
        b.startsWith('【2026.1') ||
        b.startsWith('【规划衔接提示') ||
        b.startsWith('【当前人类发言者身份】') ||
        b.startsWith('【会话相关知识检索'),
    );
    const merged = kept.join('\n\n').trim();
    return merged || auxiliarySystemText.slice(0, 1200);
  }
}

