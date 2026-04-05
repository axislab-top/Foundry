import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import { GroupChatContextService } from './group-chat-context.service.js';
import { COLLAB_LLM_TRACE } from '../../common/logging/collab-llm-trace.util.js';

/**
 * 讨论模式：轮次计数、关键词收敛、CEO 简要纪要（系统消息）。
 */
@Injectable()
export class DiscussionCollabService {
  private readonly logger = new Logger(DiscussionCollabService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly collabLlm: CollaborationLlmBridgeService,
    private readonly groupChat: GroupChatContextService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async onHumanMessage(params: {
    companyId: string;
    roomId: string;
    threadId: string | null | undefined;
    content: string;
    ceoAgentId: string | null;
    /** Phase 3：CEO 控场（先发协调语 + 线程元数据供后续 Agent 发言过滤） */
    ceoModeration?: {
      actionSummary?: string;
      allowedAgentIds: string[];
      maxConcurrent: number;
    };
  }): Promise<void> {
    const timeoutMs = this.config.getCollaborationMentionRpcTimeoutMs();
    this.logger.log(`${COLLAB_LLM_TRACE} | discussion.onHumanMessage`, {
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId ?? null,
      hasCeoModeration: Boolean(params.ceoModeration),
      contentLen: params.content.length,
    });
    if (params.threadId) {
      await firstValueFrom(
        this.apiRpc
          .send<unknown>('collaboration.threads.incrementRound', {
            companyId: params.companyId,
            actor: this.workerActor(),
            threadId: params.threadId,
          })
          .pipe(timeout(timeoutMs)),
      );
    }

    const mod = params.ceoModeration;
    if (params.threadId && mod && (mod.allowedAgentIds.length > 0 || (mod.actionSummary && mod.actionSummary.trim()))) {
      try {
        await firstValueFrom(
          this.apiRpc
            .send<unknown>('collaboration.threads.mergeMetadata', {
              companyId: params.companyId,
              actor: this.workerActor(),
              threadId: params.threadId,
              metadata: {
                discussionModeration: {
                  allowedAgentIds: mod.allowedAgentIds.slice(0, mod.maxConcurrent),
                  maxConcurrent: mod.maxConcurrent,
                  roundStartedAt: new Date().toISOString(),
                  spokenAgentIdsThisRound: [],
                },
              },
            })
            .pipe(timeout(timeoutMs)),
        );
      } catch (e: unknown) {
        this.logger.warn('mergeMetadata discussionModeration failed', {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (params.ceoAgentId && mod) {
      const summary = mod.actionSummary?.trim() ?? '';
      const allow = mod.allowedAgentIds.slice(0, Math.max(1, mod.maxConcurrent));
      const lines: string[] = [];
      if (summary) lines.push(`【CEO】${summary}`);
      if (allow.length > 0) {
        const short = (id: string) => (id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id);
        lines.push(
          `本轮先请至多 ${mod.maxConcurrent} 位同事依次发言（优先：${allow.map(short).join('、')}），其他人请稍候，避免刷屏。`,
        );
      }
      if (lines.length > 0) {
        try {
          await firstValueFrom(
            this.apiRpc
              .send<unknown>('collaboration.messages.appendAgent', {
                companyId: params.companyId,
                actor: this.workerActor(),
                roomId: params.roomId,
                agentId: params.ceoAgentId,
                content: lines.join('\n').slice(0, 8000),
                messageType: 'text',
                threadId: params.threadId ?? undefined,
                metadata: { ceoDiscussionModeration: true },
              })
              .pipe(timeout(timeoutMs)),
          );
        } catch (e: unknown) {
          this.logger.warn('CEO moderation append failed', {
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    const converge =
      /(讨论结束|收敛共识|方案定了|到此为止|finalize|conclude\s+discussion)/i.test(
        params.content.trim(),
      );
    if (converge && params.threadId) {
      await firstValueFrom(
        this.apiRpc
          .send<unknown>('collaboration.threads.update', {
            companyId: params.companyId,
            actor: this.workerActor(),
            threadId: params.threadId,
            status: 'converged',
            summary: params.content.slice(0, 2000),
          })
          .pipe(timeout(timeoutMs)),
      );
      this.logger.log('Discussion thread converged', {
        companyId: params.companyId,
        threadId: params.threadId,
      });
      return;
    }

    // 勿用「仅含 @CEO」触发纪要：否则「@CEO 你好」会误走 LLM 并因未配置密钥整段失败。
    const needsCeoDigest =
      params.ceoAgentId &&
      /(?:^|[\s，,])(?:@CEO|@ceo)\s*[,，.]?\s*(总结|纪要|归纳|梳理|概括|结论|brief|recap|summarize|summary)|CEO[,，]?\s*总结|请\s*CEO\s*(总结|纪要)|会议纪要/i.test(
        params.content,
      );
    if (!needsCeoDigest || !params.ceoAgentId) return;

    this.logger.log(`${COLLAB_LLM_TRACE} | discussion.digest_llm_start`, {
      companyId: params.companyId,
      roomId: params.roomId,
      ceoAgentId: params.ceoAgentId,
    });

    let model;
    try {
      model = await this.collabLlm.createChatModel({
        companyId: params.companyId,
        agentId: params.ceoAgentId,
        fallbackModelName: this.config.getCollabDirectReplyModel(),
        llmTimeoutMs: this.config.getCollaborationLlmTimeoutMs(),
        maxOutputTokens: 1024,
      });
    } catch (e: unknown) {
      this.logger.warn('Discussion digest skipped: no LLM credentials', {
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    const digestInput = await this.groupChat.buildDiscussionDigestInput({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId ?? null,
      anchorContent: params.content,
      timeoutMs,
    });
    const lines = digestInput.combinedHumanText;

    let res;
    try {
      this.logger.log(`${COLLAB_LLM_TRACE} | discussion.digest_llm_invoke`, {
        roomId: params.roomId,
        contextChars: lines.length,
        memoryRefs: digestInput.memoryEntryIds.length,
      });
      res = await model.invoke([
        new SystemMessage(
          'You are the CEO moderator. Write a short bullet summary of consensus and open points in the same language as the chat. Max 8 bullet lines.',
        ),
        new HumanMessage(lines),
      ]);
    } catch (e: unknown) {
      this.logger.warn('Discussion digest LLM failed', {
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
      });
      return;
    }
    const digest =
      typeof res.content === 'string'
        ? res.content
        : Array.isArray(res.content)
          ? res.content.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join('')
          : String(res.content);

    const memoryReferences = digestInput.memoryEntryIds
      .slice(0, 48)
      .map((memoryEntryId) => ({ memoryEntryId }));

    await firstValueFrom(
      this.apiRpc
        .send<unknown>('collaboration.messages.appendAgent', {
          companyId: params.companyId,
          actor: this.workerActor(),
          roomId: params.roomId,
          agentId: params.ceoAgentId,
          content: `【讨论纪要】\n${digest.trim().slice(0, 8000)}`,
          messageType: 'text',
          threadId: params.threadId ?? undefined,
          metadata: { discussionDigest: true },
          memoryReferences: memoryReferences.length ? memoryReferences : undefined,
        })
        .pipe(timeout(timeoutMs)),
    );
  }
}
