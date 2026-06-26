import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { metrics } from '@opentelemetry/api';
import type { IntentDecision, IntentRoutePath } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from '../collaboration-llm-bridge.service.js';
import { MemoryContextAssemblerService } from '../memory-context-assembler.service.js';
import { CeoV2ToolsService } from '../ceo/v2/tools/ceo-v2-tools.service.js';
import { CeoLayerConfigResolverService } from '../ceo/resolver/ceo-layer-config-resolver.service.js';
import { getCeoMemoryCortexSummaryPrompt, ToolRegistry } from '@service/ai';
import { CeoLayerOpenAiToolsService } from '../ceo/ceo-layer-open-ai-tools.service.js';
import { AgentExecutionService } from '../../agents/services/agent-execution.service.js';
import { CompanyCortexService } from '../../company-runtime/company-cortex.service.js';
import { L1FeatureFlagService } from '../l1/l1-feature-flag.service.js';
import type { CollaborationPipelineV2Service } from './collaboration-pipeline-v2.service.js';
import { lazyCollaborationPipelineV2Service } from './pipeline-v2.forward-ref.js';
import { resolvePipelineRoutePath } from './pipeline-v2-route-path.util.js';
import { isLikelyEchoReply } from '../util/echo-reply-guard.js';
import { isCeoAudienceIntentType } from '../intent/intent-audience.util.js';
import { planIncludesBlock } from '../context/context-grounding-plan.js';
import type { CollaborationPipelineV2RunInput } from './collaboration-pipeline-v2.types.js';
import {
  buildCeoOrchestrationStreamId,
  CollaborationLlmTokenStreamService,
  type LlmStreamModel,
} from '../llm/collaboration-llm-token-stream.service.js';
import {
  CANONICAL_CEO_TOOL_NAMES,
  DEFAULT_TOOL_TOKEN_BUDGET,
  MAX_ORCHESTRATION_TOOL_CALLS,
  MAX_ORCHESTRATION_TOOL_ROUNDS,
  ORCHESTRATION_TOOLS,
  ROSTER_LINES_RENDER_MAX,
  type CeoGovernancePolicyV1,
  type GenerateOrchestrationModelReplyOptions,
  type GovernanceRule,
  type OrchestrationPolicyDecision,
} from './pipeline-v2-orchestration.constants.js';

/** Pipeline V2：主群编排层 CEO 自然语言回复（工具循环 / 策略 / Memory Cortex）。 */
@Injectable()
export class CollaborationMainRoomOrchestrationReplyService {
  private readonly logger = new Logger(CollaborationMainRoomOrchestrationReplyService.name);
  private readonly meter = metrics.getMeter('foundry.collaboration');
  private readonly memoryCortexOnlyCounter = this.meter.createCounter('foundry.memory.cortex.only', {
    description: 'CEO orchestration took memory-cortex-only path (Graph V2 effective + memory-first)',
  });
  private readonly governancePolicyCache = new Map<string, { exp: number; value: CeoGovernancePolicyV1 | null }>();
  private readonly memoryGraphV2EffectiveCache = new Map<string, { exp: number; value: boolean }>();
  private readonly policyStats = {
    total: 0,
    degraded: 0,
    blocked: 0,
    roleSummonTotal: 0,
    roleSummonSuccess: 0,
  };

  constructor(
    private readonly config: ConfigService,
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly memoryContextAssembler: MemoryContextAssemblerService,
    private readonly ceoV2ToolsService: CeoV2ToolsService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly ceoLayerTools: CeoLayerOpenAiToolsService,
    private readonly toolRegistry: ToolRegistry,
    private readonly agentExecution: AgentExecutionService,
    private readonly companyCortex: CompanyCortexService,
    private readonly l1FeatureFlags: L1FeatureFlagService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    @Inject(forwardRef(lazyCollaborationPipelineV2Service))
    private readonly pipeline: CollaborationPipelineV2Service,
    private readonly tokenStreamService: CollaborationLlmTokenStreamService,
  ) {}

  private workerActor() {
    return { id: process.env.WORKER_ACTOR_USER_ID ?? '00000000-0000-0000-0000-000000000000', roles: ['admin'] as string[] };
  }

  pickOrchestrationReplyOptions(intentDecision: IntentDecision): GenerateOrchestrationModelReplyOptions | undefined {
    const t = intentDecision.intentType;
    if (isCeoAudienceIntentType(t)) return { replyProfile: 'direct_fact_answer' };
    return this.config.getCollabSupervisionConversationalProfile() === 'memory_cortex_summary'
      ? { replyProfile: 'memory_cortex_summary' }
      : { replyProfile: 'short_confirm' };
  }

  async generateOrchestrationModelReply(
    intentDecision: IntentDecision,
    input: CollaborationPipelineV2RunInput,
    options?: GenerateOrchestrationModelReplyOptions,
  ): Promise<string | null> {
    const memoryGraphV2RolloutEffective = await this.resolveMemoryGraphV2EffectiveForOrchestration(
      input.companyId,
    );
    const l1FeatureFlagMultiAgentGraphV2 = await this.l1FeatureFlags.isMultiAgentGraphV2EnabledForCompany(
      input.companyId,
    );
    const forceMemoryCortexOnly = this.config.isForceMemoryCortexOnly();
    const memoryCortexOrchestration = memoryGraphV2RolloutEffective || forceMemoryCortexOnly;
    const requestedReplyProfile = options?.replyProfile ?? 'default';
    /** `FORCE_MEMORY_CORTEX_ONLY` 或 Graph V2 生效时固定 Memory Cortex 回复轮廓，禁止 direct_fact_answer */
    const replyProfile = memoryCortexOrchestration ? 'memory_cortex_summary' : requestedReplyProfile;
    const directFactAnswer = replyProfile === 'direct_fact_answer';
    const memoryCortexSummary = replyProfile === 'memory_cortex_summary';
    const shortConfirmProfile = replyProfile === 'short_confirm';
    const groundingPlan = input.collaborationExecutionContext?.contextGroundingPlan;
    const asksOrgDepartmentsMsg =
      groundingPlan?.factsQueryTypes?.includes('org_structure') ||
      planIncludesBlock(groundingPlan, 'org_snapshot');
    const needsPeopleFacts =
      groundingPlan?.factsQueryTypes?.some((t) => t === 'room_members' || t === 'company_people') ||
      planIncludesBlock(groundingPlan, 'room_roster') ||
      planIncludesBlock(groundingPlan, 'company_people');
    const memoryOnlyToolPolicy = groundingPlan?.toolPolicy === 'memory_only';
    const decisionMeta =
      intentDecision.metadata && typeof intentDecision.metadata === 'object'
        ? (intentDecision.metadata as Record<string, unknown>)
        : {};
    const routePath = resolvePipelineRoutePath(intentDecision);
    const rhLegacy = intentDecision.routingHints as {
      explicitDirectTargets?: boolean;
      targetAgentIds?: string[];
    } | null;
    const summonSurface =
      this.hasCompanyLevelMentionSummon(input) ||
      intentDecision.targetIds.length > 0 ||
      Boolean(rhLegacy?.explicitDirectTargets);
    /** P0：召唤面始终视为「对话优先」，与 flag 无关；画像缺口仅 orchestration 重路径评估 */
    const summonProfileSuppress = summonSurface;
    // intent 不做编排路由，profile gap assessment 不再由 intent 层触发
    const includeProfileGapAssessment = false;
    const orchSetting = await this.ceoLayerConfigResolver.resolveLayerSetting(input.companyId, 'orchestration');
    const adminOrchModel = String(orchSetting.modelName ?? '').trim();
    if (!adminOrchModel) {
      throw new Error('pipeline_orchestration_admin_orchestration_model_unconfigured');
    }
    const modelName =
      isCeoAudienceIntentType(intentDecision.intentType) ? 'glm-4-flash' : adminOrchModel;
    try {
      const maxReplyChars = directFactAnswer ? 7200 : 3800;
      const assembled = await this.memoryContextAssembler.assembleForOrchestration({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: input.threadId ?? null,
        messageId: input.messageId,
        latestUserText: input.contentText,
        roomMemberPromptBlock: input.roomMemberPromptBlock ?? null,
        orgSnapshotPromptBlock: input.orgSnapshotPromptBlock ?? null,
        collaborationExecutionContext: input.collaborationExecutionContext,
      });
      const transcript = assembled.messages;
      this.logger.log('foundry.ceo.v2.memory_context.assembled', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        transcriptCount: assembled.diagnostics.transcriptCount,
        compressionTriggered: assembled.diagnostics.compressionTriggered,
        estimatedInputTokens: assembled.diagnostics.estimatedInputTokens,
        estimatedOutputTokens: assembled.diagnostics.estimatedOutputTokens,
        transcriptKeptTurns: assembled.diagnostics.transcriptKeptTurns,
      });
      const contextQuality = this.evaluateContextQuality(assembled.diagnostics);
      const lowContextQuality = contextQuality.quality === 'poor';
      const companyBrain = await this.companyCortex.getCompanyBrainContext({
        companyId: input.companyId,
        roomId: input.roomId,
        userMessage: input.contentText,
        includeProfileGapAssessment,
      });
      this.logger.log('foundry.ceo.v2.memory_context.quality', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        quality: contextQuality.quality,
        score: contextQuality.score,
        reasons: contextQuality.reasons,
      });
      this.logger.log('foundry.ceo.v2.company_brain.context', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        company_profile_hit: companyBrain.profileHit,
        activeAgentCount: companyBrain.activeAgentCount,
        roomMemberCount: companyBrain.roomMemberCount,
        missing_profile_fields: companyBrain.missingFields,
      });
      if (companyBrain.missingFields.length) {
        await this.companyCortex.persistProfileGapSignal({
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          missingFields: companyBrain.missingFields,
          userMessage: input.contentText,
        });
        await this.companyCortex.autoHydratePrimaryProfileFromMessage({
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          userMessage: input.contentText,
          missingFields: companyBrain.missingFields,
        });
      }
      if (contextQuality.quality === 'poor') {
        this.logger.warn('foundry.ceo.v2.memory_context.low_quality', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          intentType: intentDecision.intentType,
          reasons: contextQuality.reasons,
        });
      }
      let orchestrationPolicy = await this.decideOrchestrationPolicy({
        companyId: input.companyId,
        roomId: input.roomId,
        userMessage: input.contentText,
        routePath,
        intentDecision,
        contextQuality,
        companyBrainMissingFields: companyBrain.missingFields,
        summonProfileSuppress,
        groundingPlan,
      });
      if (memoryCortexOrchestration) {
        const now = Date.now();
        const allowCortexAuthoritativeFacts = asksOrgDepartmentsMsg || needsPeopleFacts;
        const cortexForcedFacts: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
        if (asksOrgDepartmentsMsg) {
          cortexForcedFacts.push({
            id: `policy_org_under_cortex_${now}`,
            name: 'facts.company.query',
            args: { queryType: 'org_structure' },
          });
        }
        if (needsPeopleFacts) {
          cortexForcedFacts.push(...this.buildPlannerForcedFactCalls(now, groundingPlan));
        }
        orchestrationPolicy = {
          ...orchestrationPolicy,
          forceFactsCalls: this.mergeForceFactsCallsByQueryType(cortexForcedFacts, orchestrationPolicy.forceFactsCalls),
          ceoCompanyKnowledgeMemoryOnly: !allowCortexAuthoritativeFacts,
          memoryFirstOrchestration: !allowCortexAuthoritativeFacts,
          leadToolCalls:
            orchestrationPolicy.leadToolCalls.length > 0
              ? orchestrationPolicy.leadToolCalls
              : [
                  {
                    id: `policy_lead_memory_graph_v2_${now}`,
                    name: 'memory.search',
                    args: {
                      query: String(input.contentText ?? '').trim().slice(0, 400),
                      topK: 8,
                    },
                  },
                ],
        };
      }
      const suppressDirectFactAnswerTelemetry = directFactAnswer;
      const factsSuppressed =
        orchestrationPolicy.memoryFirstOrchestration || orchestrationPolicy.forceFactsCalls.length === 0;
      const factsToolPrefetchSuppressed = orchestrationPolicy.memoryFirstOrchestration;

      this.logger.log('foundry.ceo.v2.orchestration.policy.hit', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        intentType: intentDecision.intentType,
        routePath,
        replyProfile,
        source: orchestrationPolicy.policySource,
        roleSpeakerRequest: orchestrationPolicy.roleSpeakerRequest,
        requestedRoles: orchestrationPolicy.requestedRoles,
        suppressProfileFollowup: orchestrationPolicy.suppressProfileFollowup,
        summonProfileSuppress,
        includeProfileGapAssessment,
        suppressDirectFactAnswerTelemetry,
        forcedFactsCount: orchestrationPolicy.forceFactsCalls.length,
        ceoCompanyKnowledgeMemoryOnly: orchestrationPolicy.ceoCompanyKnowledgeMemoryOnly,
        memoryFirstOrchestration: orchestrationPolicy.memoryFirstOrchestration,
        memoryGraphV2RolloutEffective,
        l1FeatureFlagMultiAgentGraphV2,
        forceMemoryCortexOnly,
        memoryCortexOrchestration,
        memoryCortexOnly: memoryCortexOrchestration,
        factsSuppressed,
        factsToolPrefetchSuppressed,
      });
      if (memoryCortexOrchestration && orchestrationPolicy.memoryFirstOrchestration) {
        this.memoryCortexOnlyCounter.add(1, { intentType: intentDecision.intentType });
      }
      const markPolicyTelemetry = (params: { finalText: string | null; mode: 'pass' | 'degrade' | 'block'; reason: string }) => {
        this.policyStats.total += 1;
        if (params.mode === 'degrade') this.policyStats.degraded += 1;
        if (params.mode === 'block') this.policyStats.blocked += 1;
        if (orchestrationPolicy.roleSpeakerRequest) {
          this.policyStats.roleSummonTotal += 1;
          if (params.mode !== 'block') this.policyStats.roleSummonSuccess += 1;
        }
        const misBlockRate = this.policyStats.total > 0 ? this.policyStats.blocked / this.policyStats.total : 0;
        const degradeRate = this.policyStats.total > 0 ? this.policyStats.degraded / this.policyStats.total : 0;
        const roleSummonSuccessRate =
          this.policyStats.roleSummonTotal > 0 ? this.policyStats.roleSummonSuccess / this.policyStats.roleSummonTotal : 1;
        this.logger.log('foundry.ceo.v2.orchestration.policy.metrics', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          decisionMode: params.mode,
          reason: params.reason,
          roleSpeakerRequest: orchestrationPolicy.roleSpeakerRequest,
          misBlockRate,
          degradeRate,
          roleSummonSuccessRate,
        });
      };

      const intentIsSimpleQueryTurn = isCeoAudienceIntentType(intentDecision.intentType);
      const collabIntentMs = this.config.getCollabIntentLlmTimeoutMs();
      /** 受众类 intent 在「非 Memory Cortex 编排」时才是轻量单轮；Graph V2 / 强制 Cortex 下仍为多轮工具 + 长叙事，不能与 Intent 分类同档超时。 */
      const timeoutMs =
        intentIsSimpleQueryTurn && !memoryCortexOrchestration
          ? Math.min(25_000, Math.max(4_000, collabIntentMs))
          : Math.max(30_000, collabIntentMs);
      const model = (await this.llmBridge.createChatModel({
        companyId: input.companyId,
        fallbackModelName: modelName,
        llmTimeoutMs: timeoutMs,
        maxOutputTokens: directFactAnswer ? 1400 : memoryCortexSummary ? 900 : shortConfirmProfile ? 420 : 220,
        temperatureOverride: directFactAnswer ? 0.25 : 0.4,
        ceoContext: 'orchestration',
        trace: { messageId: input.messageId, callsite: 'collab.orchestration.reply' },
        meteringAgentId: input.ceoAgentId ?? undefined,
      })) as any;
      const configuredTools =
        input.ceoAgentId
          ? await this.buildConfiguredOrchestrationTools({
              companyId: input.companyId,
              ceoAgentId: input.ceoAgentId,
            })
          : { tools: [], injectedToolNames: [], configuredSkillIds: [] as string[] };
      const orchestrationCapabilitySkillIds = configuredTools.configuredSkillIds ?? [];
      const useConfiguredTools = configuredTools.tools.length > 0;
      let tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> =
        useConfiguredTools ? configuredTools.tools : ORCHESTRATION_TOOLS;
      const stripFactsTools =
        (orchestrationPolicy.memoryFirstOrchestration || this.config.isForceMemoryCortexOnly()) &&
        !asksOrgDepartmentsMsg;
      if (stripFactsTools) {
        tools = tools.filter((t) => {
          const n = String(t?.function?.name ?? '').trim();
          if (n.startsWith('facts.')) return false;
          if (this.config.isForceMemoryCortexOnly() && n === 'department.knowledge.query') return false;
          return true;
        });
        if (tools.length === 0) {
          tools = ORCHESTRATION_TOOLS.filter((t) => t.function.name === 'memory.search');
        }
      }
      const modelWithTools =
        tools.length && typeof model?.bind === 'function' ? model.bind({ tools, tool_choice: 'auto' }) : model;
      const toolResultsForFinal: Array<{
        toolName: string;
        ok: boolean;
        summary: string;
        data?: unknown;
      }> = [];
      const messages: any[] = [
        new SystemMessage(
          [
            intentDecision.targetLayer === 'supervision'
              ? 'You are CEO supervision layer in group chat.'
              : intentDecision.targetLayer === 'strategy'
                ? 'You are CEO strategy layer in group chat.'
                : 'You are CEO orchestration layer in group chat.',
            memoryCortexSummary
              ? [
                  '你现在是公司 CEO，正在和创始人/高管进行非正式但战略性的对话。使用第一人称、自然口语，融入公司长期记忆，回答要全面、有洞见、带前瞻性。',
                  '',
                  getCeoMemoryCortexSummaryPrompt().trim(),
                ].join('\n')
              : directFactAnswer
                ? [
                    '# Reply profile: DIRECT_FACT_ANSWER',
                    '- Answer directly in Chinese; skip strategic programme / governance / milestone framing.',
                    '- Use numbered or bullet lists when listing people, roles, departments, or checklist facts.',
                    '- Internal context blocks (roster, org snapshot) are not for user-facing repetition unless the user explicitly asked.',
                    '- Only enumerate full member rows when tool results or context clearly support a personnel question.',
                  ].join('\n')
                : '',
            memoryCortexSummary
              ? 'Reply in natural Chinese: prefer fluent paragraphs; match depth to the question without sounding like a status report.'
              : 'Reply naturally and briefly in Chinese.',
            directFactAnswer && needsPeopleFacts
              ? 'Allow longer replies when listing structured factual enumerations.'
              : '',
            'Do not paraphrase or repeat the user message.',
            'Provide concrete information or a clear next step; never answer with a question-only paraphrase.',
            'You can autonomously call tools when factual or memory evidence is needed.',
            memoryCortexSummary
              ? asksOrgDepartmentsMsg
                ? 'Planner selected org facts: call facts.company.query with queryType org_structure when needed; align with 【organization.org_snapshot】 if present.'
                : needsPeopleFacts
                  ? 'Planner selected people facts: use facts.company.query (room_members, company_people) when needed; ground on tool results.'
                  : memoryOnlyToolPolicy
                    ? 'This turn is memory-only: use memory.search plus conversation context; do not call facts.company.query.'
                    : 'This turn is Memory Cortex–first: prefer memory.search; call facts only when gaps remain.'
              : memoryOnlyToolPolicy
                ? 'Tools: memory.search only this turn.'
                : 'Available tools are for company facts, memory search, and department knowledge.',
            !memoryCortexSummary && needsPeopleFacts
              ? 'Ground people questions on tool results before saying data is missing.'
              : '',
            orchestrationPolicy.memoryFirstOrchestration
              ? 'Round 0 prepends memory.search. Ground people, roster, org, roles, and membership from memory hits and Company Brain; do NOT call facts.company.query.'
              : orchestrationPolicy.leadToolCalls.length
                ? 'Round 0 prepends memory.search (API graph lineage hybrid path); ground company/person/org answers on those hits before spending extra calls on live facts.'
                : 'For broad company-status questions, prefer facts.company.query with company_people and org_structure before answering.',
            'You MUST ground company-level statements in Company Brain context first, then tools.',
            'If evidence is insufficient after tool calls, clearly state that it cannot be confirmed now.',
            orchestrationPolicy.roleSpeakerRequest && !memoryCortexSummary
              ? 'For role-speaker summon requests, do not block on missing company profile fields. Use facts tools to confirm role presence and provide a direct coordination response.'
              : '',
            'Do not expose internal routing/rule/trace details.',
            `Company Brain:\n${companyBrain.summary}`,
          ]
            .filter(Boolean)
            .join('\n'),
        ),
        ...transcript,
        new HumanMessage(
          JSON.stringify({
            userMessage: input.contentText,
            intentType: intentDecision.intentType,
            intentReason: intentDecision.explanation,
            companyBrainMissingFields: companyBrain.missingFields,
            roleSpeakerRequest: orchestrationPolicy.roleSpeakerRequest,
          }),
        ),
      ];
      const calledToolNames: string[] = [];
      const toolTokenBudget = Math.max(
        directFactAnswer ? 2400 : 800,
        Number(decisionMeta.toolTokenBudget ?? DEFAULT_TOOL_TOKEN_BUDGET) || DEFAULT_TOOL_TOKEN_BUDGET,
      );
      let estimatedToolTokensUsed = 0;
      let raw: any = null;
      let stoppedByBudget = false;
      let prefetchedToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
      if (input.ceoAgentId && tools.length && orchestrationPolicy.leadToolCalls.length === 0) {
        prefetchedToolCalls = await this.planInitialToolCallsFast({
          modelWithTools,
          userMessage: input.contentText,
          intentType: intentDecision.intentType,
          intentReason: intentDecision.explanation,
        });
      }
      if (prefetchedToolCalls.length === 0) {
        prefetchedToolCalls = [...orchestrationPolicy.leadToolCalls, ...orchestrationPolicy.forceFactsCalls].slice(
          0,
          MAX_ORCHESTRATION_TOOL_CALLS,
        );
      }
      for (let round = 0; round < MAX_ORCHESTRATION_TOOL_ROUNDS; round += 1) {
        if (estimatedToolTokensUsed >= toolTokenBudget) {
          stoppedByBudget = true;
          break;
        }
        let toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
        if (round === 0 && prefetchedToolCalls.length) {
          toolCalls = prefetchedToolCalls;
        } else {
          raw = await Promise.race([
            modelWithTools.invoke(messages),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`orchestration_reply_llm_hard_timeout_${timeoutMs + 250}ms`)), timeoutMs + 250);
            }),
          ]);
          messages.push(raw);
          toolCalls = this.extractToolCalls(raw);
        }
        if (!toolCalls.length && round === 0 && input.ceoAgentId) {
          const planned = await this.planToolCallsWhenModelSkipped({
            model,
            transcript,
            userMessage: input.contentText,
            intentType: intentDecision.intentType,
            intentReason: intentDecision.explanation,
            tools,
          });
          if (planned.length) {
            toolCalls = planned;
            this.logger.log('foundry.ceo.v2.orchestration.tools.planned_fallback', {
              companyId: input.companyId,
              roomId: input.roomId,
              messageId: input.messageId,
              plannedToolCount: planned.length,
              plannedToolNames: planned.map((x) => x.name).slice(0, 10),
            });
          }
        }
        if (!toolCalls.length) break;
        if (!input.ceoAgentId) break;
        const selectedToolCalls = toolCalls.slice(0, MAX_ORCHESTRATION_TOOL_CALLS);
        selectedToolCalls.forEach((c) => calledToolNames.push(c.name));
        const toolResults = useConfiguredTools
          ? await Promise.all(
              selectedToolCalls.map(async (call) => {
                const normalizedArgs = this.normalizeToolArgs(call.args);
                try {
                  if (CANONICAL_CEO_TOOL_NAMES.has(String(call.name ?? '').trim())) {
                    const results = await this.ceoV2ToolsService.executeTools({
                      companyId: input.companyId,
                      roomId: input.roomId,
                      threadId: input.threadId ?? null,
                      traceId: input.executionTokenId ?? input.messageId,
                      messageId: input.messageId,
                      ceoAgentId: input.ceoAgentId!,
                      humanSenderId: input.humanSenderId ?? null,
                      toolCalls: [{ id: call.id, name: call.name, args: normalizedArgs }],
                      maxCalls: 1,
                    });
                    return (
                      results[0] ?? {
                        ok: false,
                        toolName: call.name,
                        toolCallId: call.id,
                        data: null,
                        error: 'CANONICAL_TOOL_NO_RESULT',
                      }
                    );
                  }
                  const exec = await this.agentExecution.executeSkill({
                    companyId: input.companyId,
                    agentId: input.ceoAgentId!,
                    projectId: undefined,
                    skillName: call.name,
                    args: normalizedArgs,
                    traceId: input.executionTokenId ?? input.messageId,
                    roles: this.workerActor().roles,
                    layer: 'orchestration',
                    capabilitySkillIds: orchestrationCapabilitySkillIds,
                  } as any);
                  return {
                    ok: true,
                    toolName: call.name,
                    toolCallId: call.id,
                    data: { summary: typeof exec?.result === 'string' ? exec.result : JSON.stringify(exec?.result ?? null) },
                    error: null,
                  };
                } catch (e: unknown) {
                  return {
                    ok: false,
                    toolName: call.name,
                    toolCallId: call.id,
                    data: null,
                    error: e instanceof Error ? e.message : String(e),
                  };
                }
              }),
            )
          : await this.ceoV2ToolsService.executeTools({
              companyId: input.companyId,
              roomId: input.roomId,
              threadId: input.threadId ?? null,
              traceId: input.executionTokenId ?? input.messageId,
              messageId: input.messageId,
              ceoAgentId: input.ceoAgentId,
              humanSenderId: input.humanSenderId ?? null,
              toolCalls: selectedToolCalls.map((call) => ({
                id: call.id,
                name: call.name,
                args: this.normalizeToolArgs(call.args),
              })),
              maxCalls: MAX_ORCHESTRATION_TOOL_CALLS,
            });
        for (const toolResult of toolResults) {
          const content = JSON.stringify(toolResult);
          estimatedToolTokensUsed += Math.ceil(content.length / 4);
          toolResultsForFinal.push({
            toolName: toolResult.toolName,
            ok: Boolean(toolResult.ok),
            summary: String((toolResult.data as any)?.summary ?? '').trim() || content.slice(0, 1200),
            data: toolResult.data,
          });
          messages.push(
            new ToolMessage({
              tool_call_id: toolResult.toolCallId,
              content,
            }),
          );
        }
        if (estimatedToolTokensUsed >= toolTokenBudget) {
          stoppedByBudget = true;
          break;
        }
      }
      if (calledToolNames.length) {
        this.logger.log('foundry.ceo.v2.orchestration.tools.called', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          calledToolCount: calledToolNames.length,
          calledToolNames: calledToolNames.slice(0, 24),
          toolInjectionMode: useConfiguredTools ? 'configured_skills' : 'builtin_fallback',
          configuredToolCount: configuredTools.injectedToolNames.length,
          configuredToolNames: configuredTools.injectedToolNames.slice(0, 50),
          estimatedToolTokensUsed,
          toolTokenBudget,
          stoppedByBudget,
        });
      }
      const deterministicFactsReply = this.buildDeterministicFactsReply(toolResultsForFinal);
      if (deterministicFactsReply) {
        this.logger.log('foundry.ceo.v2.orchestration.reply.fastpath_facts', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          usedToolCount: toolResultsForFinal.length,
        });
        markPolicyTelemetry({ finalText: deterministicFactsReply, mode: 'pass', reason: 'deterministic_facts' });
        return deterministicFactsReply.slice(0, maxReplyChars);
      }
      const finalPromptMessages = [
        new SystemMessage(
          [
            'You are CEO orchestration layer in group chat.',
            'Generate the final answer in Chinese based on conversation and tool evidence.',
            directFactAnswer && !memoryCortexSummary
              ? 'Expand lists fully when tool or roster evidence supports it; avoid replacing enumerations with summary counts alone.'
              : memoryCortexSummary
                ? 'Prefer narrative synthesis over exhaustive enumeration; only use short lists when the user asked for structure.'
                : '',
            'Use tool evidence first for factual claims; do not hallucinate.',
            'If evidence is missing or insufficient, explicitly state what cannot be confirmed now.',
            orchestrationPolicy.roleSpeakerRequest
              ? 'If this is a role-speaker summon request, provide direct coordination response and never ask the user to complete company profile first.'
              : '',
            'Do not expose internal routing/rule/trace details.',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
        ...transcript,
        new HumanMessage(
          JSON.stringify({
            userMessage: input.contentText,
            intentType: intentDecision.intentType,
            intentReason: intentDecision.explanation,
            toolResultsSummary: toolResultsForFinal.slice(-MAX_ORCHESTRATION_TOOL_CALLS),
            toolBudgetStopped: stoppedByBudget,
            toolTokensUsed: estimatedToolTokensUsed,
            toolTokenBudget,
            companyBrainSummary: companyBrain.summary,
            companyBrainMissingFields: companyBrain.missingFields,
            roleSpeakerRequest: orchestrationPolicy.roleSpeakerRequest,
          }),
        ),
      ];
      const finalStreamed = await this.streamOrchestrationFinalReply({
        model: model as LlmStreamModel,
        messages: finalPromptMessages as Array<HumanMessage | SystemMessage | ToolMessage>,
        input,
        intentDecision,
        timeoutMs,
        fallbackRaw: raw,
      });
      const text = finalStreamed.trim();
      if (!text) {
        if (lowContextQuality && toolResultsForFinal.length === 0) {
          const degradedText = '我目前拿到的上下文不足，暂时无法给出可信结论。请补充你希望我查询的范围（例如：群成员、组织结构、当前任务状态）。';
          markPolicyTelemetry({ finalText: degradedText, mode: 'degrade', reason: 'low_context' });
          return '我目前拿到的上下文不足，暂时无法给出可信结论。请补充你希望我查询的范围（例如：群成员、组织结构、当前任务状态）。';
        }
        markPolicyTelemetry({ finalText: null, mode: 'block', reason: 'empty_model_reply' });
        return null;
      }
      if (isLikelyEchoReply(input.contentText, text)) {
        this.logger.warn('foundry.ceo.v2.orchestration_reply.echo_blocked', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          intentType: intentDecision.intentType,
          replyPreview: text.slice(0, 120),
        });
        const recoverMessages = [
            new SystemMessage(
              [
                'You are CEO orchestration layer in group chat.',
                'Reply in Chinese.',
                'Use recent chat history to answer the latest user message.',
                'Do not repeat the user message verbatim.',
                'If you cannot infer a confident answer from history, return one concise clarification sentence.',
                'Do not expose internal routing/rule/trace details.',
              ].join('\n'),
            ),
            ...transcript,
            new HumanMessage(
              JSON.stringify({
                userMessage: input.contentText,
                intentType: intentDecision.intentType,
                intentReason: intentDecision.explanation,
              }),
            ),
          ];
        const recoveredText = await this.streamOrchestrationFinalReply({
          model: model as LlmStreamModel,
          messages: recoverMessages as Array<HumanMessage | SystemMessage | ToolMessage>,
          input,
          intentDecision,
          timeoutMs,
        });
        if (recoveredText && !isLikelyEchoReply(input.contentText, recoveredText)) {
          markPolicyTelemetry({ finalText: recoveredText, mode: 'pass', reason: 'echo_recovered' });
          return recoveredText.slice(0, maxReplyChars);
        }
        if (lowContextQuality && toolResultsForFinal.length === 0) {
          const degradedText = '我目前拿到的上下文不足，无法确认这条问题。你可以补充目标范围，我会先检索事实再回答。';
          markPolicyTelemetry({ finalText: degradedText, mode: 'degrade', reason: 'echo_recover_low_context' });
          return '我目前拿到的上下文不足，无法确认这条问题。你可以补充目标范围，我会先检索事实再回答。';
        }
        markPolicyTelemetry({
          finalText: '我没有拿到足够稳定的答案。请把上一句再发一次，我会严格按上文继续。',
          mode: 'block',
          reason: 'echo_unresolved',
        });
        return '我没有拿到足够稳定的答案。请把上一句再发一次，我会严格按上文继续。';
      }
      markPolicyTelemetry({ finalText: text, mode: 'pass', reason: 'normal' });
      return text.slice(0, maxReplyChars);
    } catch (error) {
      this.logger.warn('foundry.ceo.v2.orchestration_reply.model_failed', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        modelTried: adminOrchModel,
        audienceIntentFallbackLabel: modelName !== adminOrchModel ? modelName : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }

  private async planInitialToolCallsFast(input: {
    modelWithTools: any;
    userMessage: string;
    intentType: string;
    intentReason?: string | null;
  }): Promise<Array<{ id: string; name: string; args: Record<string, unknown> }>> {
    try {
      const fastRaw = await input.modelWithTools.invoke([
        new SystemMessage(
          [
            'You are a fast tool router for CEO orchestration.',
            'Decide whether tool calls are needed for the latest user message.',
            'If needed, call tools directly; otherwise respond with exactly: NO_TOOL',
            'Do not answer the user question.',
          ].join('\n'),
        ),
        new HumanMessage(
          JSON.stringify({
            userMessage: input.userMessage,
            intentType: input.intentType,
            intentReason: input.intentReason ?? null,
          }),
        ),
      ]);
      return this.extractToolCalls(fastRaw);
    } catch {
      return [];
    }
  }

  private buildDeterministicFactsReply(
    toolResults: Array<{ toolName: string; ok: boolean; summary: string; data?: unknown }>,
  ): string | null {
    const factsResults = [...toolResults]
      .filter((x) => x.toolName === 'facts.company.query' && x.ok)
      .map((x) => (((x.data ?? {}) as Record<string, unknown>) ?? {}))
      .filter((x) => String(x.queryType ?? '').trim().length > 0);
    if (!factsResults.length) return null;
    const uniqueQueryTypes = new Set(factsResults.map((x) => String(x.queryType ?? '').trim()).filter(Boolean));
    const hasMultiDimensionFacts = uniqueQueryTypes.size >= 2;
    if (hasMultiDimensionFacts) {
      const latestByType = new Map<string, Record<string, unknown>>();
      for (const item of factsResults) {
        latestByType.set(String(item.queryType ?? '').trim(), item);
      }
      const sections: string[] = [];
      const companyPeople = latestByType.get('company_people');
      const orgStructure = latestByType.get('org_structure');
      const rolePresence = latestByType.get('role_presence');
      const roomMembers = latestByType.get('room_members');

      if (companyPeople) {
        const block = this.renderSingleFactsReply(
          'company_people',
          ((companyPeople.facts ?? {}) as Record<string, unknown>) ?? {},
        );
        if (block) sections.push(`【公司人员】\n${block}`);
      }
      if (orgStructure) {
        const line = this.renderSingleFactsReply(
          'org_structure',
          ((orgStructure.facts ?? {}) as Record<string, unknown>) ?? {},
        );
        if (line) sections.push(`组织：${line}`);
      }
      if (rolePresence) {
        const line = this.renderSingleFactsReply(
          'role_presence',
          ((rolePresence.facts ?? {}) as Record<string, unknown>) ?? {},
        );
        if (line) sections.push(`岗位分布：${line}`);
      }
      if (roomMembers) {
        const block = this.renderSingleFactsReply(
          'room_members',
          ((roomMembers.facts ?? {}) as Record<string, unknown>) ?? {},
        );
        if (block) sections.push(`【当前会话成员】\n${block}`);
      }
      if (sections.length) {
        return ['基于当前可用事实，公司概况如下：', ...sections].join('\n');
      }
    }

    const latest = factsResults[factsResults.length - 1];
    const queryType = String(latest.queryType ?? '').trim();
    const facts = ((latest.facts ?? {}) as Record<string, unknown>) ?? {};
    return this.renderSingleFactsReply(queryType, facts);
  }

  private renderSingleFactsReply(queryType: string, facts: Record<string, unknown>): string | null {
    if (!queryType) return null;
    if (queryType === 'room_members') {
      const members = Array.isArray(facts.roomMembers) ? (facts.roomMembers as Array<Record<string, unknown>>) : [];
      const total = Number(((facts.counts as any)?.roomMembers ?? members.length) || members.length);
      if (!members.length) return `当前群聊成员共 ${Number.isFinite(total) ? total : 0} 人，暂未拿到可展示的成员明细。`;
      const lines = members.slice(0, ROSTER_LINES_RENDER_MAX).map((m, idx) => {
        const memberType = String(m.memberType ?? 'unknown');
        const role = String(m.role ?? '').trim();
        const display =
          String(m.displayName ?? '').trim() ||
          (memberType === 'human'
            ? `用户-${String(m.memberId ?? '').slice(0, 8)}`
            : `Agent-${String(m.memberId ?? '').slice(0, 8)}`);
        const roleText = role ? `（${role}）` : '';
        return `${idx + 1}. ${display}${roleText}`;
      });
      const omitted = Math.max(0, total - Math.min(total, ROSTER_LINES_RENDER_MAX));
      return [
        `当前群聊共有 ${total} 名成员。`,
        ...lines,
        omitted > 0 ? `其余 ${omitted} 名成员已省略，如需我可以继续分批展示。` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (queryType === 'company_people') {
      const people = Array.isArray(facts.companyPeople) ? (facts.companyPeople as Array<Record<string, unknown>>) : [];
      const total = Number(((facts.counts as any)?.companyPeople ?? people.length) || people.length);
      const lines = people.slice(0, ROSTER_LINES_RENDER_MAX).map((p, idx) => {
        const name = String(p.name ?? '').trim() || `成员-${String(p.id ?? '').slice(0, 8)}`;
        const role = String(p.role ?? '').trim();
        return role ? `${idx + 1}. ${name}（${role}）` : `${idx + 1}. ${name}`;
      });
      if (!lines.length) return `当前公司人员记录共 ${Number.isFinite(total) ? total : 0} 条，暂未拿到可展示的人员明细。`;
      const omitted = Math.max(0, total - Math.min(total, ROSTER_LINES_RENDER_MAX));
      return [
        `当前公司人员记录共 ${total} 条。`,
        ...lines,
        omitted > 0 ? `其余 ${omitted} 条已省略，如需我可以继续分批展示。` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (queryType === 'org_structure') {
      const tree = Array.isArray((facts.orgStructure as any)?.tree)
        ? ((facts.orgStructure as any).tree as Array<Record<string, unknown>>)
        : [];
      const total = tree.length;
      if (!total) return '组织结构节点数：0（暂未拿到详细节点）。';
      const samples = tree
        .slice(0, 6)
        .map((n) => String(n.name ?? n.displayName ?? n.departmentName ?? '').trim())
        .filter(Boolean);
      return samples.length
        ? `组织结构节点数：${total}；示例部门：${samples.join('、')}`
        : `组织结构节点数：${total}`;
    }

    if (queryType === 'role_presence') {
      const matches = Array.isArray(facts.roleMatches) ? (facts.roleMatches as Array<Record<string, unknown>>) : [];
      const total = Number(((facts.counts as any)?.roleMatches ?? matches.length) || matches.length);
      if (!matches.length) return `角色匹配结果：0 人。`;
      const names = matches
        .slice(0, 10)
        .map((m) => {
          const name = String(m.displayName ?? m.name ?? m.memberId ?? '').trim();
          const role = String(m.role ?? '').trim();
          if (!name) return '';
          return role ? `${name}(${role})` : name;
        })
        .filter(Boolean);
      return `角色匹配结果：${total} 人；样例：${names.join('、') || '暂无'}`;
    }

    return null;
  }

  private async decideOrchestrationPolicy(input: {
    companyId: string;
    roomId: string;
    userMessage: string;
    routePath: IntentRoutePath;
    intentDecision: IntentDecision;
    contextQuality: { quality: 'good' | 'fair' | 'poor'; score: number; reasons: string[] };
    companyBrainMissingFields: string[];
    /** P0：公司级 @ / 直连召唤时抑制画像追问，并 boost 角色事实工具 */
    summonProfileSuppress: boolean;
    groundingPlan?: import('../context/context-grounding-plan.js').ContextGroundingPlan | null;
  }): Promise<OrchestrationPolicyDecision> {
    const now = Date.now();
    const plan = input.groundingPlan;
    const asksOrgDepartments =
      plan?.factsQueryTypes?.includes('org_structure') || planIncludesBlock(plan, 'org_snapshot');
    const needsPeopleAuthoritativeFacts =
      plan?.factsQueryTypes?.some((t) => t === 'room_members' || t === 'company_people') ||
      planIncludesBlock(plan, 'room_roster') ||
      planIncludesBlock(plan, 'company_people');
    const roleSpeakerRequest = this.isRoleSpeakerRequest(input.userMessage);
    const requestedRoles = this.pipeline.extractRequestedRoles(input.userMessage);
    const governancePolicy = await this.getCeoGovernancePolicy(input.companyId);
    const allowedFactTypes = new Set(['company_people', 'room_members', 'role_presence', 'org_structure']);
    const policyDefaults = governancePolicy?.defaults ?? {};
    const roomRule =
      governancePolicy?.roomOverrides && typeof governancePolicy.roomOverrides === 'object'
        ? (governancePolicy.roomOverrides[input.roomId] ?? {})
        : {};
    const roleRule = requestedRoles.reduce<GovernanceRule>((acc, role) => {
      const candidate = governancePolicy?.roleOverrides?.[role];
      if (!candidate || typeof candidate !== 'object') return acc;
      return {
        ...acc,
        ...candidate,
      };
    }, {});
    const effectiveRule: GovernanceRule = {
      ...policyDefaults,
      ...roomRule,
      ...roleRule,
    };
    const poorContext = input.contextQuality.quality === 'poor';
    const policyForcedTypes = Array.isArray(effectiveRule.forceFactsQueryTypes)
      ? effectiveRule.forceFactsQueryTypes
          .map((x) => String(x ?? '').trim())
          .filter((x) => allowedFactTypes.has(x))
          .slice(0, 4)
      : [];
    const policyForcedCalls = policyForcedTypes.map((queryType, idx) => ({
      id: `policy_cfg_${queryType}_${now}_${idx + 1}`,
      name: 'facts.company.query' as const,
      args: {
        queryType,
      },
    }));
    const summonFactsBoost = roleSpeakerRequest || input.summonProfileSuppress;
    const roleSpeakerFallbackCalls = summonFactsBoost
      ? ([
          { id: `policy_role_presence_${now}`, name: 'facts.company.query', args: { queryType: 'role_presence' } },
          { id: `policy_role_room_members_${now}`, name: 'facts.company.query', args: { queryType: 'room_members' } },
        ] as Array<{ id: string; name: string; args: Record<string, unknown> }>)
      : [];
    const deterministicFallbackCalls = poorContext
      ? ([
          { id: `policy_fallback_room_members_${now}`, name: 'facts.company.query', args: { queryType: 'room_members' } },
          { id: `policy_fallback_company_people_${now}`, name: 'facts.company.query', args: { queryType: 'company_people' } },
          { id: `policy_fallback_org_structure_${now}`, name: 'facts.company.query', args: { queryType: 'org_structure' } },
          { id: `policy_fallback_role_presence_${now}`, name: 'facts.company.query', args: { queryType: 'role_presence' } },
        ] as Array<{ id: string; name: string; args: Record<string, unknown> }>)
      : [];
    const fallback: OrchestrationPolicyDecision = {
      forceFactsCalls:
        policyForcedCalls.length > 0
          ? policyForcedCalls
          : summonFactsBoost
            ? roleSpeakerFallbackCalls
            : deterministicFallbackCalls,
      leadToolCalls: [],
      ceoCompanyKnowledgeMemoryOnly: false,
      memoryFirstOrchestration: false,
      suppressProfileFollowup:
        (roleSpeakerRequest && effectiveRule.allowRoleSpeakerWithoutProfile !== false) ||
        effectiveRule.suppressProfileFollowup === true ||
        input.intentDecision.targetIds.length > 0 ||
        input.summonProfileSuppress,
      roleSpeakerRequest,
      policySource: governancePolicy ? 'db' : 'builtin',
      requestedRoles,
    };
    const meta =
      input.intentDecision.metadata && typeof input.intentDecision.metadata === 'object'
        ? (input.intentDecision.metadata as Record<string, unknown>)
        : {};
    const policyRaw =
      meta.orchestrationPolicy && typeof meta.orchestrationPolicy === 'object'
        ? (meta.orchestrationPolicy as Record<string, unknown>)
        : meta.decisionContract &&
            typeof meta.decisionContract === 'object' &&
            (meta.decisionContract as Record<string, unknown>).policy &&
            typeof (meta.decisionContract as Record<string, unknown>).policy === 'object'
          ? ((meta.decisionContract as Record<string, unknown>).policy as Record<string, unknown>)
          : {};
    const forceFactsCallsRaw = Array.isArray(policyRaw.forceFactsCalls)
      ? (policyRaw.forceFactsCalls as Array<Record<string, unknown>>)
      : [];
    const allowedTypes = new Set(['company_people', 'room_members', 'role_presence', 'org_structure']);
    const forceFactsCalls = forceFactsCallsRaw
      .slice(0, 3)
      .map((call, idx) => {
        const queryType = String(call?.queryType ?? '').trim();
        if (!allowedTypes.has(queryType)) return null;
        const roleQuery = String(call?.roleQuery ?? '').trim();
        return {
          id: `policy_forced_${queryType}_${now}_${idx + 1}`,
          name: 'facts.company.query',
          args: {
            queryType,
            ...(queryType === 'role_presence' && roleQuery ? { roleQuery: roleQuery.slice(0, 60) } : {}),
          },
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string; args: Record<string, unknown> }>;

    type ForceFactCall = { id: string; name: string; args: Record<string, unknown> };
    let resolvedForceFacts: ForceFactCall[] =
      forceFactsCalls.length > 0
        ? forceFactsCalls
        : policyForcedCalls.length > 0
          ? policyForcedCalls
          : summonFactsBoost
            ? roleSpeakerFallbackCalls
            : deterministicFallbackCalls;

    const plannerWantsMemory =
      planIncludesBlock(plan, 'memory') ||
      planIncludesBlock(plan, 'company_profile') ||
      (plan?.factsQueryTypes?.length ?? 0) === 0;
    const memoryGraphV2RolloutEffectiveForPlanner = plannerWantsMemory
      ? await this.resolveMemoryGraphV2EffectiveForOrchestration(input.companyId)
      : false;
    const ceoCompanyKnowledgeMemoryOnly =
      plan?.toolPolicy === 'memory_only' ||
      (plannerWantsMemory && memoryGraphV2RolloutEffectiveForPlanner && !asksOrgDepartments && !needsPeopleAuthoritativeFacts);
    let leadToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
    if (plannerWantsMemory) {
      leadToolCalls = [
        {
          id: `policy_lead_memory_search_${now}`,
          name: 'memory.search',
          args: {
            query: String(input.userMessage ?? '').trim().slice(0, 400),
            topK: 8,
          },
        },
      ];
      if (memoryGraphV2RolloutEffectiveForPlanner && !asksOrgDepartments && !needsPeopleAuthoritativeFacts) {
        resolvedForceFacts = this.stripFactsCompanyQueryCalls(resolvedForceFacts);
      } else if (needsPeopleAuthoritativeFacts) {
        resolvedForceFacts = this.mergeForceFactsCallsByQueryType(
          this.buildPlannerForcedFactCalls(now, plan),
          resolvedForceFacts,
        );
      }
      this.logger.log('foundry.ceo.v2.orchestration.policy.planner_memory', {
        companyId: input.companyId,
        roomId: input.roomId,
        memoryGraphV2RolloutEffective: memoryGraphV2RolloutEffectiveForPlanner,
        leadMemorySearch: true,
        prefetchBlocks: plan?.prefetchBlocks ?? [],
      });
    }

    const intentIsSimpleQuery = isCeoAudienceIntentType(input.intentDecision.intentType);
    if (intentIsSimpleQuery) {
      /** ceo_reply / quick：默认 memory-first；问部门 / 问人员时必须并行拉权威 facts（与 replay 房内目录策略对齐）。 */
      leadToolCalls = [
        {
          id: `policy_lead_memory_search_ceo_reply_${now}`,
          name: 'memory.search',
          args: {
            query: String(input.userMessage ?? '').trim().slice(0, 400),
            topK: 8,
          },
        },
      ];
      resolvedForceFacts = [];
      if (asksOrgDepartments) {
        resolvedForceFacts.push({
          id: `policy_org_structure_audience_${now}`,
          name: 'facts.company.query',
          args: { queryType: 'org_structure' },
        });
      }
      if (needsPeopleAuthoritativeFacts) {
        resolvedForceFacts = this.mergeForceFactsCallsByQueryType(
          this.buildPlannerForcedFactCalls(now, plan),
          resolvedForceFacts,
        );
      }
      this.logger.log('foundry.ceo.v2.orchestration.policy.ceo_reply_memory_first', {
        companyId: input.companyId,
        roomId: input.roomId,
        leadMemorySearch: true,
        forcedFactsSuppressed: !asksOrgDepartments && !needsPeopleAuthoritativeFacts,
        orgDepartmentsQuestion: asksOrgDepartments,
        peopleAuthoritativeFacts: needsPeopleAuthoritativeFacts,
      });
    }

    const fromPolicy =
      typeof policyRaw.suppressProfileFollowup === 'boolean'
        ? policyRaw.suppressProfileFollowup
        : fallback.suppressProfileFollowup;
    const forceSuppressQuickPath =
      this.config.isCollabProfileFollowupSuppressQuick() &&
      isCeoAudienceIntentType(input.intentDecision.intentType);

    let memoryFirstOrchestration = Boolean(ceoCompanyKnowledgeMemoryOnly || intentIsSimpleQuery);
    if (asksOrgDepartments) {
      resolvedForceFacts = this.mergeForceFactsCallsByQueryType(
        [
          {
            id: `policy_org_departments_merge_${now}`,
            name: 'facts.company.query',
            args: { queryType: 'org_structure' },
          },
        ],
        resolvedForceFacts,
      );
      memoryFirstOrchestration = false;
    }
    if (needsPeopleAuthoritativeFacts) {
      resolvedForceFacts = this.mergeForceFactsCallsByQueryType(
        this.buildPlannerForcedFactCalls(now, plan),
        resolvedForceFacts,
      );
      memoryFirstOrchestration = false;
    }

    return {
      forceFactsCalls: resolvedForceFacts.slice(0, 8),
      leadToolCalls,
      ceoCompanyKnowledgeMemoryOnly,
      memoryFirstOrchestration,
      suppressProfileFollowup: fromPolicy || forceSuppressQuickPath || input.summonProfileSuppress,
      roleSpeakerRequest:
        typeof policyRaw.roleSpeakerRequest === 'boolean'
          ? policyRaw.roleSpeakerRequest
          : fallback.roleSpeakerRequest,
      policySource: fallback.policySource,
      requestedRoles: fallback.requestedRoles,
    };
  }

  /** 与 consolidation 同源：进程开关 + API 公司级 rollout（用于编排层 keyword 策略门控）。 */
  private async resolveMemoryGraphV2EffectiveForOrchestration(companyId: string): Promise<boolean> {
    if (!this.config.isMemoryGraphV2Enabled()) return false;
    const cacheKey = companyId;
    const hit = this.memoryGraphV2EffectiveCache.get(cacheKey);
    if (hit && hit.exp > Date.now()) return hit.value;
    try {
      const r = await firstValueFrom(
        this.apiRpc
          .send<{ effective?: boolean }>('memory.rollout.memoryGraphV2Effective', {
            companyId,
            actor: this.workerActor(),
          })
          .pipe(timeout({ first: 900 })),
      );
      const value = r?.effective === true;
      this.memoryGraphV2EffectiveCache.set(cacheKey, { exp: Date.now() + 10_000, value });
      return value;
    } catch {
      this.memoryGraphV2EffectiveCache.set(cacheKey, { exp: Date.now() + 5_000, value: false });
      return false;
    }
  }

  private async getCeoGovernancePolicy(companyId: string): Promise<CeoGovernancePolicyV1 | null> {
    const cacheKey = `ceo-governance:${companyId}`;
    const hit = this.governancePolicyCache.get(cacheKey);
    if (hit && hit.exp > Date.now()) return hit.value;
    try {
      const row = await firstValueFrom(
        this.apiRpc
          .send<CeoGovernancePolicyV1>('companies.ceoGovernancePolicy.getConfig', {
            companyId,
            actor: this.workerActor(),
          })
          .pipe(timeout({ first: 1500 })),
      );
      const value = row && typeof row === 'object' ? row : null;
      this.governancePolicyCache.set(cacheKey, { exp: Date.now() + 15000, value });
      return value;
    } catch {
      this.governancePolicyCache.set(cacheKey, { exp: Date.now() + 5000, value: null });
      return null;
    }
  }

  /** IntentLayer 语义对齐：存在非 CEO 的 @ / mention 即视为公司级召唤面（弱 LLM 未出 targetAgentIds 时仍抑制画像追问）。 */
  private hasCompanyLevelMentionSummon(input: CollaborationPipelineV2RunInput): boolean {
    const mentioned = (input.mentionedAgentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);
    if (!mentioned.length) return false;
    const ceo = String(input.ceoAgentId ?? '').trim();
    return mentioned.some((id) => !ceo || id !== ceo);
  }

  private isRoleSpeakerRequest(userMessage: string): boolean {
    const text = String(userMessage ?? '').trim().toLowerCase();
    if (!text) return false;
    const roleKeywordHit =
      /(总监|主管|经理|负责人|ceo|cto|cfo|coo|销售|市场|运营|产品|技术|财务|法务|人事|hr|leader|director|manager)/i.test(
        text,
      );
    if (!roleKeywordHit) return false;
    const summonVerbHit =
      /(出来说|说个话|发言|讲讲|聊聊|回应|回复|出面|让.+说|请.+说|叫.+来|拉.+进|召唤)/i.test(text);
    return summonVerbHit;
  }

  private evaluateContextQuality(diagnostics: {
    transcriptCount: number;
    compressionTriggered: boolean;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    transcriptKeptTurns: number;
  }): { quality: 'good' | 'fair' | 'poor'; score: number; reasons: string[] } {
    let score = 100;
    const reasons: string[] = [];
    if (diagnostics.transcriptCount <= 0) {
      score -= 45;
      reasons.push('no_transcript');
    }
    if (diagnostics.transcriptKeptTurns <= 0) {
      score -= 30;
      reasons.push('no_kept_turns');
    }
    if (diagnostics.compressionTriggered && diagnostics.transcriptKeptTurns <= 1) {
      score -= 10;
      reasons.push('over_compressed');
    }
    score = Math.max(0, Math.min(100, score));
    if (score < 50) return { quality: 'poor', score, reasons };
    if (score < 80) return { quality: 'fair', score, reasons };
    return { quality: 'good', score, reasons };
  }

  private extractToolCalls(response: unknown): Array<{ id: string; name: string; args: Record<string, unknown> }> {
    const rec = response as { tool_calls?: unknown; toolCalls?: unknown } | null;
    const raw = Array.isArray(rec?.tool_calls) ? rec?.tool_calls : Array.isArray(rec?.toolCalls) ? rec?.toolCalls : [];
    return raw
      .map((item: any, idx: number) => {
        const id = String(item?.id ?? `tool_${idx + 1}`).trim();
        const name = String(item?.name ?? '').trim();
        if (!name) return null;
        const args = this.normalizeToolArgs(item?.args);
        return { id, name, args };
      })
      .filter(Boolean) as Array<{ id: string; name: string; args: Record<string, unknown> }>;
  }

  private normalizeToolArgs(args: unknown): Record<string, unknown> {
    if (!args) return {};
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    }
    return args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  }

  private async planToolCallsWhenModelSkipped(input: {
    model: any;
    transcript: any[];
    userMessage: string;
    intentType: string;
    intentReason?: string | null;
    tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  }): Promise<Array<{ id: string; name: string; args: Record<string, unknown> }>> {
    try {
      const plannerMessages = [
        new SystemMessage(
          [
            'You are a tool-planning assistant for CEO orchestration.',
            'Decide whether external evidence is needed for the latest user message.',
            'If needed, output up to 3 tool calls using ONLY available tool names and valid JSON args.',
            'Return JSON only: {"needTools": boolean, "toolCalls": [{"name": string, "args": object}], "reason": string}',
            'No markdown, no extra text.',
          ].join('\n'),
        ),
        ...input.transcript,
        new HumanMessage(
          JSON.stringify({
            userMessage: input.userMessage,
            intentType: input.intentType,
            intentReason: input.intentReason ?? null,
            availableTools: input.tools.map((t) => ({
              name: t.function.name,
              description: t.function.description,
              parameters: t.function.parameters,
            })),
          }),
        ),
      ];
      const plannedRaw = await (input.model as any).invoke(plannerMessages);
      const text = String((plannedRaw as { content?: unknown })?.content ?? '').trim();
      if (!text) return [];
      const normalized = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const payload = JSON.parse(normalized) as {
        needTools?: boolean;
        toolCalls?: Array<{ name?: string; args?: unknown }>;
      };
      if (!payload?.needTools || !Array.isArray(payload.toolCalls) || payload.toolCalls.length === 0) return [];
      const allowedNames = new Set(input.tools.map((t) => String(t.function.name ?? '').trim()).filter(Boolean));
      return payload.toolCalls
        .slice(0, 3)
        .map((c, idx) => {
          const name = String(c?.name ?? '').trim();
          if (!name || !allowedNames.has(name)) return null;
          return {
            id: `planned_${idx + 1}_${Date.now()}`,
            name,
            args: this.normalizeToolArgs(c?.args),
          };
        })
        .filter(Boolean) as Array<{ id: string; name: string; args: Record<string, unknown> }>;
    } catch {
      return [];
    }
  }

  private async buildConfiguredOrchestrationTools(params: {
    companyId: string;
    ceoAgentId: string;
  }): Promise<{
    tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
    injectedToolNames: string[];
    configuredSkillIds: string[];
  }> {
    const layerCfg = await this.ceoLayerConfigResolver.resolveLayerSetting(params.companyId, 'orchestration').catch(() => null);
    const configuredSkillIds = Array.isArray(layerCfg?.skillIds)
      ? layerCfg.skillIds.map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
      : [];
    if (!configuredSkillIds.length) return { tools: [], injectedToolNames: [], configuredSkillIds: [] };
    const built = await this.ceoLayerTools.build({
      companyId: params.companyId,
      ceoAgentId: params.ceoAgentId,
      layer: 'orchestration',
      configuredSkillIds,
      retainToolNames: CANONICAL_CEO_TOOL_NAMES,
      applyV2ToolSurface: true,
    });
    return {
      tools: built.tools as any[],
      injectedToolNames: built.injectedToolNames,
      configuredSkillIds: built.configuredSkillIds,
    };
  }

  private buildPlannerForcedFactCalls(
    now: number,
    plan?: import('../context/context-grounding-plan.js').ContextGroundingPlan | null,
  ): Array<{ id: string; name: string; args: Record<string, unknown> }> {
    const types = plan?.factsQueryTypes ?? [];
    const out: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
    for (let i = 0; i < types.length; i++) {
      const queryType = types[i]!;
      out.push({
        id: `policy_planner_${queryType}_${now}_${i + 1}`,
        name: 'facts.company.query',
        args: { queryType },
      });
    }
    if (!out.length && planIncludesBlock(plan, 'room_roster')) {
      out.push({
        id: `policy_planner_room_members_${now}`,
        name: 'facts.company.query',
        args: { queryType: 'room_members' },
      });
    }
    if (!out.length && planIncludesBlock(plan, 'company_people')) {
      out.push({
        id: `policy_planner_company_people_${now}`,
        name: 'facts.company.query',
        args: { queryType: 'company_people' },
      });
    }
    return out;
  }

  private mergeForceFactsCallsByQueryType(
    preferred: Array<{ id: string; name: string; args: Record<string, unknown> }>,
    rest: Array<{ id: string; name: string; args: Record<string, unknown> }>,
  ): Array<{ id: string; name: string; args: Record<string, unknown> }> {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
    for (const c of [...preferred, ...rest]) {
      const qt = String((c.args as { queryType?: string }).queryType ?? '').trim();
      if (!qt || seen.has(qt)) continue;
      seen.add(qt);
      out.push(c);
    }
    return out;
  }

  private stripFactsCompanyQueryCalls(
    calls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
  ): Array<{ id: string; name: string; args: Record<string, unknown> }> {
    return calls.filter((c) => String(c.name ?? '').trim() !== 'facts.company.query');
  }

  private async streamOrchestrationFinalReply(params: {
    model: LlmStreamModel;
    messages: Array<HumanMessage | SystemMessage | ToolMessage>;
    input: CollaborationPipelineV2RunInput;
    intentDecision: IntentDecision;
    timeoutMs: number;
    fallbackRaw?: unknown;
  }): Promise<string> {
    const ceoAgentId = String(params.input.ceoAgentId ?? '').trim();
    if (!ceoAgentId) {
      const raw = await Promise.race([
        params.model.invoke?.(params.messages),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`orchestration_reply_final_timeout_${params.timeoutMs + 250}ms`)),
            params.timeoutMs + 250,
          );
        }),
      ]).catch(() => params.fallbackRaw);
      return String((raw as { content?: unknown })?.content ?? '').trim();
    }

    const result = await this.tokenStreamService.streamToRoom({
      model: params.model,
      messages: params.messages,
      companyId: params.input.companyId,
      roomId: params.input.roomId,
      agentId: ceoAgentId,
      sourceMessageId: params.input.messageId,
      streamId: buildCeoOrchestrationStreamId(params.input.messageId, ceoAgentId),
      threadId: params.input.threadId ?? null,
      baseMetadata: {
        directReplyToMessageId: params.input.messageId,
        intentType: params.intentDecision.intentType,
      },
      streamSource: 'collab_ceo_orchestration_token_stream',
      timeoutMs: params.timeoutMs + 250,
    });

    if (result.text.trim()) return result.text.trim();

    const raw = await Promise.race([
      params.model.invoke?.(params.messages),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`orchestration_reply_final_timeout_${params.timeoutMs + 250}ms`)),
          params.timeoutMs + 250,
        );
      }),
    ]).catch(() => params.fallbackRaw);
    return String((raw as { content?: unknown })?.content ?? '').trim();
  }
}
