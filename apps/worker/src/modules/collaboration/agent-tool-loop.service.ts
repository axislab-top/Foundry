import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import { MemoryContextAssemblerService } from './memory-context-assembler.service.js';
import { CeoLayerConfigResolverService } from './ceo/resolver/ceo-layer-config-resolver.service.js';
import { AgentDirectSkillToolsService } from './direct/agent-direct-skill-tools.service.js';
import { DirectCollabReplyService } from './direct-collab-reply.service.js';
import { CollaborationLlmTokenStreamService, buildDirectReplyStreamId } from './llm/collaboration-llm-token-stream.service.js';
import { ConversationOutputSanitizerService } from './conversation-output-sanitizer.service.js';
import { AgentExecutionService } from '../agents/services/agent-execution.service.js';
import { AgentsActiveDirectoryCacheService } from './context/agents-active-directory-cache.service.js';
import { ASK_COLLEAGUE_TOOL_NAME, ASK_COLLEAGUE_TOOL } from './direct/ask-colleague-tool.js';
import type { LightStructuredOutputV2 } from './ceo/dto/ceo-v2-pipeline.types.js';
import { NextStep } from '@foundry/contracts/types/collaboration';

export type AgentToolLoopResult = {
  text: string;
  agentId: string;
  agentName: string;
  tokenStreamed?: boolean;
  telemetry: {
    roundsUsed: number;
    toolCallsExecuted: number;
    toolNames: string[];
  };
};

export type AskColleagueContext = {
  depth: number;
  visitedAgentIds: Set<string>;
  deadlineMs: number;
};

/**
 * Phase 1: Agent 工具循环服务。
 *
 * 取代原有的 CEO replay delegate → evaluateDelegate → authorization → dispatch 流程，
 * 让 Agent 直接通过工具循环完成任务并回复用户。
 *
 * 流程：Intent（判断找谁）→ AgentToolLoop（Agent 直接干活）→ 回复群聊
 */
@Injectable()
export class AgentToolLoopService {
  private readonly logger = new Logger(AgentToolLoopService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly collabLlmBridge: CollaborationLlmBridgeService,
    private readonly memoryContextAssembler: MemoryContextAssemblerService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly agentDirectSkillTools: AgentDirectSkillToolsService,
    private readonly directReply: DirectCollabReplyService,
    private readonly tokenStream: CollaborationLlmTokenStreamService,
    private readonly agentsActiveDirectory: AgentsActiveDirectoryCacheService,
    @Inject(forwardRef(() => AgentExecutionService))
    private readonly agentExecution: AgentExecutionService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  /**
   * 运行 Agent 工具循环：获取 Agent → 组装上下文 → 构建工具 → LLM 工具循环 → 返回文本。
   */
  async run(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    sourceMessageId: string;
    threadId?: string | null;
    userText: string;
    humanSenderId?: string | null;
    ceoAgentId?: string | null;
    traceId: string;
    orgSnapshotPromptBlock?: string | null;
    roomMemberPromptBlock?: string | null;
    askColleagueContext?: AskColleagueContext;
  }): Promise<AgentToolLoopResult | null> {
    const startedAt = Date.now();

    try {
      // 1. 获取 Agent 信息
      const agent = await firstValueFrom(
        this.apiRpc
          .send<{ id?: string; name?: string; role?: string; systemPrompt?: string | null; llmModel?: string | null }>(
            'agents.findOne',
            { companyId: params.companyId, actor: this.workerActor(), id: params.agentId },
          )
          .pipe(timeout({ first: 5_000 })),
      ).catch(() => null);

      if (!agent?.id) {
        this.logger.warn('foundry.agent_tool_loop.agent_not_found', {
          companyId: params.companyId,
          agentId: params.agentId,
        });
        return null;
      }

      // 2. 组装上下文（记忆、转录、组织信息）
      // ask_colleague 嵌套调用 roomId 为空时跳过 RPC，避免无意义网络往返
      const emptyAssembled = {
        messages: [] as BaseMessage[],
        auxiliarySystemText: '',
        diagnostics: { transcriptCount: 0, compressionTriggered: false, estimatedInputTokens: 0, estimatedOutputTokens: 0, transcriptKeptTurns: 0 },
      };
      const assembled = params.roomId
        ? await this.memoryContextAssembler
            .assembleForDirected({
              companyId: params.companyId,
              roomId: params.roomId,
              agentId: params.agentId,
              agentRole: typeof agent?.role === 'string' ? agent.role : null,
              threadId: params.threadId ?? null,
              latestUserText: params.userText,
              messageId: params.sourceMessageId,
              humanUserId: params.humanSenderId ?? null,
              ceoAgentId: params.ceoAgentId ?? null,
            })
            .catch(() => emptyAssembled)
        : emptyAssembled;

      // 3. 获取 Agent 技能工具
      const useSkills = this.config.isDirectAgentSkillsEnabled();
      const skillPack = useSkills
        ? await this.agentDirectSkillTools
            .build({ companyId: params.companyId, agentId: params.agentId })
            .catch(() => null)
        : null;

      // 3b. Phase 2: 注入 tool.ask_colleague（如果启用且深度允许）
      const acCtx = params.askColleagueContext;
      const askColleagueEnabled = this.config.isAskColleagueToolEnabled();
      const maxDepth = this.config.getAskColleagueMaxDepth();
      const canInjectAskColleague = askColleagueEnabled && (!acCtx || acCtx.depth < maxDepth);
      let effectiveSkillPack = skillPack;
      if (canInjectAskColleague) {
        if (effectiveSkillPack) {
          effectiveSkillPack.tools.push(ASK_COLLEAGUE_TOOL);
          effectiveSkillPack.allowedToolNames.add(ASK_COLLEAGUE_TOOL_NAME);
        } else {
          // No skills but ask_colleague is enabled — create minimal pack
          effectiveSkillPack = {
            tools: [ASK_COLLEAGUE_TOOL],
            allowedToolNames: new Set<string>([ASK_COLLEAGUE_TOOL_NAME]),
            capabilitySkillIds: [],
            skillCatalog: [],
            boundMcpToolNames: [],
            skillCount: 0,
            usesToolCatalog: false,
            progressiveDisclosure: false,
          };
        }
      }

      // 4. 解析模型配置（复用 replay 层）
      const replaySetting = await this.ceoLayerConfigResolver.resolveLayerSetting(
        params.companyId,
        'replay',
      );
      const modelName = String(replaySetting.modelName ?? '').trim();
      if (!modelName) {
        this.logger.warn('foundry.agent_tool_loop.no_model', { companyId: params.companyId });
        return null;
      }

      const maxOut = typeof replaySetting.maxTokens === 'number' && replaySetting.maxTokens > 0
        ? Math.min(16000, Math.max(1024, Math.floor(replaySetting.maxTokens)))
        : 8000;

      // 5. 创建 LLM 模型
      const model = await this.collabLlmBridge.createChatModel({
        companyId: params.companyId,
        agentId: params.agentId,
        fallbackModelName: modelName,
        llmTimeoutMs: Math.max(30_000, this.config.getCollaborationMentionRpcTimeoutMs() * 3),
        maxOutputTokens: maxOut,
        temperatureOverride: 0.35,
        ceoContext: 'replay',
        trace: { messageId: params.sourceMessageId, callsite: 'agent_tool_loop' },
        meteringAgentId: params.agentId,
      });

      // 6. 构建系统提示
      const systemPrompt = this.buildSystemPrompt({
        agent: {
          name: agent.name ?? undefined,
          role: agent.role ?? undefined,
          systemPrompt: agent.systemPrompt ?? null,
        },
        auxiliarySystemText: assembled.auxiliarySystemText,
        orgSnapshotPromptBlock: params.orgSnapshotPromptBlock ?? null,
        roomMemberPromptBlock: params.roomMemberPromptBlock ?? null,
        askColleagueAvailable: canInjectAskColleague,
        availableToolNames: [...(effectiveSkillPack?.allowedToolNames ?? [])],
      });

      // 7. 构建消息序列
      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        ...assembled.messages,
        new HumanMessage(params.userText),
      ];

      // 8. 绑定工具
      const hasTools = Boolean(effectiveSkillPack?.tools?.length);
      this.logger.log('foundry.agent_tool_loop.tool_binding', {
        companyId: params.companyId,
        agentId: params.agentId,
        hasTools,
        toolCount: effectiveSkillPack?.tools?.length ?? 0,
        toolNames: (effectiveSkillPack?.tools ?? []).map(
          (t) => (t as { function?: { name?: string } })?.function?.name ?? 'unknown',
        ),
        allowedToolNames: [...(effectiveSkillPack?.allowedToolNames ?? [])],
        askColleagueInjected: canInjectAskColleague,
      });
      // Sanitize tool names for API compatibility: some providers (DeepSeek) reject dots.
      // Replace "." with "__" in tool names sent to the LLM, then map back when executing.
      const sanitizeToolName = (name: string) => name.replace(/\./g, '__');
      const toolNameMapping = new Map<string, string>(); // sanitized -> original
      const sanitizedTools = hasTools
        ? effectiveSkillPack!.tools.map((t) => {
            const origName = (t as { function?: { name?: string } })?.function?.name ?? '';
            const sanitized = sanitizeToolName(origName);
            if (sanitized !== origName) {
              toolNameMapping.set(sanitized, origName);
            }
            return {
              ...t,
              function: {
                ...(t as { function?: Record<string, unknown> }).function,
                name: sanitized,
              },
            };
          })
        : [];

      // Use bindTools() — the proper LangChain method for tool binding.
      // bind({ tools }) may not correctly pass tools to some providers (e.g. DeepSeek).
      const bindable = model as unknown as {
        bindTools?: (tools: unknown[], kwargs?: Record<string, unknown>) => { invoke: (m: BaseMessage[]) => Promise<unknown> };
        bind?: (opts: { tools: unknown[]; tool_choice?: string }) => { invoke: (m: BaseMessage[]) => Promise<unknown> };
        invoke?: (m: BaseMessage[]) => Promise<unknown>;
      };
      let modelWithTools: { invoke: (m: BaseMessage[]) => Promise<unknown> } = model as unknown as { invoke: (m: BaseMessage[]) => Promise<unknown> };
      if (hasTools) {
        if (typeof bindable.bindTools === 'function') {
          modelWithTools = bindable.bindTools(sanitizedTools as unknown[], { tool_choice: 'auto' });
        } else if (typeof bindable.bind === 'function') {
          modelWithTools = bindable.bind({ tools: sanitizedTools as unknown[], tool_choice: 'auto' });
        }
      }

      const traceId = params.traceId;
      const maxRounds = this.config.getDirectAgentSkillsMaxRounds(false);
      const maxCallsPerRound = this.config.getDirectAgentSkillsMaxCallsPerRound(false);
      const allowedToolNames = effectiveSkillPack?.allowedToolNames ?? new Set<string>();

      let text = '';
      let tokenStreamed = false;
      let roundsUsed = 0;
      let toolCallsExecuted = 0;
      const toolNames: string[] = [];

      if (hasTools) {
        // 9a. 工具循环模式
        // Track consecutive failures per tool to break stuck loops
        const toolFailures = new Map<string, number>(); // toolName -> consecutive failure count
        const MAX_CONSECUTIVE_FAILURES = 2;
        let lastNonEmptyText = text;

        for (let round = 0; round < maxRounds; round++) {
          const response = await (modelWithTools as { invoke: (m: BaseMessage[]) => Promise<unknown> }).invoke(messages);
          messages.push(response as BaseMessage);
          const roundText = this.extractTextContent(response);
          // Keep last non-empty text (don't overwrite with empty)
          if (roundText.trim()) {
            text = roundText;
            lastNonEmptyText = roundText;
          }

          const toolCalls = this.extractToolCalls(response).slice(0, maxCallsPerRound);
          this.logger.log('foundry.agent_tool_loop.llm_response', {
            companyId: params.companyId,
            agentId: params.agentId,
            round,
            textLength: roundText.length,
            textPreview: roundText.slice(0, 200),
            toolCallCount: toolCalls.length,
            toolCallNames: toolCalls.map((c) => c.name),
          });
          if (!toolCalls.length) break;

          roundsUsed = round + 1;
          let roundHadSuccess = false;
          let roundHadFailure = false;

          for (const call of toolCalls) {
            // Map sanitized name back to original (e.g. "memory__search" → "memory.search")
            const rawName = String(call.name ?? '').trim();
            const name = toolNameMapping.get(rawName) ?? rawName;
            if (!allowedToolNames.has(name)) {
              messages.push(
                new ToolMessage({
                  tool_call_id: call.id,
                  content: JSON.stringify({ ok: false, error: `TOOL_NOT_ALLOWED:${name}` }),
                }),
              );
              continue;
            }

            // Check if this tool has failed too many times consecutively
            const failures = toolFailures.get(name) ?? 0;
            if (failures >= MAX_CONSECUTIVE_FAILURES) {
              messages.push(
                new ToolMessage({
                  tool_call_id: call.id,
                  content: JSON.stringify({ ok: false, error: `TOOL_EXHAUSTED:${name} has failed ${failures} times consecutively. Stop calling this tool and respond directly to the user.` }),
                }),
              );
              continue;
            }

            toolNames.push(name);
            toolCallsExecuted += 1;
            const args = this.normalizeToolArgs(call.args);
            try {
              let content: string;
              if (name === ASK_COLLEAGUE_TOOL_NAME) {
                // Phase 2: tool.ask_colleague — 同步跨 Agent 工具循环
                const colleagueResult = await this.executeAskColleague({
                  companyId: params.companyId,
                  callerAgentId: params.agentId,
                  args,
                  traceId,
                  askColleagueContext: acCtx,
                });
                content = colleagueResult.content;
                // Merge colleague's nested tool names into parent telemetry
                for (const nested of colleagueResult.nestedToolNames) toolNames.push(nested);
              } else {
                content = await this.executeAgentSkill(
                  params.companyId,
                  params.agentId,
                  name,
                  args,
                  traceId,
                  effectiveSkillPack?.capabilitySkillIds,
                );
              }
              messages.push(new ToolMessage({ tool_call_id: call.id, content: content.slice(0, 16_000) }));
              // Reset failure count on success
              toolFailures.delete(name);
              roundHadSuccess = true;
            } catch (e: unknown) {
              const err = e instanceof Error ? e.message : String(e);
              messages.push(
                new ToolMessage({
                  tool_call_id: call.id,
                  content: JSON.stringify({ ok: false, error: err.slice(0, 1200) }),
                }),
              );
              // Track consecutive failures
              toolFailures.set(name, failures + 1);
              roundHadFailure = true;
            }
          }

          // If all tools in this round failed, break and do a final plain invocation
          if (roundHadFailure && !roundHadSuccess) {
            this.logger.log('foundry.agent_tool_loop.all_tools_failed_break', {
              companyId: params.companyId,
              agentId: params.agentId,
              round,
            });
            break;
          }
        }

        // If tool loop produced no meaningful text, do a final plain invocation
        // Inject a guidance message so the LLM knows to respond directly
        if (!text.trim() || toolCallsExecuted > 0) {
          // Add a human message guiding the LLM to respond directly
          messages.push(
            new HumanMessage(
              'Your tool calls have completed (some may have failed). ' +
              'Now respond directly to the user\'s original question with a complete, helpful answer in Chinese. ' +
              'Do not call any more tools. Do not just say you will ask someone — provide whatever information you can.',
            ),
          );
          const streamResult = await this.streamFinalResponse({
            model,
            messages,
            companyId: params.companyId,
            roomId: params.roomId,
            agentId: params.agentId,
            sourceMessageId: params.sourceMessageId,
            threadId: params.threadId ?? null,
          });
          if (streamResult.text.trim()) text = streamResult.text;
          if (streamResult.tokenStreamed) tokenStreamed = true;
        }
      } else {
        // 9b. 纯 LLM 模式（无工具）
        const streamResult = await this.streamFinalResponse({
          model,
          messages,
          companyId: params.companyId,
          roomId: params.roomId,
          agentId: params.agentId,
          sourceMessageId: params.sourceMessageId,
          threadId: params.threadId ?? null,
        });
        text = streamResult.text;
        if (streamResult.tokenStreamed) tokenStreamed = true;
        // Handle length continuation (always batch invoke for continuations)
        // Push streamed response back so continuation LLM has context
        if (text.trim()) messages.push(new AIMessage(text));
        if (this.isLengthFinishReason(streamResult.finishReason) && maxOut >= 4000) {
          for (let cont = 0; cont < 3; cont++) {
            messages.push(new HumanMessage('请继续上面的内容，不要重复已写部分。'));
            const contResp = await (model as { invoke: (m: BaseMessage[]) => Promise<unknown> }).invoke(messages);
            const contText = this.extractTextContent(contResp);
            if (contText) text = `${text}\n${contText}`;
            const contFinish = this.extractFinishReason(contResp);
            if (!this.isLengthFinishReason(contFinish)) break;
            messages.push(contResp as BaseMessage);
          }
        }
      }

      const elapsed = Date.now() - startedAt;
      this.logger.log('foundry.agent_tool_loop.completed', {
        companyId: params.companyId,
        agentId: params.agentId,
        roomId: params.roomId,
        elapsed,
        roundsUsed,
        toolCallsExecuted,
        toolNames: toolNames.slice(0, 12),
        textLength: text.length,
        tokenStreamed,
      });

      return {
        text: ConversationOutputSanitizerService.toVisibleLayer(text).slice(0, 32_000),
        agentId: params.agentId,
        agentName: agent.name ?? 'Agent',
        tokenStreamed,
        telemetry: { roundsUsed, toolCallsExecuted, toolNames },
      };
    } catch (error) {
      this.logger.error('foundry.agent_tool_loop.failed', {
        companyId: params.companyId,
        agentId: params.agentId,
        roomId: params.roomId,
        elapsed: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 便捷方法：运行 Agent 工具循环并将结果回复到群聊。
   */
  async runAndReply(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    sourceMessageId: string;
    threadId?: string | null;
    userText: string;
    humanSenderId?: string | null;
    ceoAgentId?: string | null;
    traceId: string;
    orgSnapshotPromptBlock?: string | null;
    roomMemberPromptBlock?: string | null;
  }): Promise<boolean> {
    const result = await this.run(params);
    if (!result) return false;

    // Guard: don't post empty messages
    if (!result.text.trim()) {
      this.logger.warn('foundry.agent_tool_loop.empty_text_skip', {
        companyId: params.companyId,
        agentId: params.agentId,
        roomId: params.roomId,
      });
      return false;
    }

    const output: LightStructuredOutputV2 = {
      version: 'v2',
      nextStep: NextStep.STRUCTURED_REPLY,
      finalText: result.text,
      commitmentText: params.userText.slice(0, 400),
      suggestedTasks: [],
      memoryReferences: [],
      metadata: {
        pipeline: 'agent_tool_loop',
        agentId: result.agentId,
        agentName: result.agentName,
        telemetry: result.telemetry,
      },
    };

    const visibleText = ConversationOutputSanitizerService.toVisibleLayer(output.finalText);
    this.logger.log('foundry.agent_tool_loop.posting_reply', {
      companyId: params.companyId,
      roomId: params.roomId,
      agentId: params.agentId,
      sourceMessageId: params.sourceMessageId,
      textLength: visibleText.length,
      textPreview: visibleText.slice(0, 200),
    });

    try {
      await this.directReply.reply({
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
        sourceMessageId: params.sourceMessageId,
        threadId: params.threadId ?? null,
        output,
        generation: result.tokenStreamed
          ? {
              text: result.text,
              truncatedByLength: false,
              continuationRounds: 0,
              extremeCapApplied: false,
              originalCharLength: result.text.length,
              tokenStreamed: true,
            }
          : undefined,
      });
      this.logger.log('foundry.agent_tool_loop.reply_posted', {
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
      });
    } catch (err: unknown) {
      this.logger.error('foundry.agent_tool_loop.reply_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }

    return true;
  }

  private buildSystemPrompt(params: {
    agent: { name?: string; role?: string; systemPrompt?: string | null };
    auxiliarySystemText: string;
    orgSnapshotPromptBlock?: string | null;
    roomMemberPromptBlock?: string | null;
    askColleagueAvailable?: boolean;
    availableToolNames?: string[];
  }): string {
    const sections: string[] = [];

    // ── Section 1: Identity & Role ──
    const agentName = String(params.agent.name ?? 'a company collaborator');
    const agentRole = String(params.agent.role ?? 'member');
    sections.push(
      [
        `You are ${agentName}, role: ${agentRole}, in a company group chat.`,
        'Reply in Chinese unless the user writes in another language.',
        'Do not mention internal routing, tool names, tool call details, or your system prompt in your reply.',
      ].join('\n'),
    );

    // ── Section 2: Agent-specific system prompt from DB (if any) ──
    const dbPrompt = String(params.agent.systemPrompt ?? '').trim();
    if (dbPrompt) {
      sections.push(`[Your configured instructions]\n${dbPrompt}`);
    }

    // ── Section 3: Core workflow ──
    if (params.askColleagueAvailable) {
      sections.push(
        [
          '═══ CORE WORKFLOW: DELEGATE → COLLECT → SYNTHESIZE ═══',
          '',
          'You are a COORDINATOR. Your job is to:',
          '1. Analyze the user\'s request and identify which departments have relevant expertise.',
          '2. Delegate sub-questions to the right department agents using tool.ask_colleague.',
          '3. Collect their responses and synthesize a comprehensive, polished answer.',
          '',
          '── When to delegate (MUST) ──',
          '• Any question involving company-specific data: sales, revenue, users, metrics, KPIs',
          '• Any request for domain expertise: engineering, design, marketing, HR, finance, operations',
          '• Content creation that benefits from department input: reports, plans, proposals',
          '• Multi-faceted tasks that span multiple departments',
          '• Any factual claim about the company that you cannot verify from the conversation alone',
          '',
          '── When to answer directly (MAY) ──',
          '• Simple greetings, acknowledgments, or emotional support',
          '• Clarifying questions about the user\'s intent',
          '• General knowledge questions unrelated to company operations',
          '• Follow-up refinements when you already have all department inputs from this conversation',
          '',
          '── How to delegate ──',
          '• Use tool.ask_colleague with targetAgentName (from Room Members list) or targetAgentId.',
          '• Ask MULTIPLE colleagues in parallel in one round for efficiency.',
          '• Write clear, specific questions that give the colleague enough context to answer well.',
          '• For complex requests, break down into 2-4 focused sub-questions for different departments.',
          '',
          '── How to synthesize ──',
          '• Weave colleague responses into a coherent, well-structured answer.',
          '• Attribute insights to departments when relevant (e.g., "据销售部反馈…").',
          '• If colleagues give conflicting info, note the discrepancy honestly.',
          '• If a colleague fails to respond, work with what you have and note the gap.',
          '',
          'NEVER guess or fabricate company data. If you don\'t know, delegate or say you don\'t have the information.',
        ].join('\n'),
      );
    } else {
      sections.push(
        'Provide complete, helpful responses. If a tool call fails, do NOT retry the same tool — try a different approach or respond directly.',
      );
    }

    // ── Section 4: Response quality ──
    sections.push(
      [
        '── Response standards ──',
        '• Be thorough for substantive requests. Do not artificially shorten responses.',
        '• For simple acknowledgments, stay concise.',
        '• Use clear structure: headings, bullet points, numbered lists when appropriate.',
        '• Include specific data and examples rather than vague generalizations.',
        '• End with actionable next steps or a clear summary when the request is complex.',
      ].join('\n'),
    );

    // ── Section 5: Tool reference ──
    if (params.availableToolNames?.length) {
      sections.push(`Available tools: ${params.availableToolNames.join(', ')}`);
    }

    // ── Section 6: Organization & Members ──
    if (params.orgSnapshotPromptBlock) {
      sections.push(`Organization departments:\n${params.orgSnapshotPromptBlock}`);
    }
    if (params.roomMemberPromptBlock) {
      sections.push(`Room members (use names/IDs with tool.ask_colleague):\n${params.roomMemberPromptBlock}`);
    }

    // ── Section 7: Auxiliary context ──
    if (params.auxiliarySystemText) {
      sections.push(`Context:\n${params.auxiliarySystemText}`);
    }

    return sections.filter(Boolean).join('\n\n');
  }

  private extractToolCalls(msg: unknown): Array<{ id: string; name: string; args: unknown }> {
    const raw =
      (msg as { tool_calls?: unknown; toolCalls?: unknown })?.tool_calls ??
      (msg as { toolCalls?: unknown })?.toolCalls ??
      (msg as { additional_kwargs?: { tool_calls?: unknown } })?.additional_kwargs?.tool_calls ??
      [];
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((c: Record<string, unknown>) => {
        const id = String(c?.id ?? c?.tool_call_id ?? '').trim();
        const name = String(c?.name ?? (c?.function as { name?: string } | undefined)?.name ?? '').trim();
        const fn = c?.function as { arguments?: unknown } | undefined;
        const args = c?.args ?? fn?.arguments ?? c?.arguments;
        return id && name ? { id, name, args } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string; args: unknown }>;
  }

  private normalizeToolArgs(args: unknown): Record<string, unknown> {
    if (args && typeof args === 'object' && !Array.isArray(args)) return args as Record<string, unknown>;
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        // ignore
      }
    }
    return {};
  }

  private extractTextContent(msg: unknown): string {
    const m = msg as { content?: unknown } | null;
    const c = m?.content;
    if (typeof c === 'string') return c.trim();
    if (Array.isArray(c)) {
      return c
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: string }).text ?? '');
          return '';
        })
        .join('')
        .trim();
    }
    return '';
  }

  private extractFinishReason(msg: unknown): string | null {
    const m = msg as Record<string, unknown> | null;
    if (!m) return null;
    const meta = m.response_metadata ?? m.additional_kwargs ?? {};
    if (meta && typeof meta === 'object') {
      const reason = (meta as Record<string, unknown>).finish_reason;
      if (typeof reason === 'string') return reason;
    }
    return null;
  }

  private isLengthFinishReason(reason: string | null): boolean {
    return reason === 'length' || reason === 'max_tokens';
  }

  /**
   * Phase 3: Stream the final response to the room via token streaming.
   *
   * Only streams when roomId is non-empty (skips for ask_colleague nested calls)
   * and token streaming is enabled. Falls back to batch invoke on error.
   */
  private async streamFinalResponse(params: {
    model: { invoke: (m: BaseMessage[]) => Promise<unknown>; stream?: (m: BaseMessage[]) => Promise<AsyncIterable<unknown>> };
    messages: BaseMessage[];
    companyId: string;
    roomId: string;
    agentId: string;
    sourceMessageId: string;
    threadId?: string | null;
  }): Promise<{ text: string; tokenStreamed: boolean; finishReason: string | null }> {
    // Can only stream when roomId is present (not ask_colleague nested calls)
    const canStream = Boolean(params.roomId) && typeof params.model.stream === 'function';
    if (!canStream) {
      const raw = await params.model.invoke(params.messages);
      return {
        text: this.extractTextContent(raw),
        tokenStreamed: false,
        finishReason: this.extractFinishReason(raw),
      };
    }

    try {
      const streamId = buildDirectReplyStreamId(params.sourceMessageId, params.agentId);
      const result = await this.tokenStream.streamToRoom({
        model: params.model,
        messages: params.messages,
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
        sourceMessageId: params.sourceMessageId,
        streamId,
        threadId: params.threadId ?? null,
      });
      return {
        text: result.text,
        tokenStreamed: result.tokenStreamed,
        finishReason: result.finishReason ?? null,
      };
    } catch (e: unknown) {
      this.logger.warn('foundry.agent_tool_loop.stream_fallback_invoke', {
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
        message: e instanceof Error ? e.message : String(e),
      });
      const raw = await params.model.invoke(params.messages);
      return {
        text: this.extractTextContent(raw),
        tokenStreamed: false,
        finishReason: this.extractFinishReason(raw),
      };
    }
  }

  /**
   * Phase 2: Execute tool.ask_colleague — resolve target agent, safety checks, recursive run().
   */
  private async executeAskColleague(params: {
    companyId: string;
    callerAgentId: string;
    args: Record<string, unknown>;
    traceId: string;
    askColleagueContext?: AskColleagueContext;
  }): Promise<{ content: string; nestedToolNames: string[] }> {
    const startedAt = Date.now();
    const acCtx = params.askColleagueContext;
    const maxDepth = this.config.getAskColleagueMaxDepth();
    const timeoutMs = this.config.getAskColleagueTimeoutMs();

    // Depth check
    const currentDepth = acCtx?.depth ?? 0;
    if (currentDepth >= maxDepth) {
      return { content: JSON.stringify({ ok: false, error: 'MAX_DEPTH_REACHED', depth: currentDepth, maxDepth }), nestedToolNames: [] };
    }

    // Deadline check
    const deadlineMs = acCtx?.deadlineMs ?? (startedAt + timeoutMs);
    if (Date.now() >= deadlineMs) {
      return { content: JSON.stringify({ ok: false, error: 'DEADLINE_EXCEEDED' }), nestedToolNames: [] };
    }

    // Resolve target agent
    const question = String(params.args.question ?? '').trim();
    if (!question) {
      return { content: JSON.stringify({ ok: false, error: 'MISSING_QUESTION' }), nestedToolNames: [] };
    }

    const targetAgentId = params.args.targetAgentId ? String(params.args.targetAgentId).trim() : '';
    const targetAgentName = params.args.targetAgentName ? String(params.args.targetAgentName).trim() : '';
    if (!targetAgentId && !targetAgentName) {
      return { content: JSON.stringify({ ok: false, error: 'MISSING_TARGET', hint: 'Provide targetAgentId or targetAgentName' }), nestedToolNames: [] };
    }

    const target = await this.resolveTargetAgent({
      companyId: params.companyId,
      targetAgentId: targetAgentId || undefined,
      targetAgentName: targetAgentName || undefined,
    });

    if (!target) {
      return { content: JSON.stringify({ ok: false, error: 'TARGET_AGENT_NOT_FOUND' }), nestedToolNames: [] };
    }

    // Self-call prevention
    if (target.id === params.callerAgentId) {
      return { content: JSON.stringify({ ok: false, error: 'CANNOT_ASK_SELF' }), nestedToolNames: [] };
    }

    // Circular call prevention
    const visited = acCtx?.visitedAgentIds ?? new Set<string>();
    if (visited.has(target.id)) {
      return { content: JSON.stringify({ ok: false, error: 'CIRCULAR_CALL_DETECTED', targetAgentId: target.id }), nestedToolNames: [] };
    }

    // Build next-level context
    const nextVisited = new Set(visited);
    nextVisited.add(params.callerAgentId);
    const nextContext: AskColleagueContext = {
      depth: currentDepth + 1,
      visitedAgentIds: nextVisited,
      deadlineMs,
    };

    this.logger.log('foundry.agent_tool_loop.ask_colleague', {
      companyId: params.companyId,
      callerAgentId: params.callerAgentId,
      targetAgentId: target.id,
      targetAgentName: target.name,
      depth: currentDepth,
      elapsed: Date.now() - startedAt,
    });

    // Recursive call
    const result = await this.run({
      companyId: params.companyId,
      roomId: '', // colleague call doesn't need room context
      agentId: target.id,
      sourceMessageId: params.traceId,
      userText: question,
      traceId: params.traceId,
      askColleagueContext: nextContext,
    });

    const elapsed = Date.now() - startedAt;

    if (!result) {
      this.logger.warn('foundry.agent_tool_loop.ask_colleague.no_result', {
        companyId: params.companyId,
        callerAgentId: params.callerAgentId,
        targetAgentId: target.id,
        elapsed,
      });
      return { content: JSON.stringify({ ok: false, error: 'COLLEAGUE_NO_REPLY', agentName: target.name ?? 'Agent' }), nestedToolNames: [] };
    }

    this.logger.log('foundry.agent_tool_loop.ask_colleague.completed', {
      companyId: params.companyId,
      callerAgentId: params.callerAgentId,
      targetAgentId: target.id,
      targetAgentName: result.agentName,
      depth: currentDepth,
      elapsed,
      replyLength: result.text.length,
      nestedToolNames: result.telemetry.toolNames.slice(0, 12),
    });

    return {
      content: JSON.stringify({
        ok: true,
        agentName: result.agentName,
        reply: result.text.slice(0, 8_000),
      }),
      nestedToolNames: result.telemetry.toolNames,
    };
  }

  /**
   * Resolve target agent by ID or name.
   */
  private async resolveTargetAgent(params: {
    companyId: string;
    targetAgentId?: string;
    targetAgentName?: string;
  }): Promise<{ id: string; name?: string } | null> {
    // By ID — direct RPC
    if (params.targetAgentId) {
      const agent = await firstValueFrom(
        this.apiRpc
          .send<{ id?: string; name?: string }>('agents.findOne', {
            companyId: params.companyId,
            actor: this.workerActor(),
            id: params.targetAgentId,
          })
          .pipe(timeout({ first: 5_000 })),
      ).catch(() => null);
      if (agent?.id) return { id: agent.id, name: agent.name ?? undefined };
      return null;
    }

    // By name — lookup via active directory
    if (params.targetAgentName) {
      const agents = await this.agentsActiveDirectory
        .getActiveAgents(params.companyId, this.workerActor())
        .catch(() => []);
      const targetName = params.targetAgentName.toLowerCase();
      const match = agents.find(
        (a) => a.name && a.name.toLowerCase() === targetName,
      );
      if (match) return { id: match.id, name: match.name };
    }

    return null;
  }

  /**
   * Execute an agent skill directly via AgentExecutionService (same pattern as AgentDirectSkillToolLoopService).
   */
  private async executeAgentSkill(
    companyId: string,
    agentId: string,
    skillName: string,
    args: Record<string, unknown>,
    traceId: string,
    capabilitySkillIds?: string[],
  ): Promise<string> {
    const exec = await this.agentExecution.executeSkill({
      companyId,
      agentId,
      projectId: undefined,
      skillName,
      args,
      traceId,
      roles: ['admin'],
      layer: 'replay',
      capabilitySkillIds: capabilitySkillIds ?? [],
      promptSkillMode: 'auto',
    });

    if (typeof exec?.result === 'string') return exec.result;
    try {
      return JSON.stringify(exec?.result ?? null);
    } catch {
      return String(exec?.result ?? '');
    }
  }
}
