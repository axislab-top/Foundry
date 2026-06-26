import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { ConfigService } from '../../common/config/config.service.js';
import { serializeUnknownErrorForLog } from '../../common/logging/serialize-unknown-error.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import type { MainRoomReplayFactLayerDiagnostics } from './main-room-ceo-grounding.service.js';
import { CeoLayerConfigResolverService } from './ceo/resolver/ceo-layer-config-resolver.service.js';
import { CeoLayerOpenAiToolsService } from './ceo/ceo-layer-open-ai-tools.service.js';
import type { MainRoomStrategyDraftPayload } from './main-room-strategy-draft-session.service.js';
import {
  formatReplayDelegateCollaborationModeLine,
  getMainRoomReplayDelegateSystemPromptFullPrefetchSingleShot,
  getMainRoomReplayDelegateToolGatheringSystemPrompt,
} from './prompts/main-room-replay-prompts.js';
import { ReplayExecutionDelegateError } from './main-room-replay-delegate-errors.js';
import type { MainRoomHeavyPipelineKind } from './pipeline-v2/main-room-heavy-pipeline-entry.util.js';
import { ReplayCanonicalToolLoopService } from './replay/replay-canonical-tool-loop.service.js';
import { mergeReplayToolSurface } from './replay/replay-delegate-canonical-tools.js';
import type { ContextGroundingPlan, ContextGroundingToolPolicy } from './context/context-grounding-plan.js';
import { shouldSkipReplayToolLoop } from './context/context-grounding-plan.js';
import { recordReplayDelegatePhaseMs } from './replay/replay-delegate-telemetry.js';
import {
  formatReplayDelegateMessageCategoryLine,
  getReplayDelegateDiscussionRetrySystemSuffix,
  getReplayDelegateExecutionRetrySystemSuffix,
} from './replay/main-room-replay-trust-boundary.util.js';
import { CeoSequentialPeerIntroSessionService } from './replay/ceo-sequential-peer-intro-session.service.js';
import { ReplayPeerSummonDirectService } from './replay/replay-peer-summon-direct.service.js';
import {
  hasPeerSummonToolInSurface,
  isExplicitPeerIntroDelegateTurn,
  shouldRequirePeerSummonToolForTurn,
  toolNamesIncludePeerSummon,
} from './intent/main-room-sequential-peer-intro.util.js';
/** @stub Local stub for deleted module – returns false (conservative). */
function isProceedOnlyUserText(_text: string): boolean {
  return false;
}

/** @stub Local stub for deleted module – returns true when text is non-empty (conservative). */
function hasActionableGoalSummary(text: string | null | undefined): boolean {
  return Boolean(String(text ?? '').trim());
}

const heavyPipelineKindSchema = z.enum([
  'full',
  'dispatch_plan_compile_and_flush',
  'dispatch_plan_revise',
]);

const coordinateInMainSchema = z.enum(['peer_intro', 'ceo_coordinate']);

const delegateSchema = z
  .object({
    invokeExecutionLayers: z.boolean(),
    userSurfaceText: z.string().max(8000),
    draftGoalSummary: z.string().max(8000).nullable().optional(),
    clearDraftSession: z.boolean().optional(),
    heavyPipelineKind: heavyPipelineKindSchema.optional(),
    suggestExecutionUpgrade: z.boolean().optional(),
    upgradeReason: z.string().max(500).optional(),
    /** 目标不清 / 高风险 / 高成本时设为 true，保留一次显式确认（阶段 4 propose 门控）。 */
    requireExecutionConfirm: z.boolean().optional(),
    /** 主群内协调接话（依次自我介绍 / 请同事发言）；由 LLM 提议，Compiler 终裁。 */
    coordinateInMain: coordinateInMainSchema.optional(),
  })
  .strict();

export type MainRoomReplayExecutionDelegateDecision = z.infer<typeof delegateSchema>;

export { ReplayExecutionDelegateError } from './main-room-replay-delegate-errors.js';

function normalizeDelegateDecision(
  d: MainRoomReplayExecutionDelegateDecision,
  opts?: { defaultHeavyKind?: MainRoomHeavyPipelineKind },
): MainRoomReplayExecutionDelegateDecision {
  const invoke = d.invokeExecutionLayers === true;
  const heavyPipelineKind: MainRoomHeavyPipelineKind | undefined = invoke
    ? (d.heavyPipelineKind ?? opts?.defaultHeavyKind ?? 'full')
    : undefined;
  return {
    ...d,
    invokeExecutionLayers: invoke,
    heavyPipelineKind,
    suggestExecutionUpgrade: d.suggestExecutionUpgrade === true,
    upgradeReason: d.upgradeReason?.trim() ? d.upgradeReason.trim().slice(0, 500) : undefined,
    requireExecutionConfirm: d.requireExecutionConfirm === true,
  };
}

function assertDelegateSurfaceContract(d: MainRoomReplayExecutionDelegateDecision): void {
  if (d.invokeExecutionLayers === true) {
    return;
  }
  if (!String(d.userSurfaceText ?? '').trim()) {
    throw new ReplayExecutionDelegateError(
      'contract_violation',
      'replay delegate: userSurfaceText is required when invokeExecutionLayers is false',
    );
  }
}

/** 历史污染或误路由时，避免 peer_intro 劫持派活/确认拍。 */
function stripMisroutedPeerIntro(
  d: MainRoomReplayExecutionDelegateDecision,
  params: {
    userText: string;
    intentShouldExecute?: boolean;
    existingDraft: MainRoomStrategyDraftPayload | null;
  },
): MainRoomReplayExecutionDelegateDecision {
  if (d.coordinateInMain !== 'peer_intro') return d;
  if (params.intentShouldExecute === true) {
    return { ...d, coordinateInMain: undefined };
  }
  if (hasActionableGoalSummary(params.existingDraft?.draftGoalSummary)) {
    return { ...d, coordinateInMain: undefined };
  }
  if (isProceedOnlyUserText(params.userText)) {
    return { ...d, coordinateInMain: undefined };
  }
  return d;
}

function stringifyAiContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && 'type' in p && (p as { type?: string }).type === 'text' && 'text' in p) {
          return String((p as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  }
  return String(content ?? '');
}

/**
 * 主群 **replay 执行委托**：可选工具搜集 + JSON 决策拍。
 * 事实层由 {@link MainRoomCeoGroundingService} 按 Context Grounding Plan 按需装配。
 */
@Injectable()
export class MainRoomReplayExecutionDelegateService {
  private readonly logger = new Logger(MainRoomReplayExecutionDelegateService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly ceoLayerTools: CeoLayerOpenAiToolsService,
    private readonly replayToolLoop: ReplayCanonicalToolLoopService,
    private readonly sequentialPeerIntroSession: CeoSequentialPeerIntroSessionService,
    private readonly peerSummonDirect: ReplayPeerSummonDirectService,
  ) {}

  private parseDecision(raw: string): MainRoomReplayExecutionDelegateDecision | null {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fence?.[1] ?? t).trim();
    const brace = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (brace < 0 || end <= brace) return null;
    try {
      const j = JSON.parse(candidate.slice(brace, end + 1)) as unknown;
      return delegateSchema.parse(j);
    } catch {
      return null;
    }
  }

  /** coordinateInMain / audience_resolution 协调：主工具阶段未 summon 时补跑一轮强制 tool。 */
  private async ensurePeerIntroSummonIfNeeded(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
    threadId?: string | null;
    ceoAgentId: string;
    humanSenderId?: string | null;
    userUtterance: string;
    peerIntroSessionActive: boolean;
    coordinateInMain?: 'peer_intro' | 'ceo_coordinate' | null;
    requirePeerSummonByIntent: boolean;
    toolTelemetry: { roundsUsed: number; toolCallsExecuted: number; toolNames: string[] };
    configuredSkillIds?: string[];
  }): Promise<{ roundsUsed: number; toolCallsExecuted: number; toolNames: string[] }> {
    if (!isExplicitPeerIntroDelegateTurn(params.coordinateInMain)) {
      return params.toolTelemetry;
    }

    const needsSummon = params.coordinateInMain === 'peer_intro';
    if (!needsSummon || toolNamesIncludePeerSummon(params.toolTelemetry.toolNames)) {
      return params.toolTelemetry;
    }

    const next = await this.sequentialPeerIntroSession.pickNextDirector(params.companyId, params.roomId);
    if (!next) return params.toolTelemetry;

    const direct = await this.peerSummonDirect.summonDirectorInMainRoom({
      companyId: params.companyId,
      roomId: params.roomId,
      messageId: params.messageId,
      traceId: params.traceId,
      threadId: params.threadId ?? null,
      ceoAgentId: params.ceoAgentId,
      humanSenderId: params.humanSenderId ?? null,
      targetAgentId: next.agentId,
      targetDisplayName: next.displayName,
      capabilitySkillIds: params.configuredSkillIds,
    });

    if (!direct.ok) {
      this.logger.warn('ceo.sequential_peer_intro.fallback_direct_summon_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        coordinateInMain: params.coordinateInMain ?? null,
        requirePeerSummonByIntent: params.requirePeerSummonByIntent,
        error: direct.error ?? null,
      });
      return params.toolTelemetry;
    }

    return {
      roundsUsed: params.toolTelemetry.roundsUsed,
      toolCallsExecuted: params.toolTelemetry.toolCallsExecuted + 1,
      toolNames: [...params.toolTelemetry.toolNames, 'tool.message_send_to_agent'],
    };
  }

  async evaluate(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
    threadId?: string | null;
    userText: string;
    ceoAgentId?: string | null;
    humanSenderId?: string | null;
    messageCategory?: string | null;
    existingDraft: MainRoomStrategyDraftPayload | null;
    replayFactLayerSerialized: string;
    replayFactLayerDiagnostics: MainRoomReplayFactLayerDiagnostics;
    collaborationMode?: string | null;
    toolPolicy?: ContextGroundingToolPolicy | null;
    groundingPlan?: ContextGroundingPlan | null;
    /** Intent 层：听众解析后由 CEO 协调（非直连、非 deliverable 编排）。 */
    intentType?: string | null;
    intentShouldExecute?: boolean;
  }): Promise<MainRoomReplayExecutionDelegateDecision> {
    const defaultHeavyKind: MainRoomHeavyPipelineKind = this.config.shouldUseCeoDispatchPlanPath()
      ? 'dispatch_plan_compile_and_flush'
      : 'full';
    const evaluateStartedAt = Date.now();
    const baseTimeoutMs = Math.max(6_000, Math.min(25_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    const skipToolsBecauseFactLayer =
      shouldSkipReplayToolLoop({
        plan: params.groundingPlan,
        diagnostics: params.replayFactLayerDiagnostics,
      }) || params.toolPolicy === 'memory_only';
    const useTools =
      this.config.isCeoReplayToolsEnabled() &&
      Boolean(String(params.ceoAgentId ?? '').trim()) &&
      !skipToolsBecauseFactLayer;
    const timeoutMs = useTools
      ? this.config.getCeoReplayToolsAdjustedLlmTimeoutMs(baseTimeoutMs)
      : baseTimeoutMs;
    const traceId = String(params.traceId ?? params.messageId).trim();
    const draftBlock = params.existingDraft?.draftGoalSummary
      ? `【当前与 CEO 往复对齐的目标摘要】\n${params.existingDraft.draftGoalSummary.slice(0, 4000)}`
      : '【当前与 CEO 往复对齐的目标摘要】（尚无，可在对话中形成）';

    const isDiscussion = String(params.collaborationMode ?? '').trim() === 'discussion';
    const systemPrimary = getMainRoomReplayDelegateSystemPromptFullPrefetchSingleShot();

    const factLayer = String(params.replayFactLayerSerialized ?? '').trim();
    const d = params.replayFactLayerDiagnostics;

    const userUtterance = String(params.userText ?? '').trim().slice(0, 3500);
    let peerIntroSessionActive = await this.sequentialPeerIntroSession.isSessionActive(
      params.companyId,
      params.roomId,
    );
    if (peerIntroSessionActive) {
      await this.sequentialPeerIntroSession.deactivateSession(params.companyId, params.roomId);
      peerIntroSessionActive = false;
      this.logger.log('ceo.sequential_peer_intro.session_deactivated_on_user_turn', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
      });
    }
    const requirePeerSummonByIntent = shouldRequirePeerSummonToolForTurn({
      peerIntroSessionActive,
    });
    const peerCoordinationHumanBlock = '';
    const human = [
      userUtterance ? `【用户原话】\n${userUtterance}` : '',
      peerCoordinationHumanBlock,
      formatReplayDelegateCollaborationModeLine(params.collaborationMode),
      factLayer,
      formatReplayDelegateMessageCategoryLine(params.messageCategory),
      draftBlock,
    ]
      .map((s) => String(s).trim())
      .filter(Boolean)
      .join('\n\n');

    try {
      const replayLayer = await this.ceoLayerConfigResolver
        .resolveLayerSetting(params.companyId, 'replay')
        .catch(() => null);
      const fallbackModel = this.config.getCeoReplayModelName();
      const maxTok =
        typeof replayLayer?.maxTokens === 'number' && Number.isFinite(replayLayer.maxTokens)
          ? Math.min(16000, Math.max(256, Math.floor(replayLayer.maxTokens)))
          : 8000;
      const tempOverride =
        typeof replayLayer?.temperature === 'number' && Number.isFinite(replayLayer.temperature)
          ? Math.max(0, Math.min(1.5, replayLayer.temperature))
          : 0.25;

      const ceoId = String(params.ceoAgentId ?? '').trim();
      let toolTelemetry = { roundsUsed: 0, toolCallsExecuted: 0, toolNames: [] as string[] };
      let injectedToolNames: string[] = [];
      let configuredSkillIds: string[] = [];
      let requirePeerSummonTool = false;
      let decisionMessages: (SystemMessage | HumanMessage)[] = [
        new SystemMessage(systemPrimary),
        new HumanMessage(human),
      ];

      if (useTools && ceoId) {
        const toolsStartedAt = Date.now();
        const gatherModel = await this.llmBridge.createChatModel({
          companyId: params.companyId,
          agentId: params.ceoAgentId ?? undefined,
          fallbackModelName: fallbackModel,
          llmTimeoutMs: timeoutMs,
          maxOutputTokens: maxTok,
          temperatureOverride: tempOverride,
          disableReasoning: true,
          ceoContext: 'replay',
          trace: { messageId: params.messageId, callsite: 'collab.replay.execution_delegate.tools' },
          meteringAgentId: params.ceoAgentId ?? undefined,
        });

        const layerBuilt = await this.ceoLayerTools.build({
          companyId: params.companyId,
          ceoAgentId: ceoId,
          layer: 'replay',
          applyV2ToolSurface: false,
        });
        injectedToolNames = layerBuilt.injectedToolNames ?? [];
        configuredSkillIds = layerBuilt.configuredSkillIds ?? [];
        const tools = mergeReplayToolSurface(layerBuilt.tools);
        const allowedToolNames = new Set(
          tools.map((t) => String((t as { function?: { name?: string } }).function?.name ?? '').trim()).filter(Boolean),
        );
        const requirePeerSummonToolForTurn =
          requirePeerSummonByIntent && hasPeerSummonToolInSurface(allowedToolNames);
        requirePeerSummonTool = requirePeerSummonToolForTurn;

        const bindable = gatherModel as {
          bind?: (opts: unknown) => { invoke: (m: (SystemMessage | HumanMessage)[]) => Promise<unknown> };
        };
        const modelWithTools =
          typeof bindable.bind === 'function'
            ? bindable.bind({
                tools,
                tool_choice: requirePeerSummonToolForTurn ? 'required' : 'auto',
              })
            : gatherModel;

        const loopOut = await this.replayToolLoop.run({
          modelWithTools,
          messages: [new SystemMessage(getMainRoomReplayDelegateToolGatheringSystemPrompt()), new HumanMessage(human)],
          companyId: params.companyId,
          roomId: params.roomId,
          threadId: params.threadId ?? null,
          traceId,
          messageId: params.messageId,
          ceoAgentId: ceoId,
          humanSenderId: params.humanSenderId ?? null,
          maxRounds: this.config.getCeoReplayToolsMaxRounds(),
          maxCallsPerRound: this.config.getCeoReplayToolsMaxCallsPerRound(),
          allowedToolNames,
          capabilitySkillIds: configuredSkillIds,
        });

        toolTelemetry = {
          roundsUsed: loopOut.telemetry.roundsUsed,
          toolCallsExecuted: loopOut.telemetry.toolCallsExecuted,
          toolNames: loopOut.telemetry.toolNames,
        };

        recordReplayDelegatePhaseMs('tools', toolsStartedAt);

        decisionMessages = [
          new SystemMessage(systemPrimary),
          ...(loopOut.messages.slice(1) as (SystemMessage | HumanMessage)[]),
        ];
      } else {
        const model = await this.llmBridge.createChatModel({
          companyId: params.companyId,
          agentId: params.ceoAgentId ?? undefined,
          fallbackModelName: fallbackModel,
          llmTimeoutMs: timeoutMs,
          maxOutputTokens: maxTok,
          temperatureOverride: tempOverride,
          disableReasoning: true,
          ceoContext: 'replay',
          trace: { messageId: params.messageId, callsite: 'collab.replay.execution_delegate' },
          meteringAgentId: params.ceoAgentId ?? undefined,
        });

        const retryHint = isDiscussion
          ? getReplayDelegateDiscussionRetrySystemSuffix()
          : getReplayDelegateExecutionRetrySystemSuffix();

        let normalized: ReturnType<typeof normalizeDelegateDecision> | null = null;
        let llmInvocations = 0;
        for (let attempt = 0; attempt < 2; attempt++) {
          const systemAugmented =
            attempt === 0
              ? (decisionMessages[0] as SystemMessage)
              : new SystemMessage(`${systemPrimary}${retryHint}`);
          llmInvocations++;
          const raw = await model.invoke([systemAugmented, ...decisionMessages.slice(1)]);
          const text = stringifyAiContent((raw as { content?: unknown })?.content).trim();
          const parsed = this.parseDecision(text);
          if (!parsed) {
            if (attempt === 1) {
              throw new ReplayExecutionDelegateError(
                'parse_failed',
                'replay delegate: model output is not valid delegate JSON after retry',
              );
            }
            continue;
          }
          const n = stripMisroutedPeerIntro(
            normalizeDelegateDecision(parsed, { defaultHeavyKind }),
            {
              userText: params.userText,
              intentShouldExecute: params.intentShouldExecute,
              existingDraft: params.existingDraft,
            },
          );
          assertDelegateSurfaceContract(n);
          normalized = n;
          break;
        }
        if (!normalized) {
          throw new ReplayExecutionDelegateError('parse_failed', 'replay delegate: model output is not valid delegate JSON');
        }

        if (ceoId) {
          toolTelemetry = await this.ensurePeerIntroSummonIfNeeded({
            companyId: params.companyId,
            roomId: params.roomId,
            messageId: params.messageId,
            traceId,
            threadId: params.threadId,
            ceoAgentId: ceoId,
            humanSenderId: params.humanSenderId ?? null,
            userUtterance,
            peerIntroSessionActive,
            coordinateInMain: normalized.coordinateInMain,
            requirePeerSummonByIntent,
            toolTelemetry,
            configuredSkillIds,
          });
        }

        this.logger.log('foundry.replay.execution_delegate.ok', {
          companyId: params.companyId,
          roomId: params.roomId,
          messageId: params.messageId,
          replayDelegateProfile: isDiscussion ? 'discussion' : 'execution',
          invokeExecutionLayers: normalized.invokeExecutionLayers,
          heavyPipelineKind: normalized.heavyPipelineKind ?? null,
          hasDraft: Boolean(normalized.draftGoalSummary && String(normalized.draftGoalSummary).trim()),
          replayFactLayerChars: factLayer.length,
          replayDelegateLlmInvocations: llmInvocations,
          replayToolsEnabled: false,
          replayToolsSkippedBecauseFactLayer: skipToolsBecauseFactLayer,
          injectedToolNames,
          configuredSkillIds,
          peerIntroSessionActive,
          coordinateInMain: normalized.coordinateInMain ?? null,
          requirePeerSummonByIntent,
          ...toolTelemetry,
          ...d,
        });
        recordReplayDelegatePhaseMs('decision', evaluateStartedAt);

        if (normalized.coordinateInMain === 'peer_intro') {
          await this.sequentialPeerIntroSession.activateSession(params.companyId, params.roomId);
        }

        return {
          invokeExecutionLayers: normalized.invokeExecutionLayers,
          userSurfaceText: String(normalized.userSurfaceText ?? '').trim().slice(0, 8000),
          draftGoalSummary:
            normalized.draftGoalSummary == null
              ? null
              : String(normalized.draftGoalSummary).trim().slice(0, 8000) || null,
          clearDraftSession: normalized.clearDraftSession === true,
          heavyPipelineKind: normalized.heavyPipelineKind,
          coordinateInMain: normalized.coordinateInMain,
          suggestExecutionUpgrade: normalized.suggestExecutionUpgrade,
          upgradeReason: normalized.upgradeReason,
          requireExecutionConfirm: normalized.requireExecutionConfirm,
        };
      }

      const decisionModel = await this.llmBridge.createChatModel({
        companyId: params.companyId,
        agentId: params.ceoAgentId ?? undefined,
        fallbackModelName: fallbackModel,
        llmTimeoutMs: timeoutMs,
        maxOutputTokens: maxTok,
        temperatureOverride: tempOverride,
        disableReasoning: true,
        ceoContext: 'replay',
        trace: { messageId: params.messageId, callsite: 'collab.replay.execution_delegate.json' },
        meteringAgentId: params.ceoAgentId ?? undefined,
      });

      const retryHint = isDiscussion
        ? getReplayDelegateDiscussionRetrySystemSuffix()
        : getReplayDelegateExecutionRetrySystemSuffix();

      let normalized: ReturnType<typeof normalizeDelegateDecision> | null = null;
      let llmInvocations = 0;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt === 1) {
          decisionMessages = [
            new SystemMessage(`${systemPrimary}${retryHint}`),
            ...decisionMessages.slice(1),
          ];
        }
        llmInvocations++;
        const raw = await decisionModel.invoke(decisionMessages);
        const text = stringifyAiContent((raw as { content?: unknown })?.content).trim();
        const parsed = this.parseDecision(text);
        if (!parsed) {
          if (attempt === 1) {
            throw new ReplayExecutionDelegateError(
              'parse_failed',
              'replay delegate: model output is not valid delegate JSON after retry',
            );
          }
          continue;
        }
        const n = stripMisroutedPeerIntro(
          normalizeDelegateDecision(parsed, { defaultHeavyKind }),
          {
            userText: params.userText,
            intentShouldExecute: params.intentShouldExecute,
            existingDraft: params.existingDraft,
          },
        );
        assertDelegateSurfaceContract(n);
        normalized = n;
        break;
      }
      if (!normalized) {
        throw new ReplayExecutionDelegateError('parse_failed', 'replay delegate: model output is not valid delegate JSON');
      }

      if (ceoId) {
        toolTelemetry = await this.ensurePeerIntroSummonIfNeeded({
          companyId: params.companyId,
          roomId: params.roomId,
          messageId: params.messageId,
          traceId,
          threadId: params.threadId,
          ceoAgentId: ceoId,
          humanSenderId: params.humanSenderId ?? null,
          userUtterance,
          peerIntroSessionActive,
          coordinateInMain: normalized.coordinateInMain,
          requirePeerSummonByIntent,
          toolTelemetry,
          configuredSkillIds,
        });
      }

      this.logger.log('foundry.replay.execution_delegate.ok', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        replayDelegateProfile: isDiscussion ? 'discussion' : 'execution',
        invokeExecutionLayers: normalized.invokeExecutionLayers,
        heavyPipelineKind: normalized.heavyPipelineKind ?? null,
        hasDraft: Boolean(normalized.draftGoalSummary && String(normalized.draftGoalSummary).trim()),
        replayFactLayerChars: factLayer.length,
        replayDelegateLlmInvocations: llmInvocations,
        replayToolsEnabled: true,
        replayToolsSkippedBecauseFactLayer: false,
        injectedToolNames,
        configuredSkillIds,
        peerIntroSessionActive,
        coordinateInMain: normalized.coordinateInMain ?? null,
        requirePeerSummonByIntent,
        requirePeerSummonTool,
        ...toolTelemetry,
        ...d,
      });
      recordReplayDelegatePhaseMs('tools_decision', evaluateStartedAt);

      if (normalized.coordinateInMain === 'peer_intro') {
        await this.sequentialPeerIntroSession.activateSession(params.companyId, params.roomId);
      }

      return {
        invokeExecutionLayers: normalized.invokeExecutionLayers,
        userSurfaceText: String(normalized.userSurfaceText ?? '').trim().slice(0, 8000),
        draftGoalSummary:
          normalized.draftGoalSummary == null
            ? null
            : String(normalized.draftGoalSummary).trim().slice(0, 8000) || null,
        clearDraftSession: normalized.clearDraftSession === true,
        heavyPipelineKind: normalized.heavyPipelineKind,
        coordinateInMain: normalized.coordinateInMain,
        suggestExecutionUpgrade: normalized.suggestExecutionUpgrade,
        upgradeReason: normalized.upgradeReason,
        requireExecutionConfirm: normalized.requireExecutionConfirm,
      };
    } catch (e) {
      if (e instanceof ReplayExecutionDelegateError) {
        throw e;
      }
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.error('foundry.replay.execution_delegate.failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        traceId: params.traceId,
        replayDelegateErrorCode: 'upstream',
        error: errMsg,
        cause: serializeUnknownErrorForLog(e),
      });
      throw new ReplayExecutionDelegateError('upstream', errMsg, { cause: e });
    }
  }
}
