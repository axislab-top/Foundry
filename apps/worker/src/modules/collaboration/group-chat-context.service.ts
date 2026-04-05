import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { COLLAB_LLM_TRACE } from '../../common/logging/collab-llm-trace.util.js';

type ChatListItem = {
  id: string;
  content?: string | null;
  senderType?: string;
  messageType?: string;
  threadId?: string | null;
};

type MemorySearchHit = {
  id: string;
  content: string;
  score: number;
  namespace?: string;
  sourceType?: string;
};

type RoomMemberRow = {
  memberType: string;
  memberId: string;
};

/**
 * 群聊分层上下文（Working + Session/Episodic 检索 + 结构化成员表）。
 * 供 CEO/Agent 直聊、讨论纪要等路径复用，避免各写一套 list/search。
 */
@Injectable()
export class GroupChatContextService {
  private readonly logger = new Logger(GroupChatContextService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  static clipText(s: string | null | undefined, max: number): string {
    const t = (s ?? '').trim();
    if (!t) return '';
    return t.length <= max ? t : `${t.slice(0, max)}…`;
  }

  /**
   * L1：近期消息 → LangChain 多轮（不含当前触发条）。
   */
  async loadTranscriptMessages(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    excludeMessageId: string;
    maxMessages: number;
    timeoutMs: number;
  }): Promise<BaseMessage[]> {
    const actor = this.workerActor();
    const fetchLimit = Math.min(Math.max(params.maxMessages + 8, 16), 200);
    let items: ChatListItem[] = [];
    try {
      const list = await firstValueFrom(
        this.apiRpc
          .send<{ items?: ChatListItem[] }>('collaboration.messages.list', {
            companyId: params.companyId,
            actor,
            roomId: params.roomId,
            limit: fetchLimit,
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      items = list?.items ?? [];
    } catch (e: unknown) {
      this.logger.warn('group_chat.transcript_fetch_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
      });
      return [];
    }

    const tid = params.threadId?.trim();
    if (tid) {
      items = items.filter((m) => (m.threadId ?? null) === tid);
    } else {
      const mainOnly = items.filter((m) => m.threadId == null);
      items = mainOnly.length > 0 ? mainOnly : items;
    }

    items = items.filter((m) => m.id !== params.excludeMessageId);
    const slice = items.slice(-params.maxMessages);

    const out: BaseMessage[] = [];
    for (const m of slice) {
      const raw = (m.content ?? '').trim();
      if (!raw) continue;
      const clipped = GroupChatContextService.clipText(raw, 3500);
      const mt = m.messageType ?? 'text';
      if (mt === 'system') continue;
      if (m.senderType === 'human') {
        out.push(new HumanMessage(clipped));
      } else if (m.senderType === 'agent') {
        out.push(new AIMessage(clipped));
      }
    }
    return out;
  }

  /**
   * 讨论纪要等：扁平文本（时间正序），不 exclude（包含最新一条）。
   */
  async loadTranscriptFlattened(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    limit: number;
    timeoutMs: number;
  }): Promise<string> {
    const actor = this.workerActor();
    let items: ChatListItem[] = [];
    try {
      const list = await firstValueFrom(
        this.apiRpc
          .send<{ items?: ChatListItem[] }>('collaboration.messages.list', {
            companyId: params.companyId,
            actor,
            roomId: params.roomId,
            limit: Math.min(params.limit, 200),
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      items = list?.items ?? [];
    } catch (e: unknown) {
      this.logger.warn('group_chat.transcript_flat_fetch_failed', {
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
      });
      return '';
    }

    const tid = params.threadId?.trim();
    if (tid) {
      items = items.filter((m) => (m.threadId ?? null) === tid);
    } else {
      const mainOnly = items.filter((m) => m.threadId == null);
      items = mainOnly.length > 0 ? mainOnly : items;
    }

    return items
      .map((m) => {
        const c = GroupChatContextService.clipText(m.content ?? '', 500);
        return `${m.senderType ?? '?'}: ${c}`;
      })
      .join('\n');
  }

  /**
   * L2+L3：分层混合检索（session→agent→dept→company），绑定当前房间。
   */
  async buildRetrievedMemoryBlock(params: {
    companyId: string;
    roomId: string;
    query: string;
    timeoutMs: number;
    topK: number;
  }): Promise<{ block: string; entryIds: string[] }> {
    const actor = this.workerActor();
    const q = GroupChatContextService.clipText(params.query, 4000);
    if (!q) {
      return { block: '', entryIds: [] };
    }
    try {
      const hits = await firstValueFrom(
        this.apiRpc
          .send<MemorySearchHit[]>('memory.search', {
            companyId: params.companyId,
            actor,
            data: {
              query: q,
              roomId: params.roomId,
              topK: Math.min(Math.max(params.topK, 1), 24),
            },
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      const list = Array.isArray(hits) ? hits : [];
      if (!list.length) {
        return {
          block: '【会话相关知识检索】（暂无命中；可能尚未写入会话记忆或未开启 SESSION 索引。）',
          entryIds: [],
        };
      }
      const lines = list.map((h) => {
        const prev = GroupChatContextService.clipText(h.content, 600);
        const ns = h.namespace ?? '';
        const st = h.sourceType ?? '';
        return `- [memory_entry id=${h.id} score=${Number(h.score).toFixed(4)} ns=${ns} type=${st}] ${prev}`;
      });
      return {
        block: `【会话相关知识检索（memory_entry，供对照与引用；优先与当前讨论相关）】\n${lines.join('\n')}`,
        entryIds: list.map((h) => h.id),
      };
    } catch (e: unknown) {
      this.logger.warn('group_chat.memory_search_failed', {
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
      });
      return {
        block: '【会话相关知识检索】（暂时无法检索，请稍后重试。）',
        entryIds: [],
      };
    }
  }

  /**
   * 结构化：房间活跃成员（Actor 粒度）。
   */
  async buildRoomMembersBlock(params: {
    companyId: string;
    roomId: string;
    timeoutMs: number;
  }): Promise<string> {
    try {
      const rows = await firstValueFrom(
        this.apiRpc
          .send<RoomMemberRow[]>('collaboration.members.list', {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      const list = Array.isArray(rows) ? rows : [];
      if (!list.length) {
        return '【本房间成员】（暂无活跃成员记录。）';
      }
      const lines = list.map(
        (m) => `- ${m.memberType}: ${m.memberId}`,
      );
      return `【本房间当前成员（active）】\n${lines.join('\n')}`;
    } catch (e: unknown) {
      this.logger.warn('group_chat.members_fetch_failed', {
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
      });
      return '【本房间成员】（暂时无法拉取。）';
    }
  }

  /**
   * 直聊/多 Agent 回复：一次拉齐 L1 文本块 + 成员 + 混合检索。
   */
  async buildAuxiliaryContextForReply(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    latestUserText: string;
    excludeMessageId: string;
    timeoutMs: number;
  }): Promise<{
    transcript: BaseMessage[];
    auxiliarySystemText: string;
    memoryEntryIds: string[];
  }> {
    const histLimit = this.config.getCollabDirectReplyHistoryLimit();
    const retrievalOn = this.config.isGroupChatMemoryRetrievalEnabled();
    const topK = this.config.getGroupChatMemoryRetrievalTopK();

    const transcript =
      histLimit > 0
        ? await this.loadTranscriptMessages({
            companyId: params.companyId,
            roomId: params.roomId,
            threadId: params.threadId ?? null,
            excludeMessageId: params.excludeMessageId,
            maxMessages: histLimit,
            timeoutMs: params.timeoutMs,
          })
        : [];

    const [membersBlock, memPack] = await Promise.all([
      this.buildRoomMembersBlock({
        companyId: params.companyId,
        roomId: params.roomId,
        timeoutMs: params.timeoutMs,
      }),
      retrievalOn
        ? this.buildRetrievedMemoryBlock({
            companyId: params.companyId,
            roomId: params.roomId,
            query: params.latestUserText,
            timeoutMs: params.timeoutMs,
            topK,
          })
        : Promise.resolve({ block: '', entryIds: [] as string[] }),
    ]);

    const parts = [membersBlock, memPack.block].filter((p) => p.trim().length > 0);
    return {
      transcript,
      auxiliarySystemText: parts.join('\n\n'),
      memoryEntryIds: memPack.entryIds,
    };
  }

  /**
   * 讨论模式 CEO 纪要：扁平 transcript + 检索块。
   */
  async buildDiscussionDigestInput(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    anchorContent: string;
    timeoutMs: number;
  }): Promise<{ combinedHumanText: string; memoryEntryIds: string[] }> {
    const retrievalOn = this.config.isGroupChatMemoryRetrievalEnabled();
    const topK = this.config.getGroupChatMemoryRetrievalTopK();
    const limit = this.config.getGroupChatDigestTranscriptLimit();

    const [flat, memPack] = await Promise.all([
      this.loadTranscriptFlattened({
        companyId: params.companyId,
        roomId: params.roomId,
        threadId: params.threadId ?? null,
        limit,
        timeoutMs: params.timeoutMs,
      }),
      retrievalOn
        ? this.buildRetrievedMemoryBlock({
            companyId: params.companyId,
            roomId: params.roomId,
            query: params.anchorContent,
            timeoutMs: params.timeoutMs,
            topK,
          })
        : Promise.resolve({ block: '', entryIds: [] as string[] }),
    ]);

    const combined = [memPack.block, '--- 近期消息 ---', flat]
      .filter((s) => s.trim().length > 0)
      .join('\n')
      .slice(0, 12_000);

    return { combinedHumanText: combined, memoryEntryIds: memPack.entryIds };
  }
}
