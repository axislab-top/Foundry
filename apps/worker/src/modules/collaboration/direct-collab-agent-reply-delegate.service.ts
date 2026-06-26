import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ClientProxy } from '@nestjs/microservices';

import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

import { readFileSync } from 'node:fs';

import { join } from 'node:path';

import { firstValueFrom, timeout } from 'rxjs';

import { ConfigService } from '../../common/config/config.service.js';

import type {

  DirectCollabReplyDelegate,

  ExecuteDirectCollabHandoverParams,

} from '../agents/direct-collab-reply-delegate.js';

import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';

import { MemoryContextAssemblerService } from './memory-context-assembler.service.js';

import { CeoLayerConfigResolverService } from './ceo/resolver/ceo-layer-config-resolver.service.js';

import type { CeoV2Layer } from './ceo/config/ceo-layer.config.js';

import { AgentDirectSkillToolsService } from './direct/agent-direct-skill-tools.service.js';

import { AgentDirectSkillToolLoopService } from './direct/agent-direct-skill-tool-loop.service.js';
import { HrStaffingSurveyExecutorService } from './direct/hr-staffing-survey-executor.service.js';

import { buildDirectAgentSkillUsageGuidance } from './direct/agent-direct-skill-catalog.util.js';
import type { DirectCollabGeneratedReply } from './direct-reply/direct-reply-output.types.js';
import {
  buildDirectCollabGeneratedReply,
  DIRECT_REPLY_CONTINUATION_HUMAN,
  extractLlmFinishReason,
  extractLlmTextContent,
  isLengthFinishReason,
} from './direct-reply/direct-reply-output.util.js';
import type { DirectReplyRoomType } from './direct-reply/direct-reply-output.types.js';
import {
  buildDirectReplyStreamId,
  CollaborationLlmTokenStreamService,
  type LlmStreamModel,
} from './llm/collaboration-llm-token-stream.service.js';



let cachedDirectHandoverSystemPrompt: string | undefined;



function loadDirectHandoverSystemPrompt(): string {

  if (cachedDirectHandoverSystemPrompt !== undefined) return cachedDirectHandoverSystemPrompt;

  const envPath = process.env.DIRECT_AGENT_HANDOVER_PROMPT_PATH?.trim();

  const tryPaths: string[] = [];

  if (envPath) tryPaths.push(envPath);

  const roots = [process.cwd(), join(process.cwd(), 'apps', 'worker')];

  const rels = [

    join('src', 'modules', 'collaboration', 'prompts', 'agent-direct-handover.system.md'),

    join('dist', 'modules', 'collaboration', 'prompts', 'agent-direct-handover.system.md'),

  ];

  for (const root of roots) {

    for (const rel of rels) {

      tryPaths.push(join(root, rel));

    }

  }

  for (const p of tryPaths) {

    try {

      const text = readFileSync(p, 'utf-8').trim();

      if (text) {

        cachedDirectHandoverSystemPrompt = text;

        return text;

      }

    } catch {

      /* try next */

    }

  }

  cachedDirectHandoverSystemPrompt =

    '用户已在主群中直接 @ 你或点名你发言。请用你自己的身份自然回复，不要等待 CEO 协调。';

  return cachedDirectHandoverSystemPrompt;

}



/** 主群同轮多点名的直连人数，用于抑制「主持话术」复读。 */

function countDirectSummonPeerTargets(params: ExecuteDirectCollabHandoverParams): number {

  const fromUnified = params.intentDecision2026_1?.routingHints?.targetAgentIds;

  if (Array.isArray(fromUnified) && fromUnified.length > 0) {

    return new Set(fromUnified.map((id) => String(id ?? '').trim()).filter(Boolean)).size;

  }

  const meta =

    params.intentDecision.metadata && typeof params.intentDecision.metadata === 'object'

      ? (params.intentDecision.metadata as Record<string, unknown>)

      : null;

  const resolved = meta && Array.isArray(meta.resolvedTargetAgentIds) ? meta.resolvedTargetAgentIds : null;

  const fallback = Array.isArray(resolved)

    ? resolved

    : Array.isArray(params.intentDecision.targetIds)

      ? params.intentDecision.targetIds

      : [];

  return new Set(fallback.map((id) => String(id ?? '').trim()).filter(Boolean)).size;

}



function buildMultiTargetDirectSummonBlock(peerCount: number): string {

  if (peerCount <= 1) return '';

  return [

    '【多目标同轮】你与房内其他同事本轮被同时点名。',

    '只代表你自己作答；若用户要求「各部门主管自我介绍」或同类请求，请用一两句话介绍你本人的职务与职责范围。',

    '禁止：向其他主管发号施令、代替他人发言、复述「请各部门依次/各自介绍」等主持或转述用户任务的套话。',

  ].join('\n');

}



function buildDirectHumanPayload(params: ExecuteDirectCollabHandoverParams, peerTargetCount: number): string {

  return JSON.stringify({

    userMessage: params.contentText,

    assignedAgentId: params.agentId,

    directGroupPeerCount: peerTargetCount,

    intentType: params.intentDecision.intentType,

    messageCategory: params.intentDecision.messageCategory ?? null,

    ...(params.intentDecision2026_1

      ? {

          intentDecision2026_1: {

            intentType: params.intentDecision2026_1.intentType,

            confidence: params.intentDecision2026_1.confidence,

            shouldExecute: params.intentDecision2026_1.routingHints.shouldExecute,

          },

        }

      : {}),

  });

}



/**

 * Phase 3.5：主群定向 Agent 直连模型回复（供 {@link AgentExecutionService.executeDirect} 委托）。

 */

@Injectable()

export class DirectCollabAgentReplyDelegateService implements DirectCollabReplyDelegate {

  private readonly logger = new Logger(DirectCollabAgentReplyDelegateService.name);



  constructor(

    private readonly config: ConfigService,

    private readonly collabLlmBridge: CollaborationLlmBridgeService,

    private readonly memoryContextAssembler: MemoryContextAssemblerService,

    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,

    private readonly agentDirectSkillTools: AgentDirectSkillToolsService,

    private readonly agentDirectSkillToolLoop: AgentDirectSkillToolLoopService,

    private readonly hrStaffingSurvey: HrStaffingSurveyExecutorService,

    private readonly tokenStreamService: CollaborationLlmTokenStreamService,

    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpcInteractive: ClientProxy,

  ) {}



  private workerActor() {

    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };

  }



  private buildSystemPrompt(params: {

    agent: { name?: string; role?: string } | null;

    fast: boolean;

    peerTargetCount: number;

    auxiliarySystemText: string;

    skillGuidanceBlock: string;

  }): string {

    const handoverBlock = params.fast ? loadDirectHandoverSystemPrompt() : '';

    const multiTargetBlock = params.fast ? '' : buildMultiTargetDirectSummonBlock(params.peerTargetCount);

    return [

      `You are ${String(params.agent?.name ?? 'a company collaborator')} in a company group chat.`,

      `Your role is ${String(params.agent?.role ?? 'member')}.`,

      'Reply in Chinese from your own role. When the user asks for introduction, explanation, or substantive detail, give a complete helpful answer (still avoid rambling). For simple acks (e.g. 在吗), stay short.',

      'Do not pretend to be CEO unless your role is ceo.',

      String(params.agent?.role ?? '').toLowerCase().includes('director')
        ? [
            'When Context includes 【organization.department_roster】, you MUST list every roster row for department staffing questions; if total is 0 say 系统登记编制为 0. Do not claim the department is "still being formed" without roster evidence.',
            'When the user asks you to contact, @, or survey other department directors (e.g. staffing needs, headcount), you MUST invoke bound Skills/tools in this turn (e.g. hr-staffing-needs-survey, hr-talent-gap-analyzer, director-task-delegator with message_send_to_agent). Do NOT only say you will @ them later without actually calling tools.',
          ].join(' ')
        : '',

      'Do not mention internal routing metadata.',

      params.skillGuidanceBlock,

      multiTargetBlock,

      handoverBlock ? `Handover instructions:\n${handoverBlock}` : '',

      params.auxiliarySystemText ? `Context:\n${params.auxiliarySystemText}` : '',

    ]

      .filter(Boolean)

      .join('\n\n');

  }



  private resolveRoomType(params: ExecuteDirectCollabHandoverParams): 'main' | 'department' {
    if (params.roomType === 'department') return 'department';
    const src = String(
      (params.intentDecision.metadata as Record<string, unknown> | undefined)?.classifier ?? '',
    ).toLowerCase();
    if (src.includes('department')) return 'department';
    return 'main';
  }

  private buildDirectReplyStreamContext(
    params: ExecuteDirectCollabHandoverParams,
    roomType: DirectReplyRoomType,
  ) {
    return {
      companyId: params.companyId,
      roomId: params.roomId,
      agentId: params.agentId,
      sourceMessageId: params.messageId,
      threadId: params.threadId ?? null,
      roomType,
    };
  }

  private buildInvokeBudgetMs(fast: boolean, maxOut: number, maxContinuationRounds: number): number {
    if (fast) return Math.min(12_000, 8_800);
    const perRound = 4_500 + maxOut * 35;
    const continuationExtra = maxContinuationRounds * (2_500 + maxOut * 28);
    return Math.min(120_000, Math.max(10_250, perRound + continuationExtra));
  }

  private async invokeWithLengthContinuation(params: {
    model: LlmStreamModel;
    seedMessages: BaseMessage[];
    invokeBudgetMs: number;
    maxContinuationRounds: number;
    hardCapChars: number;
    streamContext?: {
      companyId: string;
      roomId: string;
      agentId: string;
      sourceMessageId: string;
      threadId?: string | null;
      roomType?: DirectReplyRoomType;
    };
  }): Promise<DirectCollabGeneratedReply | null> {
    let accumulated = '';
    let continuationRounds = 0;
    let lastFinishReason: string | null = null;
    let truncatedByLength = false;
    let tokenStreamed = false;
    const conversation: BaseMessage[] = [...params.seedMessages];
    const deadline = Date.now() + params.invokeBudgetMs;
    const useTokenStream =
      Boolean(params.streamContext) &&
      this.config.isCollabLlmTokenStreamingEnabled() &&
      this.config.isCollabDirectReplyStreamingEnabledForRoom(params.streamContext?.roomType);

    const invokeOnce = async (): Promise<{ text: string; finishReason: string | null; streamed: boolean }> => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('directed_reply_timeout');

      if (useTokenStream && params.streamContext) {
        const ctx = params.streamContext;
        const result = await this.tokenStreamService.streamToRoom({
          model: params.model,
          messages: conversation,
          companyId: ctx.companyId,
          roomId: ctx.roomId,
          agentId: ctx.agentId,
          sourceMessageId: ctx.sourceMessageId,
          streamId: buildDirectReplyStreamId(ctx.sourceMessageId, ctx.agentId),
          threadId: ctx.threadId ?? null,
          baseMetadata: {
            directReplyToMessageId: ctx.sourceMessageId,
            roomType: ctx.roomType,
          },
          streamSource: 'collab_direct_reply_token_stream',
          timeoutMs: remaining,
        });
        return {
          text: result.text,
          finishReason: result.finishReason ?? null,
          streamed: result.tokenStreamed,
        };
      }

      const raw = await Promise.race([
        params.model.invoke?.(conversation),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('directed_reply_timeout')), remaining);
        }),
      ]);
      return {
        text: extractLlmTextContent(raw),
        finishReason: extractLlmFinishReason(raw),
        streamed: false,
      };
    };

    for (let round = 0; round <= params.maxContinuationRounds; round += 1) {
      const out = await invokeOnce();
      lastFinishReason = out.finishReason;
      if (out.streamed) tokenStreamed = true;
      const chunk = out.text;
      if (chunk) {
        accumulated = round === 0 ? chunk : `${accumulated}\n${chunk}`;
      }

      if (!isLengthFinishReason(lastFinishReason)) {
        truncatedByLength = false;
        break;
      }

      if (round >= params.maxContinuationRounds) {
        truncatedByLength = true;
        break;
      }

      continuationRounds += 1;
      conversation.push(new AIMessage(accumulated || chunk || '…'));
      conversation.push(new HumanMessage(DIRECT_REPLY_CONTINUATION_HUMAN));
    }

    return buildDirectCollabGeneratedReply({
      text: accumulated,
      finishReason: lastFinishReason,
      truncatedByLength,
      continuationRounds,
      hardCapChars: params.hardCapChars,
      tokenStreamed,
    });
  }

  private finalizeSkillLoopText(
    text: string,
    hardCapChars: number,
  ): DirectCollabGeneratedReply | null {
    return buildDirectCollabGeneratedReply({
      text,
      finishReason: 'stop',
      truncatedByLength: false,
      continuationRounds: 0,
      hardCapChars,
    });
  }

  private extractRecentHumanTexts(messages: BaseMessage[], limit = 6): string[] {
    const out: string[] = [];
    for (let i = messages.length - 1; i >= 0 && out.length < limit; i--) {
      const m = messages[i];
      if (!(m instanceof HumanMessage)) continue;
      const text = String(m.content ?? '').trim();
      if (text) out.push(text);
    }
    return out;
  }

  private shouldRunHrStaffingSurvey(params: {
    agent: { name?: string; role?: string } | null | undefined;
    userText: string;
    recentHumanTexts: string[];
  }): boolean {
    if (!this.hrStaffingSurvey.isHrDirectorAgent(params.agent)) return false;
    if (this.hrStaffingSurvey.isStaffingSurveyIntent(params.userText)) return true;
    const nudge = /你倒是|快去|没有反应|怎么没|倒是去|行动|调用工具/i.test(String(params.userText ?? ''));
    if (!nudge) return false;
    return params.recentHumanTexts.some((t) => this.hrStaffingSurvey.isStaffingSurveyIntent(t));
  }

  private async runHrStaffingSurveyIfNeeded(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    threadId?: string | null;
    agent: { id?: string; name?: string; role?: string } | null;
    userText: string;
    recentHumanTexts: string[];
    hardCapChars: number;
  }): Promise<DirectCollabGeneratedReply | null> {
    if (!this.shouldRunHrStaffingSurvey({ agent: params.agent, userText: params.userText, recentHumanTexts: params.recentHumanTexts })) {
      return null;
    }
    const hrDirectorAgentId = String(params.agent?.id ?? '').trim();
    if (!hrDirectorAgentId) return null;
    const survey = await this.hrStaffingSurvey
      .tryExecute({
        companyId: params.companyId,
        roomId: params.roomId,
        hrDirectorAgentId,
        hrDirectorName: String(params.agent?.name ?? '人力资源部总监').trim(),
        sourceMessageId: params.messageId,
        threadId: params.threadId ?? null,
        userText: params.userText,
      })
      .catch((e: unknown) => {
        this.logger.warn('foundry.direct_agent.hr_staffing_survey_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          agentId: hrDirectorAgentId,
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      });
    if (!survey?.executed) return null;
    if (survey.contacted.length === 0 && survey.skippedDepartments.length === 0) return null;
    return this.finalizeSkillLoopText(survey.summary, params.hardCapChars);
  }

  async executeDirect(params: ExecuteDirectCollabHandoverParams): Promise<DirectCollabGeneratedReply | null> {

    try {

      const agent = await firstValueFrom(

        this.apiRpcInteractive

          .send<{ id?: string; name?: string; role?: string; llmModel?: string | null }>('agents.findOne', {

            companyId: params.companyId,

            actor: this.workerActor(),

            id: params.agentId,

          })

          .pipe(timeout({ first: 5_000 })),

      ).catch(() => null);

      const assembled = await this.memoryContextAssembler

        .assembleForDirected({

          companyId: params.companyId,

          roomId: params.roomId,

          agentId: params.agentId,

          agentRole: typeof agent?.role === 'string' ? agent.role : null,

          threadId: params.threadId ?? null,

          latestUserText: params.contentText,

          messageId: params.messageId,

          humanUserId: params.humanSenderId ?? null,

          intentDecision2026_1: params.intentDecision2026_1,

          mentionedAgentIds: params.mentionedAgentIds,

          ceoAgentId: params.ceoAgentId ?? null,

          collaborationExecutionContext: params.collaborationExecutionContext,

        })

        .catch(() => ({

          messages: [],

          auxiliarySystemText: '',

          diagnostics: {

            transcriptCount: 0,

            compressionTriggered: false,

            estimatedInputTokens: 0,

            estimatedOutputTokens: 0,

            transcriptKeptTurns: 0,

          },

        }));

      const roomType = this.resolveRoomType(params);
      const fast = params.fastSingleAgentHandover === true;
      const maxOut = this.config.resolveCollabDirectReplyMaxOutputTokens({ fast, roomType });
      const hardCapChars = this.config.getCollabDirectReplyVisibleTextHardCap();
      const maxContinuationRounds = this.config.getCollabDirectReplyLengthContinuationMaxRounds();

      let directedFallback: string;
      let directedLayer: CeoV2Layer;
      let replayTemperatureOverride = 0.35;

      if (roomType === 'department') {
        // 部门主管：与商城试调用一致，使用 Agent 行 llmModel + 商城 default Key 池，不读 CEO Replay 层
        directedFallback = String(agent?.llmModel ?? '').trim();
        if (!directedFallback) {
          throw new Error('pipeline_directed_department_agent_model_unconfigured');
        }
        directedLayer = 'orchestration';
      } else {
        directedLayer = 'replay';
        const directedSetting = await this.ceoLayerConfigResolver.resolveLayerSetting(
          params.companyId,
          directedLayer,
        );
        directedFallback = String(directedSetting.modelName ?? '').trim();
        if (!directedFallback) {
          throw new Error(`pipeline_directed_admin_${directedLayer}_model_unconfigured`);
        }
        replayTemperatureOverride =
          typeof (directedSetting as { temperature?: unknown }).temperature === 'number' &&
          Number.isFinite((directedSetting as { temperature: number }).temperature)
            ? Math.max(0, Math.min(1.5, (directedSetting as { temperature: number }).temperature))
            : 0.35;
      }

      const recentHumanTexts = this.extractRecentHumanTexts(assembled.messages);
      const hrSurveyEarly = await this.runHrStaffingSurveyIfNeeded({
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        threadId: params.threadId ?? null,
        agent,
        userText: params.contentText,
        recentHumanTexts,
        hardCapChars,
      });
      if (hrSurveyEarly) return hrSurveyEarly;

      const model = await this.collabLlmBridge.createChatModel({

        companyId: params.companyId,

        agentId: params.agentId,

        ...(roomType === 'department' ? { modelNameOverride: directedFallback } : {}),

        fallbackModelName: directedFallback,

        llmTimeoutMs: Math.max(8_000, this.config.getCollaborationMentionRpcTimeoutMs()),

        maxOutputTokens: maxOut,

        temperatureOverride: replayTemperatureOverride,

        ceoContext: directedLayer,

        trace: { messageId: params.messageId, callsite: fast ? 'collab.direct.handover' : 'collab.directed.reply' },

        meteringAgentId: params.agentId,

      });

      const peerTargetCount = countDirectSummonPeerTargets(params);

      const invokeBudgetMs = this.buildInvokeBudgetMs(fast, maxOut, maxContinuationRounds);

      const traceId = String(params.traceId ?? params.messageId).trim() || params.messageId;



      const useSkills = this.config.isDirectAgentSkillsEnabled();

      let skillPack = useSkills

        ? await this.agentDirectSkillTools.build({

            companyId: params.companyId,

            agentId: params.agentId,

            fast,

          })

        : null;



      if (!skillPack?.tools.length) {

        if (useSkills && skillPack && skillPack.skillCount === 0) {

          this.logger.log('foundry.direct_agent.skills.fallback_pure_llm', {

            companyId: params.companyId,

            agentId: params.agentId,

            fast,

            reason: 'no_skills_bound',

          });

        }

        const systemPrompt = this.buildSystemPrompt({

          agent,

          fast,

          peerTargetCount,

          auxiliarySystemText: assembled.auxiliarySystemText,

          skillGuidanceBlock: '',

        });

        const seedMessages: BaseMessage[] = [
          new SystemMessage(systemPrompt),
          ...assembled.messages,
          new HumanMessage(buildDirectHumanPayload(params, peerTargetCount)),
        ];
        return this.invokeWithLengthContinuation({
          model: model as LlmStreamModel,
          seedMessages,
          invokeBudgetMs,
          maxContinuationRounds,
          hardCapChars,
          streamContext: this.buildDirectReplyStreamContext(params, roomType),
        });
      }



      const skillGuidanceBlock = buildDirectAgentSkillUsageGuidance({
        usesToolCatalog: skillPack.usesToolCatalog,
        skillCount: skillPack.skillCount,
      });

      const systemPrompt = this.buildSystemPrompt({

        agent,

        fast,

        peerTargetCount,

        auxiliarySystemText: assembled.auxiliarySystemText,

        skillGuidanceBlock,

      });



      const bindable = model as {

        bind?: (opts: { tools: unknown[]; tool_choice?: string }) => { invoke: (m: unknown[]) => Promise<unknown> };

        invoke?: (m: unknown[]) => Promise<unknown>;

      };

      const tools = skillPack.tools as unknown[];

      const modelWithTools =

        tools.length && typeof bindable.bind === 'function'

          ? bindable.bind({ tools, tool_choice: 'auto' })

          : model;



      const messages = [

        new SystemMessage(systemPrompt),

        ...assembled.messages,

        new HumanMessage(buildDirectHumanPayload(params, peerTargetCount)),

      ];



      try {

        const loopOut = await Promise.race([

          this.agentDirectSkillToolLoop.run({

            modelWithTools: modelWithTools as { invoke: (msgs: typeof messages) => Promise<unknown> },

            modelPlain: model as { invoke: (msgs: typeof messages) => Promise<unknown> },

            messages,

            companyId: params.companyId,

            agentId: params.agentId,

            traceId,

            maxRounds: this.config.getDirectAgentSkillsMaxRounds(fast),

            maxCallsPerRound: this.config.getDirectAgentSkillsMaxCallsPerRound(fast),

            allowedToolNames: skillPack.allowedToolNames,

            capabilitySkillIds: skillPack.capabilitySkillIds,

            promptSkillMode: this.config.getDirectAgentSkillsPromptMode(fast),

          }),

          new Promise<never>((_, reject) => {

            setTimeout(() => reject(new Error('directed_reply_timeout')), invokeBudgetMs);

          }),

        ]);



        this.logger.log('foundry.direct_agent.skills.loop', {

          companyId: params.companyId,

          agentId: params.agentId,

          fast,

          roundsUsed: loopOut.telemetry.roundsUsed,

          toolCallsExecuted: loopOut.telemetry.toolCallsExecuted,

          toolNames: loopOut.telemetry.toolNames.slice(0, 12),

        });

        if (loopOut.telemetry.toolCallsExecuted === 0) {
          const hrSurveyFallback = await this.runHrStaffingSurveyIfNeeded({
            companyId: params.companyId,
            roomId: params.roomId,
            messageId: params.messageId,
            threadId: params.threadId ?? null,
            agent,
            userText: params.contentText,
            recentHumanTexts,
            hardCapChars,
          });
          if (hrSurveyFallback) return hrSurveyFallback;
        }

        return this.finalizeSkillLoopText(loopOut.text.trim(), hardCapChars);
      } catch (loopErr: unknown) {

        this.logger.warn('foundry.direct_agent.skills.fallback_pure_llm', {

          companyId: params.companyId,

          agentId: params.agentId,

          fast,

          reason: 'loop_failed',

          error: loopErr instanceof Error ? loopErr.message : String(loopErr),

        });

        const fallbackMessages = [
          new SystemMessage(systemPrompt),
          ...assembled.messages,
          new HumanMessage(buildDirectHumanPayload(params, peerTargetCount)),
        ];
        return this.invokeWithLengthContinuation({
          model: model as LlmStreamModel,
          seedMessages: fallbackMessages,
          invokeBudgetMs,
          maxContinuationRounds,
          hardCapChars,
          streamContext: this.buildDirectReplyStreamContext(params, roomType),
        });
      }
    } catch (error) {

      this.logger.warn('foundry.ceo.v2.directed_reply.model_failed', {

        companyId: params.companyId,

        roomId: params.roomId,

        messageId: params.messageId,

        agentId: params.agentId,

        fastSingleAgentHandover: params.fastSingleAgentHandover === true,

        error: error instanceof Error ? error.message : String(error),

      });

      return null;

    }

  }

}


