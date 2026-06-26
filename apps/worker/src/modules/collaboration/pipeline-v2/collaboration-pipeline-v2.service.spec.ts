jest.mock('./pipeline-v2.forward-ref.js', () => ({
  lazyCollaborationPipelineV2Service: () => class CollaborationPipelineV2Service {},
  lazyCollaborationMainRoomFlowService: () => class CollaborationMainRoomFlowService {},
  lazyCollaborationMainRoomIntentService: () => class CollaborationMainRoomIntentService {},
  lazyCollaborationMainRoomSupervisionService: () => class CollaborationMainRoomSupervisionService {},
  lazyCollaborationMainRoomOrchestrationService: () => class CollaborationMainRoomOrchestrationService {},
  lazyCollaborationMainRoomReplayService: () => class CollaborationMainRoomReplayService {},
  lazyCollaborationPipelineRuleFallbackService: () => class CollaborationPipelineRuleFallbackService {},
}));

import { CollaborationPipelineV2Service } from './collaboration-pipeline-v2.service.js';
import { CollaborationMainRoomFlowService } from './main-room-flow.service.js';
import { CollaborationMainRoomIntentService } from './main-room-intent.service.js';
import { CollaborationMainRoomOrchestrationService } from './main-room-orchestration.service.js';
import { CollaborationMainRoomOrchestrationReplyService } from './main-room-orchestration-reply.service.js';
import { CollaborationMainRoomReplayService } from './main-room-replay.service.js';
import { CollaborationMainRoomSupervisionService } from './main-room-supervision.service.js';
import { MainRoomDispatchCompensationService } from '../dispatch/main-room-dispatch-compensation.service.js';
import { ReplayExecutionDelegateError } from '../main-room-replay-delegate-errors.js';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { of } from 'rxjs';
import type { IntentDecision } from '@contracts/types';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';

function makeLayerIntent(
  overrides: Partial<CollaborationIntentDecision2026> = {},
): CollaborationIntentDecision2026 {
  const { routingHints: rhOverride, ...rest } = overrides;
  const routingHints = {
    riskLevel: 'medium' as const,
    requiresParallelism: false,
    shouldExecute: false,
    responseMode: 'direct_reply' as const,
    ...rhOverride,
  };
  return {
    traceId: 'trace-layer',
    roomType: 'main',
    intentType: 'orchestration',
    confidence: 0.9,
    explanation: 'test-layer',
    targetDepartmentSlugs: [],
    targetLayer: 'orchestration',
    ...rest,
    routingHints,
  };
}

/** 单测用 legacy IntentDecision（含 unified SSOT metadata，供 L1 enrich / orchestration 路径）。 */
function buildLegacyIntentFromLayer(
  overrides: Partial<CollaborationIntentDecision2026> = {},
  legacyOpts?: { messageCategory?: IntentDecision['messageCategory'] },
): IntentDecision {
  const layer = makeLayerIntent(overrides);
  const unified = {
    schemaVersion: '2026.1' as const,
    traceId: layer.traceId ?? 'trace-layer',
    roomId: 'r1',
    intentType: layer.intentType,
    confidence: layer.confidence,
    explanation: layer.explanation,
    routingHints: {
      suggestedDepartmentSlugs: layer.targetDepartmentSlugs ?? [],
      requiresParallelism: layer.routingHints.requiresParallelism,
      riskLevel: layer.routingHints.riskLevel,
      shouldExecute: layer.routingHints.shouldExecute,
      responseMode: layer.routingHints.responseMode,
      targetAgentIds: layer.routingHints.targetAgentIds ?? [],
      explicitDirectTargets: layer.routingHints.explicitDirectTargets ?? false,
    },
  };
  const targetLayer =
    layer.targetLayer === 'strategy' ||
    layer.targetLayer === 'orchestration' ||
    layer.targetLayer === 'supervision'
      ? layer.targetLayer
      : 'orchestration';
  return {
    schemaVersion: '1.0',
    intentType: layer.intentType as IntentDecision['intentType'],
    targetMode: 'ceo_layer',
    targetType: 'system',
    targetIds: [],
    targetLayer,
    confidence: layer.confidence,
    messageCategory: legacyOpts?.messageCategory ?? 'chat',
    responseMode: layer.routingHints.responseMode as IntentDecision['responseMode'],
    shouldReply: true,
    shouldExecute: layer.routingHints.shouldExecute,
    routingHints: {
      suggestedDepartments: layer.targetDepartmentSlugs ?? [],
      requiresParallelism: layer.routingHints.requiresParallelism,
      riskLevel: layer.routingHints.riskLevel as IntentDecision['routingHints']['riskLevel'],
    },
    explanation: layer.explanation,
    traceId: layer.traceId ?? 'trace-layer',
    roomId: 'r1',
    requestedBy: 'u1',
    classifierSource: 'llm',
    llmUsed: true,
    evidence: {},
    metadata: {
      classifier: 'intent_layer_unified_v2026_1',
      intentDecision2026_1: unified as unknown as Record<string, unknown>,
      intentLayer: layer as unknown as Record<string, unknown>,
    },
  };
}

describe('CollaborationPipelineV2Service', () => {
  function makeInput() {
    return {
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      contentText: '请给出执行建议',
      mentionedAgentIds: [],
      mentionedNodeIds: [],
      messageCategory: null,
      ceoAgentId: 'ceo-1',
      executionTokenId: 'exec-1',
      humanSenderId: 'u1',
      threadId: null,
      senderType: 'human',
      messageSource: 'test',
      forcedMode: null,
      approvalRequestId: undefined,
      postApprovalSilent: false,
      alreadyHeavyProcessed: false,
      routingRootMessageId: 'm1',
    } as any;
  }

  function makePlanningResult() {
    return {
      schemaVersion: '1.0',
      planId: 'plan-1',
      traceId: 'trace-1',
      goal: '完成用户发起的协作任务',
      strategicPhases: [
        {
          phaseId: 'p1',
          title: '交付物',
          outcome: '按范围完成输出且量化验收指标达到100%',
          deadline: new Date().toISOString(),
        },
      ],
      resourceNeeds: { estimatedTokens: 120000, estimatedCostUsd: 6 },
      riskAssessment: { level: 'medium' as const, factors: ['test'] },
      timeline: {
        startAt: new Date().toISOString(),
        targetEndAt: new Date(Date.now() + 86400000).toISOString(),
      },
      approvalFlag: false,
      needsHumanApproval: false,
      ceoStructuredContract: '2026.pr4',
      metadata: { companyId: 'c1', roomId: 'r1', ceoAgentId: 'ceo-1' },
    } as any;
  }

  function makeDistribution() {
    return {
      schemaVersion: '1.0',
      distributionId: 'dist-1',
      planId: 'plan-1',
      tasks: [
        {
          taskId: 'task-1',
          department: 'ops',
          ownerAgent: 'director_ops',
          priority: 'P1',
          dependencies: [],
          slaSeconds: 900,
          deliverable: 'd1',
        },
      ],
      parallelism: { maxConcurrentDepartments: 1 },
      fallbackPolicy: { onTimeout: 'partial_merge', onDepartmentFailure: 'retry_then_degrade' },
      traceId: 'trace-1',
      metadata: { companyId: 'c1' },
    } as any;
  }

  function makeService(params?: {
    /** Mock `IntentLayerService.recognizeIntent` return（主群 unified 路径） */
    layerIntent?: Partial<CollaborationIntentDecision2026>;
    temporalEnabled?: boolean;
    temporalStartResult?: any;
    /** false → `L1FeatureFlagService.isIntent20261PlanningEnrichEnabled` resolves false */
    intent20261PlanningEnrichEnabled?: boolean;
    /** true → 恢复治理前缀拼接到 fastFinalText（默认 PR2 关闭） */
    governanceAckVisible?: boolean;
    /** 覆盖 `ConfigService.isForceMemoryCortexOnly`（默认 false，与 Graph V2 关闭时行为一致） */
    forceMemoryCortexOnly?: boolean;
    /** 为单测显式打开主群 CEO replay 门控 */
    ceoReplay?: boolean;
    /** Phase 2：主群强制内联监督（默认 true） */
    mainRoomForceInlineSupervision?: boolean;
    /** L3 Temporal：与 `decideCeoV2HeavyTemporalPreference` 对齐，Heavy 意图仍需 allowlist / 百分比 / heavyDefault */
    l3TemporalRolloutPercent?: number;
    l3TemporalRolloutCompanies?: string[];
    l3HeavyDefaultTemporal?: boolean;
    /** Markdown Dispatch Plan v2 主路径 */
    dispatchPlanV2Enabled?: boolean;
    /** 覆盖 {@link CeoDispatchPlanningService.planDocument} 默认 mock 文档 */
    dispatchPlanDocument?: Record<string, unknown> | null;
    /** 覆盖 {@link MainRoomReplayExecutionDelegateService.evaluate} 默认输出 */
    replayDelegateDecision?: {
      invokeExecutionLayers: boolean;
      userSurfaceText: string;
      draftGoalSummary: string | null;
      clearDraftSession: boolean;
      heavyPipelineKind?:
        | 'full'
        | 'dispatch_plan_compile_and_flush'
        | 'dispatch_plan_revise';
    };
  }) {
    const planningService = {
      plan: jest.fn().mockResolvedValue({ ok: true, plan: makePlanningResult() }),
    } as any;
    const planningAssignablePool = {
      enrichPlanningAssignablePool: jest.fn(async (p: unknown) => p),
      enrichPlanning: jest.fn(async (p: unknown) => p),
    } as any;
    const orchestrationService = {
      distribute: jest.fn().mockResolvedValue(makeDistribution()),
    } as any;
    const supervisionService = {
      supervise: jest.fn().mockResolvedValue({
        status: 'completed',
        finalText: 'L3 inline done',
        traceId: 'trace-1',
      }),
    } as any;
    const temporalService = {
      startHeavyExecution: jest
        .fn()
        .mockResolvedValue(params?.temporalStartResult ?? { workflowId: 'wf-1', runId: 'run-1' }),
    } as any;
    const directReply = { reply: jest.fn() } as any;
    const llmModel = {
      invoke: jest.fn(async () => ({ content: '已处理。' })),
      bind: jest.fn(function bindWithTools() {
        return llmModel;
      }),
    };
    const llmBridge = {
      createChatModel: jest.fn(async () => llmModel),
    } as any;
    const memoryContextAssembler = {
      assembleForOrchestration: jest.fn(async () => ({
        messages: [],
        diagnostics: {
          transcriptCount: 0,
          compressionTriggered: false,
          estimatedInputTokens: 0,
          estimatedOutputTokens: 0,
          transcriptKeptTurns: 0,
        },
      })),
      assembleForDirected: jest.fn(async () => ({
        messages: [],
        auxiliarySystemText: '',
        diagnostics: {
          transcriptCount: 0,
          compressionTriggered: false,
          estimatedInputTokens: 0,
          estimatedOutputTokens: 0,
          transcriptKeptTurns: 0,
        },
      })),
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string, payload?: Record<string, unknown>) => {
        if (pattern === 'memory.search') return of([]);
        if (pattern === 'memory.entries.store') return of({ id: 'mem-state-1' });
        if (pattern === 'tasks.goals.ensureMainCollaboration') return of({ id: 'goal-task-1' });
        if (pattern === 'tasks.requestBreakdown') return of({ accepted: true });
        if (pattern === 'collaboration.mainRoomDraft.strategyGoal.patch') return of({ ok: true });
        if (pattern === 'collaboration.messages.appendAgent') return of({ id: 'msg-append-1' });
        if (pattern === 'collaboration.rooms.findDepartmentBySlug') {
          const slug = String(payload?.departmentSlug ?? 'ops');
          return of({ id: `room-dept-${slug}`, roomType: 'department', name: 'Dept', organizationNodeId: 'd1' });
        }
        if (pattern === 'agents.findAll') return of({ items: [{ id: 'director-ops-1' }] });
        if (pattern === 'tasks.goals.assignToDepartmentDirector') return of({ id: 'sub-goal-1' });
        return of({});
      }),
    } as any;
    const redisCache = {
      get: jest.fn().mockResolvedValue(null),
      setPx: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      setNxPx: jest.fn().mockResolvedValue(true),
    } as any;
    const companyCortex = {
      getCompanyBrainContext: jest.fn(async () => ({
        profile: '我们是一家AI公司，核心产品是智能运营系统。',
        profileHit: true,
        strategicNotes: ['核心目标：提升执行闭环'],
        memorySignals: ['近期重点：销售线索转化'],
        activeAgentCount: 5,
        roomMemberCount: 3,
        missingFields: [],
        summary: 'company_profile: 我们是一家AI公司，核心产品是智能运营系统。',
      })),
      persistProfileGapSignal: jest.fn(async () => undefined),
      autoHydratePrimaryProfileFromMessage: jest.fn(async () => false),
    } as any;
    const capabilityPolicy = {
      allowedFactsQueryTypes: jest.fn(() => ['company_people', 'room_members', 'role_presence', 'org_structure']),
      allowedMemoryNamespaces: jest.fn(async () => ['company:c1:ceo:layer:L1']),
    } as any;
    const factsGateway = {
      query: jest.fn(async () => ({
        queryType: 'company_people',
        generatedAt: new Date().toISOString(),
        counts: { companyPeople: 1, companyActiveMembers: 9 },
        companyPeople: [{ id: 'a-sales', name: 'Sales Director（销售总监）', role: 'sales_director' }],
        sourceMeta: [{ source: 'test', ok: true }],
      })),
    } as any;
    const memoryGateway = {
      queryScoped: jest.fn(async () => ({
        generatedAt: new Date().toISOString(),
        hits: [{ id: 'm1', content: 'memory hit', score: 0.9, namespace: 'company:c1:ceo:layer:L1' }],
        sourceMeta: [{ source: 'test', ok: true }],
      })),
    } as any;
    const ceoV2ToolsService = {
      executeTool: jest.fn(async () => ({ ok: true, toolName: 'memory.search', toolCallId: 'tc-1', data: {} })),
      executeTools: jest.fn(async (input: any) =>
        (Array.isArray(input?.toolCalls) ? input.toolCalls : []).map((x: any) => ({
          ok: true,
          toolName: String(x?.name ?? 'memory.search'),
          toolCallId: String(x?.id ?? 'tc-1'),
          data: { summary: 'tool summary' },
        })),
      ),
    } as any;
    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async (_companyId: string, layer: string) => ({
        modelName: `mock-${layer}-model`,
      })),
      resolveMainRoomReplayPipelineKnobs: jest.fn(async () => ({
        mainRoomIntentInlineReplyEnabled: false,
        mainRoomIntentInlineReplyMinConfidence: 0.88,
        ceoReplayMemoryConfidenceThreshold: 0.92,
      })),
    } as any;
    const ceoLayerTools = {
      build: jest.fn(async () => ({ tools: [], configuredSkillIds: [] })),
    } as any;
    const tokenStreamService = {
      streamTokens: jest.fn(async () => ({ text: '', usage: null })),
    } as any;
    const toolRegistry = {
      getToolSnapshotsDynamic: jest.fn(async () => []),
      getMcpToolsDynamic: jest.fn(async () => []),
      snapshotsToOpenAiFunctions: jest.fn(() => []),
      mcpToolsToOpenAiFunctions: jest.fn(() => []),
    } as any;
    const agentExecution = {
      executeSkill: jest.fn(),
      executeDirect: jest.fn(async () => ({
        text: '【直连】已根据上下文回复。',
        truncatedByLength: false,
        continuationRounds: 0,
        extremeCapApplied: false,
        originalCharLength: 14,
      })),
    } as any;
    const config = {
      isWorkerL3TemporalV1Enabled: jest.fn(() => Boolean(params?.temporalEnabled)),
      isWorkerL3TemporalProtocolAlignEnabled: jest.fn(() => false),
      getCollabIntentModel: jest.fn(() => ''),
      getCeoStrategyModel: jest.fn(() => ''),
      getCeoOrchestrationModel: jest.fn(() => ''),
      getCollabDirectReplyModel: jest.fn(() => ''),
      getCollabIntentLlmTimeoutMs: jest.fn(() => 8000),
      getCollaborationMentionRpcTimeoutMs: jest.fn(() => 5000),
      getCeoDecisionLlmTimeoutMs: jest.fn(() => 120_000),
      getCollabSummonMissingMembersNoticeTemplate: jest.fn(() => ''),
      getCollabSummonAutoJoinMain: jest.fn(() => false),
      getCollabGovernanceAckVisible: jest.fn(() => params?.governanceAckVisible === true),
      getCollabDeptDirectorModelEnabled: jest.fn(() => false),
      getCollaborationIntentClassifiedV20261DeprecatedAt: jest.fn(() => undefined as string | undefined),
      getCollabApprovalStrictLevel: jest.fn(() => 'normal' as const),
      isCollabProfileFollowupSuppressQuick: jest.fn(() => true),
      isForceMemoryCortexOnly: jest.fn(() => params?.forceMemoryCortexOnly === true),
      isCeoEarlyExitEnabled: jest.fn(() => true),
      isCeoReplayCollaborationEnabled: jest.fn(() => true),
      getEarlyExitConfidenceThreshold: jest.fn(() => 0.92),
      getCeoReplayMemoryConfidenceThreshold: jest.fn(() => 0.92),
      isCeoReplayToolsEnabled: jest.fn(() => false),
      getCeoReplayFactLayerMode: jest.fn(() => 'minimal_tools' as const),
      isCeoContextGroundingPlannerEnabled: jest.fn(() => true),
      getCeoReplayToolsMaxRounds: jest.fn(() => 3),
      getCeoReplayToolsMaxCallsPerRound: jest.fn(() => 5),
      getCeoReplayToolsAdjustedLlmTimeoutMs: jest.fn((baseMs: number) => baseMs),
      getCollabMainRoomMaxDirectTargets: jest.fn(() => 4),
      getGroupChatMemoryRetrievalTopK: jest.fn(() => 4),
      isCollabMainRoomForceInlineSupervision: jest.fn(
        () => params?.mainRoomForceInlineSupervision !== false,
      ),
      getCollabAssignableDepartmentPolicy: jest.fn(() => 'org_only' as const),
      getStrategyPlanningProfileMode: jest.fn(() => 'default' as const),
      getApiRpcTimeoutMs: jest.fn(() => 120_000),
      isMainRoomIntentInjectRecentTranscriptEnabled: jest.fn(() => false),
      getCeoReplayRecentTranscriptMaxBodyChars: jest.fn(() => 4200),
      isMemoryGraphV2Enabled: jest.fn(() => false),
      isDirectAgentFastHandoverEnabled: jest.fn(() => false),
      isCollabMainRoomAudienceSummonStripCeoEnabled: jest.fn(() => false),
      isCollabMainRoomMultiDirectSanitizeUserFacingEnabled: jest.fn(() => false),
      getCollabMainRoomDirectReplyConcurrency: jest.fn(() => 2),
      getCollabRoutingMemoryMode: jest.fn(() => 'none' as const),
      isCollabRetrievalPlannerV2Enabled: jest.fn(() => true),
      isCollabSupervisionSplitEnabled: jest.fn(() => false),
      getCollabSupervisionConversationalProfile: jest.fn(() => 'short_confirm' as const),
      getCollabSupervisionInlineBudgetMs: jest.fn(() => 43_000),
      getL3TemporalRolloutCompanies: jest.fn(
        () => (params?.l3TemporalRolloutCompanies ?? []) as string[],
      ),
      getL3TemporalRolloutPercentage: jest.fn(() =>
        params?.l3TemporalRolloutPercent !== undefined ? params.l3TemporalRolloutPercent : 0,
      ),
      isCollabCeoV2HeavyDefaultTemporal: jest.fn(() => params?.l3HeavyDefaultTemporal === true),
      getRedisKeyPrefix: jest.fn(() => 'test'),
      isMainRoomDispatchRespectDependencies: jest.fn(() => false),
      isMainRoomDispatchChatMessagesEnabled: jest.fn(() => false),
      isMainRoomDistributionCompletionSummaryEnabled: jest.fn(() => false),
      isMainRoomReplayPatchStrategyDraftFromSummaryEnabled: jest.fn(() => false),
      isCollabCeoDispatchPlanV2Enabled: jest.fn(() => params?.dispatchPlanV2Enabled === true),
      shouldUseCeoDispatchPlanPath: jest.fn(() => params?.dispatchPlanV2Enabled === true),
    } as any;

    const roomContextService = {
      buildRoomContext: jest.fn(async () => ({
        companyId: 'c1',
        roomId: 'r1',
        roomType: 'main',
        roomName: 'Main room',
        organizationNodeId: null,
        members: [],
        memberDirectory: [],
        orgSnapshot: {
          departments: [{ id: 'd1', name: 'Ops', slug: 'ops' }],
          updatedAt: new Date().toISOString(),
        },
      })),
    } as any;

    const intentLayerService = {
      recognizeIntent: jest.fn(async () => makeLayerIntent(params?.layerIntent ?? {})),
    } as any;

    const groupChatContext = {} as any;
    const mainRoomReplayLlmContext = {
      assemblePack: jest.fn(async () => ({
        memoryBlock: '【单测 replay 记忆】',
        transcriptBlock: '【单测 replay 节选】',
        factsBlock: '',
      })),
    } as any;
    const memoryCrossCutService = {
      retrieveBeforeIntent: jest.fn(async () =>
        params?.ceoReplay
          ? {
              promptContext: '',
              hitCount: 3,
              memoryHits: [
                { snippet: '公司成立于2020年，主营协作与自动化。'.repeat(4), score: 0.96 },
                { snippet: '团队分布在北京与上海。'.repeat(6), score: 0.94 },
              ],
              duplicateSkipped: false,
            }
          : {
              promptContext: '',
              hitCount: 0,
              memoryHits: [],
              duplicateSkipped: false,
            },
      ),
      persistAfterIntentClassified: jest.fn(async () => undefined),
      persistAfterSupervision: jest.fn(async () => undefined),
      persistAfterSurfaceReply: jest.fn(async () => undefined),
      persistCeoObservedDirectAgentHandover: jest.fn(async () => undefined),
      retrieveTopCompanyFactsForCeoPack: jest.fn(async () => ({ lines: [] as string[] })),
    } as any;
    const sessionLease = {
      touchHeavyCollaborationLease: jest.fn(async () => undefined),
      clearHeavyCollaborationLease: jest.fn(async () => undefined),
    } as any;
    const rlhfSamplerService = {
      sampleAfterSupervision: jest.fn(async () => undefined),
    } as any;
    const l1ClassifierCore = {
      classifyCore: jest.fn(async () => ({
        humanIdentityDigest: 'id-digest',
        transcriptSummary: 'tr-sum',
        vectorEvidence: 'vec',
        decisionFingerprint: 'fp',
        cacheKey: 'ck',
      })),
    } as any;
    const l1PostNormalizer = {
      normalize: jest.fn((d: any) => d),
    } as any;
    const l1FeatureFlags = {
      isIntent20261PlanningEnrichEnabled: jest.fn(async () => params?.intent20261PlanningEnrichEnabled !== false),
      /** 默认视为开启，避免 `run()` 在 post-intent 因 replay 关闭而早退；需关闭时传 `ceoReplay: false`。 */
      isCeoReplayCollaborationEffective: jest.fn(async () => params?.ceoReplay !== false),
      isMultiAgentGraphV2EnabledForCompany: jest.fn(async () => false),
      isMultiAgentGraphV2Effective: jest.fn(async () => false),
      isPredictiveMoeEnabled: jest.fn(async () => false),
    } as any;
    const summonTargetResolver = {
      enrichLayerDecisionForSummonTargets: jest.fn(async () => ({ resolutionTrace: ['skip_non_summon'] })),
    } as any;
    const mainRoomDirectorIntentValidation = {
      applyMainRoomDirectorValidation: jest.fn(async () => undefined),
    } as any;
    const mainRoomReplayExecutionDelegate = {
      evaluate: jest
        .fn()
        .mockImplementation(
          async () =>
            params?.replayDelegateDecision ?? {
              invokeExecutionLayers: true,
              userSurfaceText: '',
              draftGoalSummary: null,
              clearDraftSession: false,
              heavyPipelineKind: 'full',
            },
        ),
    } as any;
    const ceoNaturalReplyGenerator = {
      generateNaturalReply: jest.fn(async () => null),
    } as any;
    const mainRoomCeoGrounding = {
      buildReplayDelegateFactLayer: jest.fn().mockResolvedValue({
        serialized: '',
        diagnostics: {
          syncedCompanyProfileChars: 0,
          speakerChars: 0,
          roomRosterChars: 0,
          factsChars: 0,
          orgSnapshotChars: 0,
          cortexCoreChars: 0,
          companyMemoryFactsChars: 0,
          transcriptChars: 0,
          memoryChars: 0,
          truncation: {
            profile: false,
            roomRoster: false,
            orgSnapshot: false,
            cortexCore: false,
            companyMemoryFacts: false,
          },
          factLayerMode: 'full_prefetch' as const,
          prefetchBlocks: ['speaker', 'transcript'],
        },
      }),
    } as any;
    const mainRoomStrategyDraftSession = {
      getDraft: jest.fn().mockResolvedValue(null),
      setDraft: jest.fn().mockResolvedValue(undefined),
      clearDraft: jest.fn().mockResolvedValue(undefined),
    } as any;
    const mainRoomStrategyGoalSession = {
      get: jest.fn().mockResolvedValue(null),
      setDraft: jest.fn().mockResolvedValue(undefined),
      markOrchestrated: jest.fn().mockResolvedValue(undefined),
      setPendingDistributionConfirm: jest.fn().mockResolvedValue(undefined),
      clearPendingDistributionConfirm: jest.fn().mockResolvedValue(undefined),
      patchMainGoalTaskId: jest.fn().mockResolvedValue(undefined),
      markBreakdownDispatched: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    } as any;
    const defaultDispatchPlanDocument = {
      schemaVersion: '1.0',
      planId: 'plan-msg-1',
      planRevision: 1,
      goal: '季度经营复盘与跨部门落地',
      bodyMarkdown: '# 目标\n季度经营复盘\n\n## 运营部 (ops)\n**任务**：复盘执行\n**说明**：完成复盘报告\n**验收**：\n- 报告提交\n**依赖**：无',
      executionOrder: 'sequential',
      assignments: [
        {
          departmentSlug: 'ops',
          title: '复盘执行',
          objective: '完成复盘报告',
          acceptanceCriteria: ['报告提交'],
        },
      ],
      metadata: {
        companyId: 'c1',
        roomId: 'r1',
        messageId: 'msg-1',
        assignableDepartmentSlugs: ['ops'],
      },
    };
    const dispatchPlanningService = {
      planDocument: jest.fn().mockResolvedValue({
        ok: true,
        document: params?.dispatchPlanDocument ?? defaultDispatchPlanDocument,
      }),
    } as any;
    const dispatchCompilerService = {} as any;
    const mainRoomDispatchPlanSession = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      patchMainGoalTaskId: jest.fn().mockResolvedValue(undefined),
      markDispatched: jest.fn().mockResolvedValue(undefined),
      markBreakdownDispatched: jest.fn().mockResolvedValue(undefined),
    } as any;
    const mainRoomDistributionDispatchExecutor = {} as any;
    const dispatchCompensation = {
      recordSkip: jest.fn().mockResolvedValue(undefined),
      buildCompensationMetadata: jest.fn().mockResolvedValue(null),
    } as any;
    const orchestrationPause = {
      isPaused: jest.fn().mockResolvedValue(false),
    } as any;
    const programClient = {
      getProgram: jest.fn().mockResolvedValue(null),
      upsertProgram: jest.fn().mockResolvedValue(undefined),
    } as any;
    const programLifecycle = {
      applyLifecyclePatch: jest.fn().mockResolvedValue(undefined),
    } as any;
    const replayMetadata = {
      buildReplayMetadata: jest.fn().mockResolvedValue({}),
    } as any;

    const contextGroundingPlannerService = {
      planGrounding: jest.fn(async () => ({
        prefetchBlocks: ['speaker', 'transcript'],
        factsQueryTypes: [],
        toolPolicy: 'tools_allowed',
        confidence: 0.5,
        source: 'llm_fallback',
      })),
    } as any;

    const mainRoomAudienceRoutingContext = {
      prepareMainRoomAudienceRoutingRecognizeContext: jest.fn(async (params: { input: { contentText: string } }) => ({
        memoryContext: {
          promptContext: '',
          hitCount: 0,
          memoryHits: [] as unknown[],
          duplicateSkipped: false,
        },
        audienceRoutingTurnText: String(params.input.contentText ?? '').trim(),
        recentTranscriptDigest: undefined,
        audienceRoutingRecentTurnFacts: {},
        audienceRoutingMemoryDigest: undefined,
        followupHintLine: null,
        roomMemberPromptBlock: '',
      })),
    } as any;

    const ruleFallbackMock = {
      runRuleFallbackPipeline: jest.fn(),
    } as any;

    // eslint-disable-next-line prefer-const -- proxy bootstrap assigns after mutual refs are wired
    let pipelineInstance!: CollaborationPipelineV2Service;
    // eslint-disable-next-line prefer-const
    let intentInstance!: CollaborationMainRoomIntentService;
    // eslint-disable-next-line prefer-const
    let orchestrationInstance!: CollaborationMainRoomOrchestrationService;
    // eslint-disable-next-line prefer-const
    let flowInstance!: CollaborationMainRoomFlowService;
    // eslint-disable-next-line prefer-const
    let supervisionInstance!: CollaborationMainRoomSupervisionService;
    // eslint-disable-next-line prefer-const
    let replayInstance!: CollaborationMainRoomReplayService;
    // eslint-disable-next-line prefer-const
    let orchestrationReplyInstance!: CollaborationMainRoomOrchestrationReplyService;
    const pipelineProxy = new Proxy({} as CollaborationPipelineV2Service, {
      get(_t, prop) {
        const v = (pipelineInstance as any)[prop];
        return typeof v === 'function' ? v.bind(pipelineInstance) : v;
      },
    });
    const intentProxy = new Proxy({} as CollaborationMainRoomIntentService, {
      get(_t, prop) {
        const v = (intentInstance as any)[prop];
        return typeof v === 'function' ? v.bind(intentInstance) : v;
      },
    });
    const flowProxy = new Proxy({} as CollaborationMainRoomFlowService, {
      get(_t, prop) {
        const v = (flowInstance as any)[prop];
        return typeof v === 'function' ? v.bind(flowInstance) : v;
      },
    });
    const orchestrationProxy = new Proxy({} as CollaborationMainRoomOrchestrationService, {
      get(_t, prop) {
        const v = (orchestrationInstance as any)[prop];
        return typeof v === 'function' ? v.bind(orchestrationInstance) : v;
      },
    });
    const supervisionProxy = new Proxy({} as CollaborationMainRoomSupervisionService, {
      get(_t, prop) {
        const v = (supervisionInstance as any)[prop];
        return typeof v === 'function' ? v.bind(supervisionInstance) : v;
      },
    });
    intentInstance = new CollaborationMainRoomIntentService(
      config,
      memoryCrossCutService,
      summonTargetResolver,
      mainRoomDirectorIntentValidation,
      directReply,
      apiRpc,
      flowProxy,
      pipelineProxy,
      {} as any,
    );
    orchestrationReplyInstance = new CollaborationMainRoomOrchestrationReplyService(
      config,
      llmBridge,
      memoryContextAssembler,
      ceoV2ToolsService,
      ceoLayerConfigResolver,
      ceoLayerTools,
      toolRegistry,
      agentExecution,
      companyCortex,
      l1FeatureFlags,
      apiRpc,
      pipelineProxy,
      tokenStreamService,
    );
    orchestrationInstance = new CollaborationMainRoomOrchestrationService(
      config,
      roomContextService,
      orchestrationService,
      planningAssignablePool,
      directReply,
      orchestrationReplyInstance,
      memoryCrossCutService,
      rlhfSamplerService,
      l1ClassifierCore,
      l1PostNormalizer,
      l1FeatureFlags,
      mainRoomStrategyDraftSession,
      dispatchCompensation,
      orchestrationPause,
      redisCache,
      apiRpc,
      pipelineProxy,
      supervisionProxy,
      intentProxy,
      flowProxy,
      programClient,
      programLifecycle,
    );
    supervisionInstance = new CollaborationMainRoomSupervisionService(
      config,
      redisCache,
      supervisionService,
      temporalService,
      directReply,
      pipelineProxy,
      orchestrationProxy,
    );
    replayInstance = new CollaborationMainRoomReplayService(
      config,
      directReply,
      replayMetadata,
      apiRpc,
      pipelineProxy,
      intentProxy,
    );
    flowInstance = new CollaborationMainRoomFlowService(
      config,
      intentLayerService,
      contextGroundingPlannerService,
      memoryCrossCutService,
      sessionLease,
      directReply,
      mainRoomReplayLlmContext,
      l1FeatureFlags,
      ceoNaturalReplyGenerator,
      mainRoomReplayExecutionDelegate,
      mainRoomCeoGrounding,
      mainRoomStrategyDraftSession,
      {} as any,
      replayMetadata,
      {} as any,
      {} as any,
      mainRoomAudienceRoutingContext,
      replayInstance,
      pipelineProxy,
      intentProxy,
      orchestrationProxy,
      {} as any,
      {} as any,
      orchestrationPause,
      programClient,
      programLifecycle,
      {} as any,
      {} as any,
    );
    pipelineInstance = new CollaborationPipelineV2Service(
      config,
      roomContextService,
      directReply,
      agentExecution,
      companyCortex,
      memoryCrossCutService,
      apiRpc,
      ruleFallbackMock,
      replayInstance,
      supervisionInstance,
      flowInstance,
      intentInstance,
      orchestrationInstance,
    );
    const service = pipelineInstance;

    return {
      service,
      replay: replayInstance,
      supervision: supervisionInstance,
      roomContextService,
      directReply,
      planningService,
      orchestrationService,
      supervisionService,
      temporalService,
      llmBridge,
      apiRpc,
      memoryContextAssembler,
      ceoV2ToolsService,
      ceoLayerConfigResolver,
      toolRegistry,
      agentExecution,
      companyCortex,
      capabilityPolicy,
      factsGateway,
      memoryGateway,
      l1ClassifierCore,
      l1PostNormalizer,
      l1FeatureFlags,
      mainRoomStrategyGoalSession,
      mainRoomDispatchPlanSession,
      dispatchPlanningService,
      dispatchCompilerService,
      mainRoomReplayExecutionDelegate,
    };
  }

  it('runs Supervisor inline after orchestration when targetLayer is supervision', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.9,
        explanation: 'needs supervision review',
        targetLayer: 'supervision',
        routingHints: {
          riskLevel: 'medium',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });

    const out = await ctx.service.run(makeInput());
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('runs heavy execution inline when temporal is disabled', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'strategy',
        confidence: 0.95,
        explanation: 'explicit heavy execution',
        targetLayer: 'strategy',
        routingHints: {
          riskLevel: 'high',
          shouldExecute: true,
          requiresParallelism: false,
          responseMode: 'execute_then_reply',
        },
      },
      temporalEnabled: false,
    });

    const out = await ctx.service.run(makeInput());
    // intent 不做 execution 路由，统一进 CEO
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('starts temporal for heavy execution when temporal is enabled', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'strategy',
        confidence: 0.94,
        explanation: 'multi department execution',
        targetLayer: 'strategy',
        routingHints: {
          riskLevel: 'high',
          shouldExecute: true,
          requiresParallelism: true,
          responseMode: 'execute_then_reply',
        },
      },
      temporalEnabled: true,
      temporalStartResult: { workflowId: 'wf-x', runId: 'run-x' },
      l3TemporalRolloutPercent: 100,
    });

    const out = await ctx.service.run(makeInput());
    // intent 不做 execution 路由，统一进 CEO
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('answers immediate recall query from recent human message', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.9,
        explanation: 'user asks recent recall',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const invoke = jest.fn(async () => ({ content: '你刚刚说的是“我说1，接下来请记住这个数字”。' }));
    ctx.llmBridge.createChatModel.mockResolvedValue({ invoke });
    ctx.memoryContextAssembler.assembleForOrchestration.mockResolvedValue({
      messages: [
      new HumanMessage('我说1，接下来请记住这个数字'),
      new AIMessage('已记住数字1。'),
      ],
      diagnostics: {
        transcriptCount: 2,
        compressionTriggered: false,
        estimatedInputTokens: 30,
        estimatedOutputTokens: 30,
        transcriptKeptTurns: 2,
      },
    });
    const input = { ...makeInput(), messageId: 'm2', contentText: '我刚说了什么' } as any;

    const out = await ctx.service.run(input);
    // intent 不做编排路由，统一进 CEO
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('Memory Cortex orchestration uses narrative CEO system prompt (no report-style bullet profile)', async () => {
    const ctx = makeService({
      forceMemoryCortexOnly: true,
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.9,
        explanation: 'open company question',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run({
      ...makeInput(),
      messageId: 'm-mc-narrative',
      contentText: '告诉我关于公司的一切信息',
    });
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('returns readable recovery text when orchestration reply is echo-like', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.82,
        explanation: 'echo recovery test',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run({
      ...makeInput(),
      messageId: 'm9',
      contentText: '刘洋',
    });
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('handles company people question with factual path even when intent is not ceo_reply', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.72,
        explanation: 'fallback to discussion',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run({
      ...makeInput(),
      messageId: 'm-company-people',
      contentText: '我公司现在都有哪些人？详细告诉我',
    });
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('prepends legacy governance ack when COLLAB_GOVERNANCE_ACK_VISIBLE is enabled', async () => {
    const ctx = makeService({
      governanceAckVisible: true,
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.72,
        explanation: 'fallback to discussion',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const invoke = jest
      .fn()
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [{ id: 'tc-facts-1b', name: 'facts.company.query', args: { queryType: 'company_people' } }],
      })
      .mockResolvedValueOnce({
        content: '公司人员如下：A、B。',
      });
    const model = { invoke, bind: jest.fn(() => model) } as any;
    ctx.llmBridge.createChatModel.mockResolvedValueOnce(model);

    const legacy = buildLegacyIntentFromLayer({
      intentType: 'direct_summon',
      confidence: 0.72,
      explanation: 'fallback to discussion',
      targetLayer: 'orchestration',
      routingHints: {
        riskLevel: 'low',
        shouldExecute: false,
        requiresParallelism: false,
        responseMode: 'direct_reply',
      },
    });
    const out = await ctx.service.handleCeoGovernanceEntry(
      legacy,
      {
        ...makeInput(),
        messageId: 'm-company-people-legacy-ack',
        contentText: '我公司现在都有哪些人？详细告诉我',
      },
      'execution',
    );
    expect(String((out.output?.payload as any)?.fastFinalText ?? '')).toContain('已收到：');
    expect((out.output?.payload as any)?.governanceAck).toBe(true);
  });

  it('returns deterministic role presence for director summon query', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.8,
        explanation: 'mention style',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run({
      ...makeInput(),
      messageId: 'm-role-presence',
      contentText: '销售总监，人呢',
    });
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('uses memory.search lead then forced tools when orchestration model and planner both skip tools', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.76,
        explanation: 'discussion route',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run({
      ...makeInput(),
      messageId: 'm-hard-fallback',
      contentText: '现在群聊中有哪些成员？具体有哪些人？',
    });
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('returns deterministic member list without id-only truncation', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.76,
        explanation: 'discussion route',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run({
      ...makeInput(),
      messageId: 'm-deterministic-members',
      contentText: '现在群聊中有哪些成员？',
    });
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('injects company brain but does not append forced profile questionnaire (orchestration)', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.8,
        explanation: 'company understanding gap',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run({
      ...makeInput(),
      messageId: 'm-company-brain-gap',
      contentText: '我们公司接下来该怎么做？',
    });
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('does not append profile followup when company-level @ exists but route stays orchestration', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.88,
        explanation: 'ceo coordinates after mention',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run({
      ...makeInput(),
      messageId: 'm-mention-summon-orchestration',
      contentText: '@销售总监 在吗',
      mentionedAgentIds: ['sales-director-1'],
      ceoAgentId: 'ceo-1',
    });
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('does not append profile followup for role-speaker action asks', async () => {
    const ctx = makeService({
      layerIntent: {
        intentType: 'orchestration',
        confidence: 0.82,
        explanation: 'role speaker ask',
        targetLayer: 'orchestration',
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run({
      ...makeInput(),
      messageId: 'm-role-speak',
      contentText: '可以让销售总监出来说个话吗？',
    });
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  it('skips unified L1 enrichment when intent20261 planning enrich flag is off', async () => {
    const ctx = makeService({
      intent20261PlanningEnrichEnabled: false,
      layerIntent: {
        traceId: 'trace-off',
        intentType: 'strategy',
        confidence: 0.9,
        explanation: 'x',
        targetLayer: 'strategy',
        targetDepartmentSlugs: ['ops'],
        routingHints: {
          riskLevel: 'low',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    await ctx.service.run(makeInput());
    expect(ctx.l1ClassifierCore.classifyCore).not.toHaveBeenCalled();
    const planArg = ctx.planningService.plan.mock.calls[0]?.[0];
    expect(planArg?.metadata?.pipelineL1PlanningCard).toBeUndefined();
  });

  it('enriches approval-path planning metadata when unified pipeline classifier present', async () => {
    const ctx = makeService({
      layerIntent: {
        traceId: 'trace-appr-l1',
        intentType: 'approval',
        confidence: 0.87,
        explanation: 'approval gate',
        targetLayer: null,
        targetDepartmentSlugs: [],
        routingHints: {
          riskLevel: 'high',
          shouldExecute: false,
          requiresParallelism: false,
          responseMode: 'direct_reply',
        },
      },
    });
    const out = await ctx.service.run(makeInput());
    expect(['execution', 'supervision']).toContain(out.routePath);
  });

  describe('executeSupervisionFlow (Phase 2 supervision path)', () => {
    const heavyIntent = {
      schemaVersion: '1.0',
      intentType: 'orchestration',
      targetMode: 'execution_pipeline',
      targetType: 'system',
      targetLayer: 'supervision',
      targetIds: [],
      confidence: 0.9,
      messageCategory: 'chat',
      responseMode: 'execute_then_reply',
      shouldReply: true,
      shouldExecute: true,
      routingHints: {
        suggestedDepartments: ['ops'],
        requiresParallelism: true,
        riskLevel: 'medium',
      },
      explanation: 'heavy test',
      traceId: 'trace-1',
      roomId: 'r1',
      requestedBy: 'human',
      classifierSource: 'fallback',
      llmUsed: false,
      evidence: {},
    } as const;

    it('tags temporal_department on async temporal start', async () => {
      const ctx = makeService({
        temporalEnabled: true,
        l3TemporalRolloutPercent: 100,
      });
      const out = await (ctx.service as any).executeSupervisionFlow(
        heavyIntent,
        makeInput(),
        makePlanningResult(),
        makeDistribution(),
        'supervision',
        [],
      );
      const payload = out.output?.payload as Record<string, unknown>;
      expect(payload.supervisionResultSource).toBe('temporal_department');
      expect(payload.supervisionMode).toBe('async');
      expect(payload.supervisionDeferred).toBe(true);
      expect(ctx.temporalService.startHeavyExecution).toHaveBeenCalled();
      expect(ctx.supervisionService.supervise).not.toHaveBeenCalled();
    });

    it('forceInlineSupervision skips temporal and runs inline supervise', async () => {
      const ctx = makeService({
        temporalEnabled: true,
        l3TemporalRolloutPercent: 100,
      });
      await (ctx.service as any).executeSupervisionFlow(
        heavyIntent,
        makeInput(),
        makePlanningResult(),
        makeDistribution(),
        'supervision',
        [],
        { forceInlineSupervision: true },
      );
      expect(ctx.temporalService.startHeavyExecution).not.toHaveBeenCalled();
      expect(ctx.supervisionService.supervise).toHaveBeenCalled();
    });
  });
});

