import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import { GroupChatContextService } from './group-chat-context.service.js';
import { COLLAB_LLM_TRACE } from '../../common/logging/collab-llm-trace.util.js';

/** agents.findOne RPC 中与直聊相关的字段（实体为 expertise / systemPrompt，无 description） */
type DirectReplyAgentRow = {
  id: string;
  name: string;
  role: string;
  status?: string;
  expertise?: string | null;
  systemPrompt?: string | null;
};

type AgentsFindAllRpcResult = {
  items: DirectReplyAgentRow[];
  total: number;
  page?: number;
  pageSize?: number;
};

type EffectiveSkillSnap = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
};

type EffectiveSkillSnapshotsRpcResult = {
  skillIds: string[];
  skills: EffectiveSkillSnap[];
};

/** companies.findOne RPC 精简字段 */
type CompanyProfileRpcRow = {
  name?: string;
  industry?: string | null;
  scale?: string | null;
};

@Injectable()
export class DirectCollabReplyService {
  private readonly logger = new Logger(DirectCollabReplyService.name);

  private static clipText(s: string | null | undefined, max: number): string {
    const t = (s ?? '').trim();
    if (!t) return '';
    return t.length <= max ? t : `${t.slice(0, max)}…`;
  }

  constructor(
    private readonly config: ConfigService,
    private readonly collabLlm: CollaborationLlmBridgeService,
    private readonly groupChat: GroupChatContextService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  /**
   * 把租户内真实 Agent 名册与当前 Agent 已绑定技能注入提示词，避免模型用「产品经理、架构师」等常识编造团队。
   */
  private async buildPlatformFactsBlock(params: {
    companyId: string;
    agentId: string;
    agentName: string;
    timeoutMs: number;
  }): Promise<string> {
    const actor = this.workerActor();
    const lines: string[] = [
      '【平台数据】以下条目来自本平台当前租户。用户若问：公司叫什么、公司名、本公司名称，或有哪些 Agent / 同事 / 团队，或问你（当前回复者）有哪些 Skills / 技能，必须严格依据本节；不得臆造。',
    ];

    try {
      const company = await firstValueFrom(
        this.apiRpc
          .send<CompanyProfileRpcRow>('companies.findOne', {
            companyId: params.companyId,
            id: params.companyId,
            actor,
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      const nm = company?.name?.trim();
      if (nm) {
        const bits: string[] = [];
        const ind = company?.industry?.trim();
        if (ind) bits.push(`行业 ${ind}`);
        const sc = company?.scale?.trim();
        if (sc) bits.push(`规模 ${sc}`);
        const suffix = bits.length ? `（${bits.join('；')}）` : '';
        lines.push(`当前公司名称：${nm}${suffix}；tenant company_id=${params.companyId}`);
      } else {
        lines.push(
          `当前公司名称：（平台未返回名称，company_id=${params.companyId}；请联系管理员检查公司记录。）`,
        );
      }
    } catch (e: unknown) {
      this.logger.warn('direct_reply.company_fetch_failed', {
        companyId: params.companyId,
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
      });
      lines.push(
        '当前公司名称：（暂时无法从平台拉取公司档案，请稍后重试。用户若已知公司名可自行说明。）',
      );
    }

    try {
      const list = await firstValueFrom(
        this.apiRpc
          .send<AgentsFindAllRpcResult>('agents.findAll', {
            companyId: params.companyId,
            actor,
            page: 1,
            pageSize: 100,
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      const items = list?.items ?? [];
      const total = list?.total ?? items.length;
      const roster =
        items.length === 0
          ? '（当前公司尚无 Agent 记录）'
          : items
              .map((a) => {
                const ex = DirectCollabReplyService.clipText(a.expertise ?? null, 100);
                const st = a.status ?? 'active';
                return `- ${a.name}（role=${a.role}，id=${a.id}，status=${st}）${ex ? ` — ${ex}` : ''}`;
              })
              .join('\n');
      lines.push(`本公司 Agent（共 ${total} 名，下列至多 100 条）：`, roster);
      if (total > items.length) {
        lines.push(
          `（尚有 ${total - items.length} 名未列出，请在管理后台「Agents」分页查看完整名单。）`,
        );
      }
    } catch (e: unknown) {
      this.logger.warn('direct_reply.roster_fetch_failed', {
        companyId: params.companyId,
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
      });
      lines.push('本公司 Agent 名册：（暂时无法从平台拉取，请稍后重试或联系管理员。）');
    }

    try {
      const snaps = await firstValueFrom(
        this.apiRpc
          .send<EffectiveSkillSnapshotsRpcResult>('agents.effectiveSkillSnapshots', {
            companyId: params.companyId,
            actor,
            id: params.agentId,
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      const skills = snaps?.skills ?? [];
      const skillLines =
        skills.length === 0
          ? '（当前未绑定已发布技能，或技能列表为空）'
          : skills
              .map((s) => {
                const cat = s.category?.trim();
                const desc = DirectCollabReplyService.clipText(s.description ?? null, 120);
                const catPart = cat ? `（${cat}）` : '';
                const descPart = desc ? `：${desc}` : '';
                return `- ${s.name}${catPart}${descPart}`;
              })
              .join('\n');
      lines.push(`你（当前回复者「${params.agentName}」）在平台已绑定的技能：`, skillLines);
    } catch (e: unknown) {
      this.logger.warn('direct_reply.skills_fetch_failed', {
        companyId: params.companyId,
        agentId: params.agentId,
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
      });
      lines.push(
        `你（当前回复者「${params.agentName}」）在平台已绑定的技能：（暂时无法从平台拉取，请稍后重试。）`,
      );
    }

    return lines.join('\n');
  }

  async reply(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    userMessage: string;
    sourceMessageId: string;
    threadId?: string | null;
  }): Promise<void> {
    const timeoutMs = this.config.getCollaborationMentionRpcTimeoutMs();
    this.logger.log(`${COLLAB_LLM_TRACE} | direct_reply.start`, {
      companyId: params.companyId,
      roomId: params.roomId,
      agentId: params.agentId,
      sourceMessageId: params.sourceMessageId,
      threadId: params.threadId ?? null,
      userMessageLen: params.userMessage.length,
    });
    const agent = await firstValueFrom(
      this.apiRpc
        .send<DirectReplyAgentRow & { llmModel?: string | null; llmKeyId?: string | null }>(
          'agents.findOne',
          {
            companyId: params.companyId,
            actor: this.workerActor(),
            id: params.agentId,
          } as Record<string, unknown>,
        )
        .pipe(timeout(timeoutMs)),
    );
    const name = agent?.name ?? 'Agent';
    const role = agent?.role ?? 'member';
    const systemPromptClip = DirectCollabReplyService.clipText(agent?.systemPrompt ?? null, 6000);
    const expertiseClip = DirectCollabReplyService.clipText(agent?.expertise ?? null, 2000);
    const persona =
      systemPromptClip
        ? `角色设定（来自平台配置）：\n${systemPromptClip}`
        : expertiseClip
          ? `专业说明（来自平台配置）：\n${expertiseClip}`
          : '你是该公司的协作者；请根据平台数据与用户问题专业、简洁地回复。';

    this.logger.log(`${COLLAB_LLM_TRACE} | direct_reply.agent_loaded`, {
      agentId: params.agentId,
      name,
      role,
      llmModel: agent?.llmModel ?? null,
      llmKeyId: agent?.llmKeyId ?? null,
    });

    const [model, platformFacts, layers] = await Promise.all([
      this.collabLlm.createChatModel({
        companyId: params.companyId,
        agentId: params.agentId,
        agent: {
          role: agent?.role,
          llmModel: agent?.llmModel,
          llmKeyId: agent?.llmKeyId,
        },
        fallbackModelName: this.config.getCollabDirectReplyModel(),
        llmTimeoutMs: this.config.getCollaborationLlmTimeoutMs(),
        maxOutputTokens: 2048,
      }),
      this.buildPlatformFactsBlock({
        companyId: params.companyId,
        agentId: params.agentId,
        agentName: name,
        timeoutMs,
      }),
      this.groupChat.buildAuxiliaryContextForReply({
        companyId: params.companyId,
        roomId: params.roomId,
        threadId: params.threadId ?? null,
        latestUserText: params.userMessage,
        excludeMessageId: params.sourceMessageId,
        timeoutMs,
      }),
    ]);

    const transcriptMsgs = layers.transcript;
    const aux = layers.auxiliarySystemText.trim();

    this.logger.log(`${COLLAB_LLM_TRACE} | direct_reply.llm_invoke`, {
      agentId: params.agentId,
      sourceMessageId: params.sourceMessageId,
      transcriptTurns: transcriptMsgs.length,
      memoryRefs: layers.memoryEntryIds.length,
    });

    const sys = `You are ${name}, role=${role}.

${persona}

${platformFacts}

${aux}

Below system message, you may receive recent chat history in this room/thread (Human / Assistant turns), then the latest user message.
Reply concisely in the same language as the user. Stay in character.
When answering factual questions about the company name, official roster, or your bound skills, use the 【平台数据】section.
If the user gave explicit instructions earlier in this same thread (including jokes, roleplay, or how to answer a specific follow-up question), honor those when safe and consistent — including when they conflict with a literal reading of the Agent roster.
Use 【会话相关知识检索】only as supporting context when relevant; it may overlap with chat history.
No markdown code fences unless needed.`;
    const res = await model.invoke([
      new SystemMessage(sys),
      ...transcriptMsgs,
      new HumanMessage(params.userMessage),
    ]);
    const text =
      typeof res.content === 'string'
        ? res.content
        : Array.isArray(res.content)
          ? res.content.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join('')
          : String(res.content);

    this.logger.log(`${COLLAB_LLM_TRACE} | direct_reply.llm_done`, {
      agentId: params.agentId,
      replyChars: text.length,
    });

    const memoryReferences = layers.memoryEntryIds
      .slice(0, 48)
      .map((memoryEntryId) => ({ memoryEntryId }));

    await firstValueFrom(
      this.apiRpc
        .send<unknown>('collaboration.messages.appendAgent', {
          companyId: params.companyId,
          actor: this.workerActor(),
          roomId: params.roomId,
          agentId: params.agentId,
          content: text.trim().slice(0, 16000),
          messageType: 'text',
          threadId: params.threadId ?? undefined,
          metadata: {
            directReplyToMessageId: params.sourceMessageId,
          },
          memoryReferences: memoryReferences.length ? memoryReferences : undefined,
        })
        .pipe(timeout(timeoutMs)),
    );

    this.logger.log(`${COLLAB_LLM_TRACE} | direct_reply.append_ok`, {
      companyId: params.companyId,
      roomId: params.roomId,
      agentId: params.agentId,
      sourceMessageId: params.sourceMessageId,
    });
  }
}
