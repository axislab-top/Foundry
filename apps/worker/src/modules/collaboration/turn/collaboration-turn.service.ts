import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { metrics } from '@opentelemetry/api';
import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import { programPhaseLabel } from '@contracts/types';
import {
  NextStep,
  type LightStructuredOutputV2,
} from '@foundry/contracts/types/collaboration';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from '../collaboration-llm-bridge.service.js';
import { CeoLayerConfigResolverService } from '../ceo/resolver/ceo-layer-config-resolver.service.js';
import { DirectCollabReplyService } from '../direct-collab-reply.service.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
  MainRoomLeadMemoryContext,
} from '../pipeline-v2/collaboration-pipeline-v2.types.js';
import type { CollaborationMainRoomIntentService } from '../pipeline-v2/main-room-intent.service.js';
import { lazyCollaborationMainRoomIntentService } from '../pipeline-v2/pipeline-v2.forward-ref.js';
import { MAX_ORCHESTRATION_TOOL_ROUNDS } from '../pipeline-v2/pipeline-v2-orchestration.constants.js';
import { CollaborationProgramClientService } from '../program/collaboration-program-client.service.js';
import { CollaborationTurnToolLoopService } from './collaboration-turn-tool-loop.service.js';
import { COLLABORATION_TURN_TOOLS } from './collaboration-turn-tools.js';
import { getCollaborationTurnSystemPrompt } from './collaboration-turn.prompt.js';
import { programBriefSummaryLine, type CollaborationTurnToolContext } from './collaboration-turn-tool.types.js';
import {
  resolveGoalSummaryForOrchestrate,
  sanitizeTurnUserSurfaceText,
  shouldMechanicalOrchestrate,
  stripFalseDispatchClaims,
} from './collaboration-turn-tool.types.js';
import { CollaborationOrchestrateToolHandler } from './collaboration-orchestrate-tool.handler.js';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';
import { CeoNaturalReplyGeneratorService } from '../ceo-natural-reply-generator.service.js';
import {
  MAIN_ROOM_REPLY_BEFORE_HEAVY_FAST_REPLY_SOURCE,
  MAIN_ROOM_REPLY_BEFORE_HEAVY_MODE_CONTEXT,
} from '../pipeline-v2/main-room-reply-before-heavy.util.js';

function stringifyAiContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p;
        if (
          p &&
          typeof p === 'object' &&
          'type' in p &&
          (p as { type?: string }).type === 'text' &&
          'text' in p
        ) {
          return String((p as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  }
  return String(content ?? '');
}

@Injectable()
export class CollaborationTurnService {
  private readonly logger = new Logger(CollaborationTurnService.name);
  private readonly meter = metrics.getMeter('foundry.collaboration');
  private readonly turnOutcomeCounter = this.meter.createCounter('foundry.collaboration.turn.outcome_total');

  constructor(
    private readonly config: ConfigService,
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly turnToolLoop: CollaborationTurnToolLoopService,
    private readonly directReply: DirectCollabReplyService,
    private readonly programClient: CollaborationProgramClientService,
    private readonly orchestrateHandler: CollaborationOrchestrateToolHandler,
    private readonly ceoNaturalReply: CeoNaturalReplyGeneratorService,
    @Inject(forwardRef(lazyCollaborationMainRoomIntentService))
    private readonly intent: CollaborationMainRoomIntentService,
  ) {}

  async run(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: CollaborationIntentDecisionV20261;
    traceId: string;
    memoryContext: MainRoomLeadMemoryContext;
    recentTranscriptDigest?: string | null;
  }): Promise<CollaborationPipelineV2RunResult> {
    const { input, roomContext, intentDecision2026, traceId } = params;
    const ceoId = String(input.ceoAgentId ?? '').trim();
    if (!ceoId) {
      return this.buildTurnResult({
        input,
        intentDecision2026,
        intentDecision2026_1: params.intentDecision2026_1,
        userSurfaceText: '当前房间未配置 CEO，无法承接主群对话。',
        orchestrationRan: false,
        traceId,
      });
    }

    const activeProgram = await this.programClient.getActive({
      companyId: input.companyId,
      roomId: input.roomId,
      threadId: input.threadId,
    });

    const userText = String(input.contentText ?? '').trim();

    const turnContext: CollaborationTurnToolContext = {
      companyId: input.companyId,
      roomId: input.roomId,
      threadId: input.threadId ?? null,
      traceId,
      messageId: input.messageId,
      ceoAgentId: ceoId,
      humanSenderId: input.humanSenderId ?? null,
      input,
      roomContext,
      intentDecision2026,
      intentDecision2026_1: params.intentDecision2026_1,
      collaborationMode: roomContext.collaborationMode ?? null,
    };

    let instantReplySent = false;
    if (this.config.isCollabMainRoomReplyBeforeHeavyEnabled()) {
      try {
        const instantText = await this.ceoNaturalReply.generateNaturalReply({
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          traceId,
          threadId: input.threadId ?? null,
          userText,
          ceoAgentId: ceoId,
          humanSenderId: input.humanSenderId ?? null,
          memory: {
            promptContext: params.memoryContext.promptContext,
            memoryHits: params.memoryContext.memoryHits,
          },
          modeContextBlock: MAIN_ROOM_REPLY_BEFORE_HEAVY_MODE_CONTEXT,
          orgSnapshotPromptBlock: input.orgSnapshotPromptBlock ?? null,
          contextGroundingPlan: input.collaborationExecutionContext?.contextGroundingPlan ?? null,
        });
        const instant = String(instantText ?? '').trim();
        if (instant) {
          const instantOutput: LightStructuredOutputV2 = {
            version: 'v2',
            nextStep: NextStep.STRUCTURED_REPLY,
            finalText: instant.slice(0, 8000),
            commitmentText: userText.slice(0, 400),
            suggestedTasks: [],
            memoryReferences: [],
            metadata: {
              pipeline: 'v2',
              routePath: 'collaboration_turn',
              fastReplySource: MAIN_ROOM_REPLY_BEFORE_HEAVY_FAST_REPLY_SOURCE,
              traceId,
            },
          };
          await this.directReply.reply({
            companyId: input.companyId,
            roomId: input.roomId,
            agentId: ceoId,
            sourceMessageId: input.messageId,
            threadId: input.threadId ?? null,
            output: instantOutput,
            intentDecision2026_1: params.intentDecision2026_1,
            heartbeatCorrelation: input.heartbeatCorrelation,
          });
          instantReplySent = true;
        }
      } catch (e: unknown) {
        this.logger.warn('collaboration_turn.reply_before_heavy_failed', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          traceId,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const humanBlocks: string[] = [];
    if (userText) humanBlocks.push(`【用户原话】\n${userText.slice(0, 3500)}`);
    if (params.recentTranscriptDigest?.trim()) {
      humanBlocks.push(`【近期对话摘要】\n${params.recentTranscriptDigest.trim().slice(0, 2000)}`);
    }
    if (params.memoryContext.promptContext?.trim()) {
      humanBlocks.push(params.memoryContext.promptContext.trim().slice(0, 2000));
    }
    if (activeProgram) {
      const summary = programBriefSummaryLine(activeProgram);
      humanBlocks.push(
        `【当前 Program】阶段：${programPhaseLabel(activeProgram.phase)}；目标理解：${summary.slice(0, 2000)}`,
      );
    }
    if (input.userConfirmedExecution || input.confirmationIntent) {
      humanBlocks.push('【用户信号】用户已点击或发送确认执行；若 Program 已有目标摘要，请用摘要调用 orchestrate。');
    }
    const collaborationMode = String(roomContext.collaborationMode ?? '').trim();
    if (collaborationMode) {
      humanBlocks.push(`【协作模式】${collaborationMode}`);
    }

    const replayLayer = await this.ceoLayerConfigResolver
      .resolveLayerSetting(input.companyId, 'replay')
      .catch(() => null);
    const fallbackModel = this.config.getCeoReplayModelName();
    const baseTimeoutMs = Math.max(6_000, Math.min(25_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    const timeoutMs = this.config.getCeoReplayToolsAdjustedLlmTimeoutMs(baseTimeoutMs);
    const maxTok =
      typeof replayLayer?.maxTokens === 'number' && Number.isFinite(replayLayer.maxTokens)
        ? Math.min(2000, Math.max(256, Math.floor(replayLayer.maxTokens)))
        : 900;
    const tempOverride =
      typeof replayLayer?.temperature === 'number' && Number.isFinite(replayLayer.temperature)
        ? Math.max(0, Math.min(1.5, replayLayer.temperature))
        : 0.3;

    const model = await this.llmBridge.createChatModel({
      companyId: input.companyId,
      agentId: ceoId,
      fallbackModelName: fallbackModel,
      llmTimeoutMs: timeoutMs,
      maxOutputTokens: maxTok,
      temperatureOverride: tempOverride,
      disableReasoning: true,
      ceoContext: 'replay',
      trace: { messageId: input.messageId, callsite: 'collab.turn.tool_loop' },
      meteringAgentId: ceoId,
    });

    const bindable = model as {
      bind?: (opts: unknown) => { invoke: (m: BaseMessage[]) => Promise<unknown> };
    };
    const modelWithTools =
      typeof bindable.bind === 'function'
        ? bindable.bind({ tools: COLLABORATION_TURN_TOOLS, tool_choice: 'auto' })
        : model;

    const messages: BaseMessage[] = [
      new SystemMessage(getCollaborationTurnSystemPrompt()),
      new HumanMessage(humanBlocks.join('\n\n')),
    ];

    const loopOut = await this.turnToolLoop.run({
      modelWithTools,
      messages,
      turnContext,
      maxRounds: MAX_ORCHESTRATION_TOOL_ROUNDS,
      maxCallsPerRound: 5,
    });

    let orchestrationRan = loopOut.telemetry.orchestrationRan;
    if (!orchestrationRan && shouldMechanicalOrchestrate(input, activeProgram)) {
      const goalSummary = resolveGoalSummaryForOrchestrate(activeProgram);
      if (goalSummary) {
        this.logger.log('collaboration_turn.mechanical_orchestrate', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          traceId,
        });
        const mechanical = await this.orchestrateHandler.orchestrate(turnContext, {
          goalSummary,
          autoFlush: true,
        });
        if (mechanical.ok === true) {
          orchestrationRan = true;
        } else {
          turnContext.dispatchFollowupAck =
            turnContext.dispatchFollowupAck ??
            `编排未能启动：${String(mechanical.error ?? 'unknown').slice(0, 200)}`;
        }
      }
    }

    let userSurfaceText = '';
    for (let i = loopOut.messages.length - 1; i >= 0; i--) {
      const msg = loopOut.messages[i];
      if (msg instanceof AIMessage || (msg as { _getType?: () => string })._getType?.() === 'ai') {
        const text = stringifyAiContent((msg as AIMessage).content).trim();
        if (text) {
          userSurfaceText = text;
          break;
        }
      }
    }
    if (turnContext.dispatchFollowupAck?.trim()) {
      userSurfaceText = turnContext.dispatchFollowupAck.trim();
    } else if (!userSurfaceText) {
      userSurfaceText = orchestrationRan
        ? '已按你的目标启动跨部门编排，各部门将并行推进。'
        : '收到，如有具体交付诉求请直接说明，我会帮你编排下发。';
    } else {
      userSurfaceText = stripFalseDispatchClaims(sanitizeTurnUserSurfaceText(userSurfaceText), orchestrationRan);
    }

    const intentDecision2026_1: CollaborationIntentDecisionV20261 = {
      ...params.intentDecision2026_1,
      collaborationTurn: {
        orchestrationRan,
        readiness: activeProgram?.goalUnderstanding?.readiness,
      },
    };

    this.turnOutcomeCounter.add(1, {
      orchestrationRan: orchestrationRan ? 'true' : 'false',
    });

    const refreshedProgram = await this.programClient.getActive({
      companyId: input.companyId,
      roomId: input.roomId,
      threadId: input.threadId,
    });

    this.logger.log('foundry.collaboration.turn.completed', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      traceId,
      orchestrationRan,
      toolNames: loopOut.telemetry.toolNames,
      mechanicalFallback: orchestrationRan && !loopOut.telemetry.orchestrationRan,
      roundsUsed: loopOut.telemetry.roundsUsed,
    });

    return this.buildTurnResult({
      input,
      intentDecision2026,
      intentDecision2026_1,
      userSurfaceText,
      orchestrationRan,
      traceId,
      program: refreshedProgram ?? activeProgram,
      skipDirectReply: instantReplySent,
    });
  }

  private async buildTurnResult(params: {
    input: CollaborationPipelineV2RunInput;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: CollaborationIntentDecisionV20261;
    userSurfaceText: string;
    orchestrationRan: boolean;
    traceId: string;
    program?: import('@contracts/types').CollaborationProgramRecord | null;
    skipDirectReply?: boolean;
  }): Promise<CollaborationPipelineV2RunResult> {
    const ceoId = String(params.input.ceoAgentId ?? '').trim();
    const text = params.userSurfaceText.slice(0, 8000);
    const legacyIntent = this.intent.buildLegacyIntentDecisionFromUnifiedPipeline({
      input: params.input,
      layerDecision: params.intentDecision2026,
      unified: params.intentDecision2026_1,
      flags: { authorizedHeavyExecution: params.orchestrationRan },
    });

    if (ceoId && !params.skipDirectReply) {
      const output: LightStructuredOutputV2 = {
        version: 'v2',
        nextStep: NextStep.STRUCTURED_REPLY,
        finalText: text,
        commitmentText: String(params.input.contentText ?? '').slice(0, 400),
        suggestedTasks: [],
        memoryReferences: [],
        metadata: {
          pipeline: 'v2',
          routePath: 'collaboration_turn',
          orchestrationRan: params.orchestrationRan,
          traceId: params.traceId,
        },
      };
      await this.directReply.reply({
        companyId: params.input.companyId,
        roomId: params.input.roomId,
        agentId: ceoId,
        sourceMessageId: params.input.messageId,
        threadId: params.input.threadId ?? null,
        output,
        intentDecision2026_1: params.intentDecision2026_1,
        heartbeatCorrelation: params.input.heartbeatCorrelation,
      });
    }

    const roomWritten = Boolean(ceoId);

    return {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'collaboration_turn',
      intentDecision: legacyIntent,
      intentDecision2026_1: params.intentDecision2026_1,
      handledByV2: true,
      output: {
        status: 'ok',
        message: params.orchestrationRan ? 'Collaboration turn orchestrated' : 'Collaboration turn chat',
        payload: {
          routePath: 'collaboration_turn',
          orchestrationRan: params.orchestrationRan,
          roomWriteHandled: roomWritten,
          inlineReplyHandled: roomWritten,
          collaborationProgram: params.program ?? null,
          fastFinalText: text,
        },
      },
    };
  }
}
