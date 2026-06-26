import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import { FactsGatewayClient } from './facts/facts-gateway.client.js';
import { GroupChatContextService } from './group-chat-context.service.js';
import type { FactsQueryType } from '@contracts/types';
import type {
  MainRoomLeadMemoryContext,
  MainRoomReplayFactLayerMode,
  MainRoomReplayLlmContextPack,
} from './pipeline-v2/collaboration-pipeline-v2.types.js';
import { MAIN_ROOM_REPLAY_FACT_LAYER_CHAR_LIMITS } from './replay/main-room-replay-fact-layer.contract.js';
import {
  wrapReplayUntrustedMemoryBlock,
  wrapReplayUntrustedTranscriptBlock,
} from './replay/main-room-replay-trust-boundary.util.js';
import {
  buildMinimalContextGroundingFallback,
  planIncludesBlock,
  type ContextGroundingPlan,
} from './context/context-grounding-plan.js';

function formatUnknownCatchError(e: unknown): string {
  if (e instanceof Error) return (e.message || e.name || 'Error').trim() || 'Error';
  if (typeof e === 'object' && e !== null) {
    const o = e as Record<string, unknown>;
    const m = o.message ?? o.errMsg ?? o.error;
    if (typeof m === 'string' && m.trim()) return m.trim();
    try {
      return JSON.stringify(o).slice(0, 800);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

/**
 * 主群 replay：单回合组装 **记忆**、**节选**，以及 Planner 决定的 **live facts 预取摘要**。
 */
@Injectable()
export class MainRoomReplayLlmContextService {
  private readonly logger = new Logger(MainRoomReplayLlmContextService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly groupChatContext: GroupChatContextService,
    private readonly factsGateway: FactsGatewayClient,
  ) {}

  async assemblePack(params: {
    companyId: string;
    roomId: string;
    threadId: string | null;
    userText: string;
    memoryContext: MainRoomLeadMemoryContext;
    traceId: string;
    messageId: string;
    ceoAgentId?: string | null;
    humanSenderId?: string | null;
    factLayerMode?: MainRoomReplayFactLayerMode;
    plan?: ContextGroundingPlan | null;
  }): Promise<MainRoomReplayLlmContextPack> {
    const mode = params.factLayerMode ?? 'minimal_tools';
    const plan = params.plan ?? buildMinimalContextGroundingFallback('disabled');
    const timeoutMs = Math.max(4_000, Math.min(12_000, this.config.getCollaborationMentionRpcTimeoutMs()));

    let memoryBlock = '';
    if (planIncludesBlock(plan, 'memory')) {
      try {
        const hits = params.memoryContext.memoryHits;
        if (Array.isArray(hits) && hits.length > 0) {
          memoryBlock = wrapReplayUntrustedMemoryBlock(
            this.groupChatContext.formatLeadCollaborationMemoryHitsAsRetrievalPack(hits).block,
          );
        } else {
          const lead = String(params.memoryContext.promptContext ?? '').trim();
          if (lead) {
            memoryBlock = wrapReplayUntrustedMemoryBlock(
              `【Memory retrieval — lead intent context】\n${lead.slice(0, 3500)}`,
            );
          } else if (mode !== 'minimal_tools') {
            const pack = await this.groupChatContext.buildRetrievedMemoryBlock({
              companyId: params.companyId,
              roomId: params.roomId,
              query: params.userText,
              timeoutMs,
              topK: Math.min(8, this.config.getGroupChatMemoryRetrievalTopK()),
            });
            memoryBlock = wrapReplayUntrustedMemoryBlock(pack.block);
          }
        }
      } catch (e) {
        this.logger.warn('foundry.replay.assemble_pack.memory_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          messageId: params.messageId,
          traceId: params.traceId,
          error: e instanceof Error ? e.message : String(e),
        });
        memoryBlock = '';
      }
    }

    let transcriptBlock = '';
    if (
      planIncludesBlock(plan, 'transcript') &&
      this.config.isCeoReplayInjectRecentTranscriptEnabled()
    ) {
      try {
        transcriptBlock = wrapReplayUntrustedTranscriptBlock(
          (
            await this.groupChatContext.buildCeoReplayRecentTranscriptBlock({
              companyId: params.companyId,
              roomId: params.roomId,
              threadId: params.threadId,
              excludeMessageId: params.messageId,
              timeoutMs,
              maxBodyChars: this.config.getCeoReplayRecentTranscriptMaxBodyChars(),
            })
          ).trim(),
        );
      } catch (e) {
        this.logger.warn('foundry.replay.assemble_pack.transcript_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          messageId: params.messageId,
          traceId: params.traceId,
          error: e instanceof Error ? e.message : String(e),
        });
        transcriptBlock = '';
      }
    }

    const factsBlock =
      (plan.factsQueryTypes?.length ?? 0) > 0
        ? await this.prefetchLiveFactsForReplayPack({
            companyId: params.companyId,
            roomId: params.roomId,
            threadId: params.threadId,
            traceId: params.traceId,
            messageId: params.messageId,
            ceoAgentId: params.ceoAgentId ?? null,
            humanSenderId: params.humanSenderId ?? null,
            factsQueryTypes: plan.factsQueryTypes,
            userText: params.userText,
          })
        : '';

    return {
      memoryBlock: memoryBlock.trim(),
      transcriptBlock: transcriptBlock.trim(),
      factsBlock: factsBlock.trim(),
      factLayerMode: mode,
    };
  }

  private formatFactsQueryLine(queryType: FactsQueryType, facts: Record<string, unknown>): string {
    const counts = ((facts?.counts ?? {}) as Record<string, unknown>) ?? {};
    const readNames = (arr: unknown, field = 'displayName') =>
      Array.isArray(arr)
        ? arr
            .map((x) => {
              const rec = (x ?? {}) as Record<string, unknown>;
              const name = String(rec[field] ?? rec.name ?? rec.memberId ?? rec.id ?? '').trim();
              const role = String(rec.role ?? '').trim();
              return role ? `${name}(${role})` : name;
            })
            .filter(Boolean)
            .slice(0, 24)
        : [];
    if (queryType === 'room_members') {
      const names = readNames((facts as { roomMembers?: unknown }).roomMembers);
      const total = Number(counts.roomMembers ?? names.length ?? 0) || names.length;
      return `群聊成员 ${total} 人：${names.join('、') || '暂无可读成员名单'}`;
    }
    if (queryType === 'role_presence') {
      const matches = Array.isArray(facts.roleMatches) ? (facts.roleMatches as Array<Record<string, unknown>>) : [];
      const total =
        Number((counts as Record<string, unknown>).roleMatches ?? matches.length) || matches.length;
      if (!matches.length) return `角色匹配：0 人`;
      const names = matches
        .slice(0, 10)
        .map((m) => {
          const name = String(m.displayName ?? m.name ?? m.memberId ?? '').trim();
          const role = String(m.role ?? '').trim();
          if (!name) return '';
          return role ? `${name}(${role})` : name;
        })
        .filter(Boolean);
      return `角色匹配：${total} 人；样例：${names.join('、') || '暂无'}`;
    }
    if (queryType === 'company_people') {
      const rows = Array.isArray(facts.companyPeople)
        ? (facts.companyPeople as Array<Record<string, unknown>>)
        : [];
      const total = Number(counts.companyPeople ?? rows.length) || rows.length;
      const active = counts.companyActiveMembers;
      const activePart =
        typeof active === 'number' && Number.isFinite(active) ? `；公司在册活跃成员约 ${active} 人` : '';
      const sample = rows
        .slice(0, 28)
        .map((r) => {
          const name = String(r.name ?? r.id ?? '').trim();
          const role = String(r.role ?? '').trim();
          if (!name) return '';
          return role ? `${name}(${role})` : name;
        })
        .filter(Boolean);
      return `公司在册 Agent ${total} 人${activePart}：${sample.join('、') || '暂无名单'}`;
    }
    if (queryType === 'org_structure') {
      const tree = (facts.orgStructure as Record<string, unknown> | null | undefined)?.tree;
      if (!Array.isArray(tree) || tree.length === 0) return '组织：暂无组织树';
      const countNodes = (nodes: unknown[]): number => {
        let n = 0;
        const walk = (arr: unknown[]) => {
          for (const node of arr) {
            n++;
            const ch = (node as Record<string, unknown>)?.children;
            if (Array.isArray(ch) && ch.length) walk(ch as unknown[]);
          }
        };
        walk(nodes);
        return n;
      };
      const totalNodes = countNodes(tree as unknown[]);
      const roots = (tree as unknown[])
        .slice(0, 18)
        .map((x) => String((x as Record<string, unknown>)?.name ?? '').trim())
        .filter(Boolean);
      return `组织树约 ${totalNodes} 个节点；顶层：${roots.join('、') || '—'}`;
    }
    return '';
  }

  /** Planner 决定的 facts.query 类型并行预取。 */
  private async prefetchLiveFactsForReplayPack(params: {
    companyId: string;
    roomId: string;
    threadId: string | null;
    traceId: string;
    messageId: string;
    ceoAgentId: string | null;
    humanSenderId: string | null;
    factsQueryTypes: FactsQueryType[];
    userText: string;
  }): Promise<string> {
    const ceoId = String(params.ceoAgentId ?? '').trim();
    if (!ceoId || !params.factsQueryTypes.length) {
      return '';
    }
    const traceId = String(params.traceId ?? params.messageId).trim();
    const base = {
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
      traceId,
      locale: null as string | null,
      factsClientMode: 'main_room_replay_prefetch' as const,
      requester: {
        agentId: ceoId,
        role: 'ceo' as const,
        departmentSlug: null as string | null,
        userId: params.humanSenderId,
      },
    };

    const tasks: Array<{ label: FactsQueryType; run: () => Promise<unknown> }> = [];
    for (const queryType of params.factsQueryTypes) {
      if (queryType === 'role_presence') {
        const roleQuery = String(params.userText ?? '').trim().slice(0, 60) || null;
        if (!roleQuery) continue;
        tasks.push({
          label: 'role_presence',
          run: () =>
            this.factsGateway.query({
              ...base,
              queryType: 'role_presence',
              roleQuery,
            }),
        });
      } else {
        tasks.push({
          label: queryType,
          run: () => this.factsGateway.query({ ...base, queryType }),
        });
      }
    }

    if (!tasks.length) return '';

    const settled = await Promise.allSettled(tasks.map((t) => t.run()));
    const lines: string[] = [];
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i]!;
      const label = tasks[i]!.label;
      if (s.status === 'rejected') {
        this.logger.warn('foundry.replay.assemble_pack.facts_query_rejected', {
          companyId: params.companyId,
          roomId: params.roomId,
          messageId: params.messageId,
          traceId,
          queryType: label,
          error: formatUnknownCatchError(s.reason),
        });
        continue;
      }
      const line = this.formatFactsQueryLine(label, s.value as Record<string, unknown>);
      if (line) lines.push(`- ${line}`);
    }

    if (!lines.length) return '';
    return `【事实查询 — 权威预取】（facts.query ${tasks.map((t) => t.label).join(' / ')}）\n${lines.join('\n')}`.slice(
      0,
      MAIN_ROOM_REPLAY_FACT_LAYER_CHAR_LIMITS.factsAuthoritativePrefetch,
    );
  }
}
