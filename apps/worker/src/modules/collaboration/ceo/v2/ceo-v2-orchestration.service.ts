import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { CoordinationRequest, CoordinationTaskSpec, DistributionPlan, PlanningResult, StrategicPhase } from '@contracts/types';
import {
  CeoV2ExecutionGraphError,
  compileCoordinationTaskSpec,
  distributionPlanToExecutionPlan,
  isNaturalConversationIntentType,
  migrateLegacyPlanningResultToStrategicPhases,
} from '@contracts/types';
import { CollaborationLlmBridgeService } from '../../collaboration-llm-bridge.service.js';
import { CeoLayerConfigResolverService } from '../resolver/ceo-layer-config-resolver.service.js';
import { ToolRegistry } from '@service/ai';
import { CeoLayerOpenAiToolsService } from '../ceo-layer-open-ai-tools.service.js';
import { AgentExecutionService } from '../../../agents/services/agent-execution.service.js';
import type { OpenAiFunctionTool } from '@service/ai';
import { ConfigService } from '../../../../common/config/config.service.js';
import { CollaborationAssignmentValidatorService } from '../../assignment/collaboration-assignment-validator.service.js';
import { CeoV2PlanningAssignablePoolService } from './ceo-v2-planning-assignable-pool.service.js';
import { OrchestrationDistributeError } from './ceo-v2-orchestration.errors.js';
import {
  ceoV2DistributionHintRowSchema,
  ceoV2DistributionHintsEnvelopeSchema,
  type CeoV2DistributionHintRow,
} from './ceo-v2-orchestration-hints.schema.js';
import {
  contractStructuredOutputInvokeOptions,
  planningStructuredOutputMethod,
} from './ceo-v2-planning-runtime.js';
import { classifyPhaseTaskTypes } from '@foundry/contracts/types/department-assignment';
import {
  pickDepartmentForPhaseWithCapabilities,
  readDepartmentCapabilitiesFromPlanningMetadata,
} from './department-assignment.util.js';
import { DEFAULT_FALLBACK_DEPARTMENT_SLUG } from './resolve-assignable-departments.js';

export interface CeoV2DistributeOptions {
  intentSlugs?: string[];
  companyId?: string;
  roomId?: string;
}

type LlmHintsBuildResult =
  | { status: 'skipped'; reason: string }
  | { status: 'ok'; hints: CeoV2DistributionHintRow[] }
  | { status: 'failed'; reason: string; detail?: Record<string, unknown> };

/**
 * CEO v2 **Orchestration** 层：把 Strategy 规划拆成可执行任务并下发（`distribute()` → `DistributionPlan`）。
 *
 * 责任：
 * - 将 L1 `strategicPhases`（协同交付检查点）**一阶段一条**部门任务，并保持 **阶段顺序 = 任务依赖链**（便于主群按依赖逐波派发）
 * - 在 `metadata.assignableDepartmentSlugs` 池内执行分配（规则优先，轻量 LLM 仅改部门/优先级，不改依赖与 taskId）
 * - 产出 DistributionPlan，并准备后续 Department Child Workflow 启动参数
 *
 * Phase 3.6：`distribute()` 不组装 CEO 面 NL 上下文、也不发起主群 lead `memory.search`。
 * 主群同 trace 的 lead 命中由 `MemoryCrossCutService.retrieveBeforeIntent`（进程内 + 可选 Redis）缓存；
 * Direct Agent fast handover 若回落到 CEO 编排 NL，Pipeline 在 `MemoryContextAssemblerService.assembleForOrchestration`
 * 传入 `collaborationExecutionContext`，复用 lead 命中，避免第二次检索。模型侧 `memory.search` 工具仍按工具策略执行。
 *
 * 未来若 Temporal 侧编排大规模启用且需跨 Activity 复用记忆，可考虑将 `CollaborationExecutionContext`
 * 作为规划/分发链路的标准可选入参（或序列化子集）随 `PlanningResult`/Activity 输入透传。
 */
@Injectable()
export class CeoV2OrchestrationService {
  private readonly logger = new Logger(CeoV2OrchestrationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly layerConfigResolver: CeoLayerConfigResolverService,
    private readonly registry: ToolRegistry,
    private readonly ceoLayerTools: CeoLayerOpenAiToolsService,
    private readonly agentExecution: AgentExecutionService,
    private readonly assignmentValidator: CollaborationAssignmentValidatorService,
    private readonly assignablePool: CeoV2PlanningAssignablePoolService,
  ) {}

  /**
   * 公司化执行：将协调请求编译为可下发的协调子任务说明（由 Temporal Root 执行派发）。
   */
  compileCoordinationTask(params: { request: CoordinationRequest; planId: string }): CoordinationTaskSpec {
    return compileCoordinationTaskSpec({
      request: params.request,
      distributionId: params.request.distributionId,
      planId: params.planId,
    });
  }

  private attachExecutionPlan(plan: DistributionPlan, isMainRoom: boolean): DistributionPlan {
    try {
      const executionPlan = distributionPlanToExecutionPlan(plan, {
        incomingGateForDependentTasks: isMainRoom ? 'supervisor_release' : 'dependency_only',
      });
      return { ...plan, executionPlan };
    } catch (error) {
      if (error instanceof CeoV2ExecutionGraphError) {
        throw new OrchestrationDistributeError('distribution_graph_invalid', error.message, {
          planId: plan.planId,
          distributionId: plan.distributionId,
        });
      }
      throw error;
    }
  }

  private readCeoAgentIdFromPlanning(planning: PlanningResult): string | null {
    const raw = (planning.metadata as any)?.ceoAgentId;
    const id = typeof raw === 'string' ? raw.trim() : '';
    return id || null;
  }

  private extractToolCalls(msg: any): Array<{ id: string; name: string; args: unknown }> {
    const raw = (msg && (msg.tool_calls ?? msg.toolCalls)) || (msg?.additional_kwargs?.tool_calls ?? []);
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((c: any) => {
        const id = String(c?.id ?? c?.tool_call_id ?? '').trim();
        const name = String(c?.name ?? c?.function?.name ?? '').trim();
        const args = c?.args ?? c?.function?.arguments ?? c?.arguments;
        return id && name ? { id, name, args } : null;
      })
      .filter(Boolean) as any;
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

  private async buildInjectedTools(params: {
    companyId: string;
    ceoAgentId: string;
    layer: 'orchestration';
    configuredSkillIds: string[];
  }): Promise<{ tools: OpenAiFunctionTool[]; injectedToolNames: string[]; dedupeDroppedCount: number }> {
    const built = await this.ceoLayerTools.build({
      companyId: params.companyId,
      ceoAgentId: params.ceoAgentId,
      layer: 'orchestration',
      configuredSkillIds: params.configuredSkillIds,
      applyV2ToolSurface: true,
    });
    return {
      tools: built.tools,
      injectedToolNames: built.injectedToolNames,
      dedupeDroppedCount: built.dedupeDroppedCount,
    };
  }

  /**
   * 生成 Orchestration 分发计划（`DistributionPlan`）。
   * 在分发前解析可指派部门池（HTTP / Temporal 共用）；显式失败抛 {@link OrchestrationDistributeError}。
   */
  async distribute(planning: PlanningResult, options?: CeoV2DistributeOptions): Promise<DistributionPlan> {
    const metaIn = (planning.metadata ?? {}) as Record<string, unknown>;
    const companyId = String(options?.companyId ?? metaIn.companyId ?? '').trim();
    const roomId = String(options?.roomId ?? metaIn.roomId ?? '').trim();
    const enriched = await this.assignablePool.enrichPlanning(planning, {
      companyId,
      roomId,
      intentSlugs: options?.intentSlugs ?? [],
      skipIfPresent: true,
    });

    try {
      return await this.distributeEnriched(enriched);
    } catch (error) {
      if (error instanceof OrchestrationDistributeError || error instanceof CeoV2ExecutionGraphError) {
        throw error;
      }
      this.logger.error('ceo_v2.distribute.unexpected_failed', error instanceof Error ? error.message : String(error), {
        planId: enriched.planId,
      });
      return this.buildUnexpectedFallbackDistributionPlan(enriched, error);
    }
  }

  private async distributeEnriched(planning: PlanningResult): Promise<DistributionPlan> {
    const companyId = String(planning.metadata?.companyId ?? '').trim();
    const roomId = String(planning.metadata?.roomId ?? '').trim();
    const layerCfg = companyId
      ? await this.layerConfigResolver.resolveLayerSetting(companyId, 'orchestration').catch(() => null)
      : null;
    const distributionRuleMode =
      layerCfg?.distributionRuleMode === 'rules_first' ||
      layerCfg?.distributionRuleMode === 'hybrid' ||
      layerCfg?.distributionRuleMode === 'llm_assisted'
        ? layerCfg.distributionRuleMode
        : 'hybrid';
    const envOrchTimeout = this.config.getCeoOrchestrationDistributeLlmTimeoutMs();
    const llmTimeoutMs =
      typeof envOrchTimeout === 'number'
        ? envOrchTimeout
        : typeof layerCfg?.timeoutMs === 'number'
          ? Math.max(5_000, Math.min(120_000, Math.floor(layerCfg.timeoutMs)))
          : 18_000;
    const distributeMaxTokens = this.config.getCeoOrchestrationDistributeMaxOutputTokens() ?? 700;
    const assignablePool = this.readAssignableDepartmentPool(planning);
    const assignablePoolSource = this.resolveAssignablePoolSource(planning);
    const ruleBasedTasks = this.buildRuleBasedTasks(planning, assignablePool);
    const assignmentMethod = (planning.metadata as { assignmentMethod?: string } | undefined)?.assignmentMethod;

    if (!ruleBasedTasks.length) {
      throw new OrchestrationDistributeError(
        'empty_strategic_phases',
        'ceo_v2_orchestration_empty_tasks: no strategicPhases to distribute',
        { planId: planning.planId },
      );
    }

    let llmHintsStatus: 'skipped' | 'ok' | 'failed' = 'skipped';
    let llmHintsFailureReason: string | undefined;
    let llmHintRows: CeoV2DistributionHintRow[] = [];

    if (distributionRuleMode === 'rules_first') {
      llmHintsStatus = 'skipped';
    } else {
      const llmOutcome = await this.buildLightLlmDistributionHints(
        planning,
        companyId,
        distributionRuleMode,
        llmTimeoutMs,
        distributeMaxTokens,
        assignablePool,
        ruleBasedTasks,
      );
      if (llmOutcome.status === 'ok') {
        llmHintsStatus = 'ok';
        llmHintRows = llmOutcome.hints;
      } else if (llmOutcome.status === 'failed') {
        llmHintsStatus = 'failed';
        llmHintsFailureReason = llmOutcome.reason;
        if (distributionRuleMode === 'llm_assisted') {
          const code: OrchestrationDistributeError['code'] = llmOutcome.reason.includes('tools')
            ? 'tools_enforce_failed'
            : llmOutcome.reason.includes('unconfigured') ||
                llmOutcome.reason.includes('no_company_id') ||
                llmOutcome.reason.includes('skipped_no_company')
              ? 'llm_assisted_unavailable'
              : 'llm_assisted_hints_invalid';
          throw new OrchestrationDistributeError(code, llmOutcome.reason, llmOutcome.detail);
        }
      } else {
        llmHintsStatus = 'skipped';
        llmHintsFailureReason = llmOutcome.reason;
      }
    }

    const allowedDeptSlugs = new Set(assignablePool);
    const departmentCapabilities = readDepartmentCapabilitiesFromPlanningMetadata(
      (planning.metadata ?? {}) as Record<string, unknown>,
    );
    const mergedTasks = this.mergeDistributionTasks(
      ruleBasedTasks,
      llmHintRows,
      allowedDeptSlugs,
      departmentCapabilities,
    );
    const orchestrationDegraded = distributionRuleMode === 'hybrid' && llmHintsStatus === 'failed';

    const planningIntentType = (planning.metadata as { intentType?: string } | undefined)?.intentType;
    const naturalConversationMode = isNaturalConversationIntentType(planningIntentType);

    const metaPlan = (planning.metadata ?? {}) as Record<string, unknown>;
    const planAnchor = String(planning.planAnchorMessageId ?? planning.traceId ?? '').trim();
    const turnMsg = typeof metaPlan.messageId === 'string' ? metaPlan.messageId.trim() : '';
    const routeRoot = typeof metaPlan.routingRootMessageId === 'string' ? metaPlan.routingRootMessageId.trim() : '';
    const runTok = typeof metaPlan.runId === 'string' ? metaPlan.runId.trim() : '';

    const roomType = String(metaPlan.roomType ?? '').trim();
    const isMainRoom = roomType === 'main' || roomType === '';
    const executionSemantics = isMainRoom ? ('sequential_waves' as const) : ('parallel_waves' as const);
    const maxConcurrent = isMainRoom ? 1 : Math.min(6, Math.max(1, mergedTasks.length));

    const plan: DistributionPlan = {
      schemaVersion: '1.0',
      distributionId: `dist-${planning.planId}`,
      planId: planning.planId,
      executionSemantics,
      tasks: mergedTasks,
      parallelism: { maxConcurrentDepartments: maxConcurrent },
      fallbackPolicy: { onTimeout: 'partial_merge', onDepartmentFailure: 'retry_then_degrade' },
      traceId: planAnchor,
      planAnchorMessageId: planAnchor,
      turnMessageId: turnMsg || undefined,
      routingRootMessageId: routeRoot || undefined,
      runId: runTok || undefined,
      ceoStructuredContract: '2026.pr4',
      metadata: {
        ...(planning.metadata ?? {}),
        orchestration: 'ceo.v2.l2',
        distributionRuleMode,
        llmHintsEnabled: distributionRuleMode !== 'rules_first',
        llmHintsStatus,
        llmHintsCount: llmHintRows.length,
        ...(llmHintsFailureReason ? { llmHintsFailureReason } : {}),
        ...(orchestrationDegraded
          ? { orchestrationDegraded: true, orchestrationDegradeReason: llmHintsFailureReason ?? 'llm_hints_failed' }
          : {}),
        enableMemoryRetrieval: layerCfg?.enableMemoryRetrieval ?? null,
        historyMessagesLimit: layerCfg?.historyMessagesLimit ?? null,
        timeoutMs: layerCfg?.timeoutMs ?? null,
        specialConfig: layerCfg?.specialConfig ?? null,
        roomId,
        childWorkflowPrepared: mergedTasks.length > 0,
        childWorkflowDrafts: mergedTasks.map((task) => ({
          workflowType: 'department-child',
          departmentId: task.department,
          taskId: task.taskId,
        })),
        ...(naturalConversationMode ? { naturalConversationMode: true } : {}),
        ...(assignmentMethod ? { assignmentMethod } : {}),
      },
    };

    this.logger.log('ceo_v2.distribute.success', {
      planId: planning.planId,
      distributionId: plan.distributionId,
      tasks: plan.tasks.length,
      assignable_slugs_count: assignablePool.length,
      assignable_pool_source: assignablePoolSource,
      distributionRuleMode,
      llmHintsStatus,
      orchestrationDegraded: Boolean(orchestrationDegraded),
      assignment_method: assignmentMethod ?? 'unknown',
    });
    return this.attachExecutionPlan(plan, isMainRoom);
  }

  private buildUnexpectedFallbackDistributionPlan(planning: PlanningResult, error: unknown): DistributionPlan {
    const fbIntentType = (planning.metadata as { intentType?: string } | undefined)?.intentType;
    const fbNaturalConversation = isNaturalConversationIntentType(fbIntentType);
    const metaFb = (planning.metadata ?? {}) as Record<string, unknown>;
    const planAnchorFb = String(planning.planAnchorMessageId ?? planning.traceId ?? '').trim();
    const turnFb = typeof metaFb.messageId === 'string' ? metaFb.messageId.trim() : '';
    const routeFb = typeof metaFb.routingRootMessageId === 'string' ? metaFb.routingRootMessageId.trim() : '';
    const runFb = typeof metaFb.runId === 'string' ? metaFb.runId.trim() : '';
    const roomTypeFb = String(metaFb.roomType ?? '').trim();
    const fbTasks = this.buildRuleBasedTasks(planning, this.readAssignableDepartmentPool(planning));
    const fbMain = roomTypeFb === 'main' || roomTypeFb === '';
    const fbPlan: DistributionPlan = {
      schemaVersion: '1.0',
      distributionId: `dist-${planning.planId}`,
      planId: planning.planId,
      executionSemantics: fbMain ? ('sequential_waves' as const) : ('parallel_waves' as const),
      tasks: fbTasks,
      parallelism: { maxConcurrentDepartments: fbMain ? 1 : Math.min(6, Math.max(1, fbTasks.length || 1)) },
      fallbackPolicy: { onTimeout: 'partial_merge', onDepartmentFailure: 'retry_then_degrade' },
      traceId: planAnchorFb,
      planAnchorMessageId: planAnchorFb,
      turnMessageId: turnFb || undefined,
      routingRootMessageId: routeFb || undefined,
      runId: runFb || undefined,
      ceoStructuredContract: '2026.pr4',
      metadata: {
        ...(planning.metadata ?? {}),
        orchestration: 'ceo.v2.l2.fallback',
        orchestrationDegraded: true,
        orchestrationDegradeReason: error instanceof Error ? error.message : String(error),
        childWorkflowPrepared: fbTasks.length > 0,
        ...(fbNaturalConversation ? { naturalConversationMode: true } : {}),
      },
    };
    try {
      return this.attachExecutionPlan(fbPlan, fbMain);
    } catch (graphError) {
      if (graphError instanceof CeoV2ExecutionGraphError) {
        throw new OrchestrationDistributeError('distribution_graph_invalid', graphError.message, {
          planId: planning.planId,
        });
      }
      throw graphError;
    }
  }

  /** 仅使用 `metadata.assignableDepartmentSlugs`（Pipeline 在 distribute 前写入）；缺失时退回默认占位池。 */
  private readAssignableDepartmentPool(planning: PlanningResult): string[] {
    const meta = planning.metadata as { assignableDepartmentSlugs?: unknown } | undefined;
    const fromMeta = Array.isArray(meta?.assignableDepartmentSlugs)
      ? (meta.assignableDepartmentSlugs as unknown[]).map((s) => String(s ?? '').trim()).filter(Boolean)
      : [];
    if (fromMeta.length > 0) return fromMeta;
    return [DEFAULT_FALLBACK_DEPARTMENT_SLUG];
  }

  private resolveAssignablePoolSource(planning: PlanningResult): 'metadata' | 'fallback_default' {
    const meta = planning.metadata as { assignableDepartmentSlugs?: unknown } | undefined;
    return Array.isArray(meta?.assignableDepartmentSlugs) && (meta!.assignableDepartmentSlugs as unknown[]).length > 0
      ? 'metadata'
      : 'fallback_default';
  }

  /**
   * 按 KR 交付物文案将任务映射到候选部门 slug（避免纯轮询把「HTML/技术可行性」摊给董事会或销售）。
   */
  private pickDepartmentForDeliverable(name: string, target: string, candidates: string[]): string {
    if (!candidates.length) return DEFAULT_FALLBACK_DEPARTMENT_SLUG;
    const text = `${name}\n${target}`;
    const lower = text.toLowerCase();
    const slugLower = (slug: string) => slug.toLowerCase();

    const isTechnical =
      /html|css|代码|前端|响应式|浏览器|工程化|开发|实现|技术可行性|纯html|website|landing|交付代码|web\s*page/i.test(text) ||
      /technical\s*feasibility|frontend|implementation/i.test(lower);
    const isBrandCopy =
      /品牌|文案|定位|价值主张|cta|视觉|传播|内容对齐|传达|homepage.*介绍|核心价值/i.test(text) ||
      /brand|copywriting|positioning|value\s*proposition/i.test(lower);
    /** 流量、线索、市场认知类 KR（应收营销/销售/增长，不应落到财务部） */
    const isGrowthOrMarketingMetric =
      /访问量|月活|UV|PV|自然流量|搜索引擎|线索|SQL|MQL|获客|潜客|市场认知|品牌曝光|投放效果|转化|增长指标/i.test(text) ||
      /traffic|organic|monthly\s+visitors|search\s+engine|lead\s*generation/i.test(lower);
    /** 真正的财务职能交付（预算、审计、税务等） */
    const isFinanceDomain =
      /预算编制|财报|审计|税务|发票|成本核算|现金流|固定资产|薪酬核算|费用报销|财务合规/i.test(text) ||
      /\baudit\b|tax\s+return|P&L|balance\s+sheet/i.test(lower);

    const scoreSlug = (slug: string): number => {
      const s = slugLower(slug);
      let score = 0;
      if (isTechnical) {
        if (/技术|研发|工程|开发|dev|tech|it|r&d|产研|软件/.test(s)) score += 12;
        if (/产品|交付/.test(s)) score += 6;
        if (/运营|operations|\bops\b/.test(s)) score += 4;
        if (/ceo|总办|办公室|综合管理/.test(s)) score += 1;
        if (/board|董事|战略/.test(s)) score -= 4;
        if (/销售|sales|商务|\bbd\b/.test(s)) score -= 12;
      }
      if (isBrandCopy) {
        if (/市场|品牌|营销|增长|公关|内容/.test(s)) score += 10;
        if (/ceo|总办|办公室/.test(s)) score += 5;
        if (/board|董事/.test(s)) score += 3;
        if (/销售|sales/.test(s)) score += 1;
      }
      if (isGrowthOrMarketingMetric && !isFinanceDomain) {
        if (/市场|品牌|营销|增长|公关|内容|获客|商务/.test(s)) score += 14;
        if (/销售|sales|\bbd\b/.test(s)) score += 10;
        if (/运营|operations|\bops\b/.test(s)) score += 5;
        if (/产品|交付/.test(s)) score += 3;
        if (/财务|finance|会计|出纳/.test(s)) score -= 20;
        /** 纯流量/线索指标不应默认落到研发部（除非 KR 同时含技术交付词） */
        if (!isTechnical && (/研发|产研|技术|工程|dev|tech|r&d|软件/i.test(s) || /产品/i.test(s))) {
          score -= 10;
        }
      }
      if (isFinanceDomain) {
        if (/财务|finance|会计|出纳/.test(s)) score += 14;
        if (/市场|营销|销售/.test(s)) score -= 6;
      }
      if ((/首页|homepage|landing|页面|网站/i.test(text) || /website|site/i.test(lower)) && /html|css|代码|响应式/.test(text)) {
        if (/技术|研发|工程|dev|tech|it|产研/.test(s)) score += 8;
        if (/销售|sales/.test(s)) score -= 10;
      }
      return score;
    };

    let pool = [...candidates];
    if (isTechnical) {
      const nonSales = pool.filter((c) => !/销售|sales|商务|\bbd\b/i.test(slugLower(c)));
      if (nonSales.length) pool = nonSales;
    }
    if (isGrowthOrMarketingMetric && !isFinanceDomain) {
      const nonFinance = pool.filter((c) => !/财务|finance|会计|出纳/i.test(slugLower(c)));
      if (nonFinance.length) pool = nonFinance;
    }
    const isSocialOrMarketingOps =
      /小红书|推文|笔记|新媒体|社媒|互动|评论区|种草|kol|达人|投放素材|短视频|直播带货|公众号/i.test(text) ||
      /xiaohongshu|red\s*book|social\s*media|ugc|influencer|community\s*management/i.test(lower);
    const isHrDomainDeliverable =
      /招聘|入职|离职|薪酬结构|绩效面谈|劳动合同|考勤|编制|培训体系|组织发展/i.test(text) ||
      /\bonboarding\b|offboarding|payroll|performance\s*review/i.test(lower);
    if (isSocialOrMarketingOps && !isHrDomainDeliverable) {
      const nonHr = pool.filter((c) => !/人力|人事|hr|human\s*resource|人力资源/i.test(slugLower(c)));
      if (nonHr.length) pool = nonHr;
    }

    let best = pool[0]!;
    let bestScore = scoreSlug(best);
    for (const c of pool.slice(1)) {
      const sc = scoreSlug(c);
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      } else if (sc === bestScore) {
        /** 禁止仅靠拼音/Unicode 序把财务部顶上来（见 slugFallbackRank） */
        if (this.slugTieBreakCompare(c, best, text) < 0) {
          best = c;
        }
      }
    }
    if (bestScore > 0) return best;

    if (isTechnical) {
      const ceoLike = pool.find((c) => /ceo|总办|办公室|operations|运营/i.test(slugLower(c)));
      if (ceoLike) return ceoLike;
    }

    const byFallback = [...pool].sort((a, b) => this.slugTieBreakCompare(a, b, text));
    return byFallback[0]!;
  }

  /**
   * 得分相同或全为 0 时的兜底顺位：增长/流量类任务财务部殿后；技术类优先研发。
   * 避免 `localeCompare` 在中文环境下把「财务部」排到首位。
   */
  private slugFallbackRank(slug: string, deliverableText: string): number {
    const s = slug.toLowerCase();
    const lower = deliverableText.toLowerCase();
    const isTechnical =
      /html|css|代码|前端|响应式|浏览器|工程化|开发|实现|技术可行性|纯html|website|landing|交付代码|web\s*page/i.test(deliverableText) ||
      /technical\s*feasibility|frontend|implementation/i.test(lower);
    const isGrowthOrMarketingMetric =
      /访问量|月活|UV|PV|自然流量|搜索引擎|线索|SQL|MQL|获客|潜客|市场认知|品牌曝光|投放效果|转化|增长指标/i.test(deliverableText) ||
      /traffic|organic|monthly\s*visitors|search\s*engine|lead\s*generation/i.test(lower);
    const isFinanceDomain =
      /预算编制|财报|审计|税务|发票|成本核算|现金流|固定资产|薪酬核算|费用报销|财务合规/i.test(deliverableText) ||
      /\baudit\b|tax\s*return|P&L|balance\s*sheet/i.test(lower);

    if (/财务|finance|会计|出纳/.test(s)) {
      if (isGrowthOrMarketingMetric && !isFinanceDomain) return 900;
      /** 非财务职能的 KR 不要把财务部当默认平局选项 */
      return 450;
    }
    const isSocialOrMarketingOps =
      /小红书|推文|笔记|新媒体|社媒|互动|评论区|种草|kol|达人|投放素材|短视频|直播带货|公众号/i.test(deliverableText) ||
      /xiaohongshu|red\s*book|social\s*media|ugc|influencer|community\s*management/i.test(lower);
    const isHrDomainDeliverable =
      /招聘|入职|离职|薪酬结构|绩效面谈|劳动合同|考勤|编制|培训体系|组织发展/i.test(deliverableText) ||
      /\bonboarding\b|offboarding|payroll|performance\s*review/i.test(lower);
    if (/人力|人事|hr|human\s*resource|人力资源/i.test(s)) {
      if (isSocialOrMarketingOps && !isHrDomainDeliverable) return 880;
      return 460;
    }
    if (isGrowthOrMarketingMetric && !isFinanceDomain) {
      if (/市场|品牌|营销|增长|公关|内容|获客/.test(s)) return 1;
      if (/销售|sales|商务|\bbd\b/.test(s)) return 3;
      if (/运营|operations|\bops\b/.test(s)) return 8;
      if (/研发|产研|技术|工程|dev|tech|r&d|软件/.test(s)) return 40;
      if (/产品/.test(s)) return 35;
    }
    if (isTechnical) {
      if (/技术|研发|工程|开发|dev|tech|it|r&d|产研|软件/.test(s)) return 5;
      if (/产品|交付/.test(s)) return 15;
    }
    return 200;
  }

  private slugTieBreakCompare(a: string, b: string, deliverableText: string): number {
    const ra = this.slugFallbackRank(a, deliverableText);
    const rb = this.slugFallbackRank(b, deliverableText);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, 'zh-Hans');
  }

  private readStrategicPhases(planning: PlanningResult): StrategicPhase[] {
    const direct = planning.strategicPhases;
    if (Array.isArray(direct) && direct.length) return direct;
    const migrated = migrateLegacyPlanningResultToStrategicPhases(planning as unknown as Record<string, unknown>);
    return migrated ?? [];
  }

  private assignmentValidationText(task: DistributionPlan['tasks'][number]): string {
    const title = String(task.phaseTitle ?? '').trim();
    const outcome = String(task.phaseOutcome ?? '').trim();
    if (title || outcome) return `${title}\n${outcome}`.trim();
    return String(task.deliverable ?? '').trim();
  }

  private buildRuleBasedTasks(planning: PlanningResult, assignablePool: string[]): DistributionPlan['tasks'] {
    const departments = assignablePool.length ? assignablePool : [DEFAULT_FALLBACK_DEPARTMENT_SLUG];
    const sortedCandidates = [...departments].sort((a, b) => String(a).localeCompare(String(b)));
    const capabilities = readDepartmentCapabilitiesFromPlanningMetadata(
      (planning.metadata ?? {}) as Record<string, unknown>,
    );
    const capCandidates = capabilities.filter((c) => sortedCandidates.includes(c.slug));
    let assignmentMethod: 'capability_tags' | 'slug_heuristic_fallback' = 'slug_heuristic_fallback';
    const phases = this.readStrategicPhases(planning);
    if (!phases.length) return [];
    const phaseCount = phases.length;
    let lastTaskId: string | null = null;
    const tasks = phases.map((ph, idx) => {
      const picked = pickDepartmentForPhaseWithCapabilities({
        title: ph.title,
        outcome: ph.outcome,
        candidates: capCandidates,
        fallbackPick: (t, o, slugs) => this.pickDepartmentForDeliverable(t, o, slugs),
      });
      if (picked.method === 'capability_tags') assignmentMethod = 'capability_tags';
      const department = picked.department;
      const taskId = `${planning.planId}-task-${idx + 1}`;
      const deps = lastTaskId ? [lastTaskId] : [];
      lastTaskId = taskId;
      const rich = this.buildDirectorFacingDeliverableFromPhase({
        planning,
        phase: ph,
        phaseIndex: idx,
        phaseCount,
        department,
      });
      return {
        taskId,
        department,
        ownerAgent: `director_${department}`,
        priority: this.resolvePriority(ph),
        dependencies: deps,
        slaSeconds: 900,
        ...rich,
        strategicPhaseId: ph.phaseId,
        phaseStepIndex: 0,
      };
    });
    if (planning.metadata && typeof planning.metadata === 'object') {
      (planning.metadata as Record<string, unknown>).assignmentMethod = assignmentMethod;
    }
    return tasks;
  }

  private resolvePriority(phase: StrategicPhase): 'P0' | 'P1' | 'P2' {
    const deadlineRaw = String(phase.deadline ?? '').trim();
    if (!deadlineRaw) return 'P1';
    const deadlineMs = Date.parse(deadlineRaw);
    if (Number.isNaN(deadlineMs)) return 'P1';
    const days = (deadlineMs - Date.now()) / 86_400_000;
    if (days <= 7) return 'P0';
    if (days <= 30) return 'P1';
    return 'P2';
  }

  private async buildLightLlmDistributionHints(
    planning: PlanningResult,
    companyId: string,
    distributionRuleMode: 'hybrid' | 'llm_assisted',
    llmTimeoutMs: number,
    maxOutputTokens: number,
    assignableDepartmentSlugs: string[],
    ruleBasedTasks: DistributionPlan['tasks'],
  ): Promise<LlmHintsBuildResult> {
    if (!companyId) {
      return {
        status: 'failed',
        reason: 'ceo_v2_orchestration_llm_skipped_no_company_id',
        detail: { distributionRuleMode, no_company_id: true },
      };
    }

    const ceoAgentId = this.readCeoAgentIdFromPlanning(planning);
    const layerCfg = await this.layerConfigResolver.resolveLayerSetting(companyId, 'orchestration').catch(() => null);
    const configuredSkillIds = Array.isArray(layerCfg?.skillIds) ? layerCfg!.skillIds : [];
    const { tools, injectedToolNames, dedupeDroppedCount } =
      ceoAgentId && configuredSkillIds.length
        ? await this.buildInjectedTools({
            companyId,
            ceoAgentId,
            layer: 'orchestration',
            configuredSkillIds,
          })
        : { tools: [], injectedToolNames: [], dedupeDroppedCount: 0 };

    const orchestrationModel = String(layerCfg?.modelName ?? '').trim();
    if (!orchestrationModel) {
      return {
        status: 'failed',
        reason: 'ceo_v2_orchestration_admin_orchestration_model_unconfigured',
        detail: { distributionRuleMode },
      };
    }

    const resolved = await this.llmBridge.createChatModelResolved({
      companyId,
      fallbackModelName: orchestrationModel,
      llmTimeoutMs,
      maxOutputTokens,
      ceoContext: 'orchestration',
      trace: { messageId: planning.planId, callsite: 'ceo.v2.orchestration' },
      meteringAgentId: ceoAgentId ?? undefined,
    });

    const modelWithTools =
      tools.length && typeof (resolved.model as any)?.bind === 'function'
        ? (resolved.model as any).bind({ tools, tool_choice: 'auto' })
        : resolved.model;

    const taskLines = ruleBasedTasks.map((t) => ({
      sourceTaskId: t.taskId,
      phaseTitle: t.phaseTitle ?? '',
      phaseOutcome: t.phaseOutcome ?? '',
      strategicPhaseId: t.strategicPhaseId,
    }));

    const messages: any[] = [
      new SystemMessage(
        [
          'You are a lightweight Orchestration department router (not rewriting the plan).',
          'Output JSON with key "hints": an array of objects { sourceTaskId, department, priority? }.',
          'For EVERY task in the payload, output exactly one hint row with matching sourceTaskId.',
          'department MUST be exactly one value from allowedDepartmentSlugs.',
          'Route by phaseTitle+phaseOutcome; do not invent new scope.',
        ].join(' '),
      ),
      new HumanMessage(
        JSON.stringify({
          goal: planning.goal,
          tasks: taskLines,
          allowedDepartmentSlugs: assignableDepartmentSlugs,
          departmentCapabilities: readDepartmentCapabilitiesFromPlanningMetadata(
            (planning.metadata ?? {}) as Record<string, unknown>,
          ).map((c) => ({
            slug: c.slug,
            name: c.name,
            responsibilitySummary: c.responsibilitySummary,
            taskTypeTags: c.taskTypeTags,
          })),
        }),
      ),
    ];

    const calledToolNames: string[] = [];
    let response: any | null = null;
    for (let round = 0; round < 3; round++) {
      response = await modelWithTools.invoke(messages);
      const toolCalls = this.extractToolCalls(response);
      if (!toolCalls.length) break;
      if (!ceoAgentId) break;
      for (const call of toolCalls.slice(0, 5)) {
        calledToolNames.push(call.name);
        const args = this.normalizeToolArgs(call.args);
        try {
          const exec = await this.agentExecution.executeSkill({
            companyId,
            agentId: ceoAgentId,
            projectId: undefined,
            skillName: call.name,
            args,
            traceId: planning.planId,
            roles: ['admin'],
            layer: 'orchestration',
            capabilitySkillIds: configuredSkillIds,
          } as any);
          const content = typeof exec?.result === 'string' ? exec.result : JSON.stringify(exec?.result ?? null);
          messages.push(new ToolMessage({ tool_call_id: call.id, content }));
        } catch (e: unknown) {
          messages.push(
            new ToolMessage({
              tool_call_id: call.id,
              content: JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            }),
          );
        }
      }
    }

    this.logger.log('ceo_v2.distribute.skills.tools', {
      companyId,
      planId: planning.planId,
      ceoAgentId: ceoAgentId ?? null,
      distributionRuleMode,
      configuredSkillIdsCount: configuredSkillIds.length,
      injectedToolCount: injectedToolNames.length,
      openAiToolDedupeDropped: dedupeDroppedCount,
      injectedToolNames: injectedToolNames.slice(0, 50),
      calledToolCount: calledToolNames.length,
      calledToolNames: calledToolNames.slice(0, 50),
    });

    const enforce = this.config.getCollabDistributeToolsEnforceMode();
    if (enforce !== 'off' && injectedToolNames.length > 0 && calledToolNames.length === 0) {
      const payload = {
        companyId,
        planId: planning.planId,
        injectedToolCount: injectedToolNames.length,
        resolution: enforce,
      };
      if (enforce === 'warn') {
        this.logger.warn('ceo_v2.distribute.skills.tools_unused', payload);
      } else {
        return {
          status: 'failed',
          reason: 'ceo_v2_distribute_tools_required_but_uncalled',
          detail: payload,
        };
      }
    }

    const hints = await this.invokeStructuredDistributionHints(modelWithTools, messages, orchestrationModel);
    if (!hints) {
      return {
        status: 'failed',
        reason: 'ceo_v2_orchestration_llm_hints_parse_failed',
        detail: { distributionRuleMode, modelName: orchestrationModel },
      };
    }

    const expectedIds = new Set(ruleBasedTasks.map((t) => t.taskId));
    const filtered = hints.filter((h) => expectedIds.has(h.sourceTaskId));
    if (distributionRuleMode === 'llm_assisted' && filtered.length !== expectedIds.size) {
      return {
        status: 'failed',
        reason: 'ceo_v2_orchestration_llm_hints_incomplete',
        detail: { expected: expectedIds.size, got: filtered.length },
      };
    }

    return { status: 'ok', hints: filtered };
  }

  private async invokeStructuredDistributionHints(
    model: unknown,
    messages: unknown[],
    modelName: string,
  ): Promise<CeoV2DistributionHintRow[] | null> {
    const method = planningStructuredOutputMethod(modelName);
    const opts = contractStructuredOutputInvokeOptions(method);
    const structuredOpts = { ...opts, name: 'ceo_v2_distribution_hints' };

    if (model && typeof (model as any).withStructuredOutput === 'function') {
      try {
        const structured = (model as any).withStructuredOutput(ceoV2DistributionHintsEnvelopeSchema, structuredOpts);
        const out = await structured.invoke(messages);
        const parsed = ceoV2DistributionHintsEnvelopeSchema.safeParse(out);
        if (parsed.success) return parsed.data.hints;
      } catch (error) {
        this.logger.warn('ceo_v2.distribute.structured_invoke_failed', {
          modelName,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const plain = model && typeof (model as any).invoke === 'function' ? await (model as any).invoke(messages) : null;
    const raw =
      plain && typeof plain.content === 'string'
        ? plain.content
        : plain && Array.isArray(plain.content)
          ? plain.content.map((x: any) => (typeof x === 'string' ? x : JSON.stringify(x))).join('')
          : String(plain?.content ?? '');
    const parsed = this.parseJsonSafe(raw);
    const envelope = ceoV2DistributionHintsEnvelopeSchema.safeParse(parsed);
    if (envelope.success) return envelope.data.hints;
    if (Array.isArray(parsed)) {
      const rows = parsed
        .filter((x) => x && typeof x === 'object')
        .map((x) => ceoV2DistributionHintRowSchema.safeParse(x))
        .filter((r) => r.success)
        .map((r) => r.data);
      return rows.length ? rows : null;
    }
    return null;
  }

  private mergeDistributionTasks(
    ruleItems: DistributionPlan['tasks'],
    hints: CeoV2DistributionHintRow[],
    allowedDepartments: Set<string>,
    capabilities: ReturnType<typeof readDepartmentCapabilitiesFromPlanningMetadata>,
  ): DistributionPlan['tasks'] {
    if (!hints.length) return ruleItems;
    const byStep = new Map<string, { department?: string; priority?: 'P0' | 'P1' | 'P2' }>();
    for (const hint of hints) {
      const key = String(hint.sourceTaskId ?? '').trim();
      if (!key) continue;
      byStep.set(key, hint);
    }
    return ruleItems.map((item) => {
      const hint = byStep.get(`${item.taskId}`);
      if (!hint) return item;
      const dept = String(hint.department ?? '').trim();
      if (!dept || !allowedDepartments.has(dept)) return item;
      const validationText = this.assignmentValidationText(item);
      const phaseTaskTypes = validationText
        ? classifyPhaseTaskTypes(
            String(item.phaseTitle ?? ''),
            String(item.phaseOutcome ?? ''),
            validationText,
          )
        : [];
      if (
        !this.assignmentValidator.isAssignable(validationText, dept, {
          phaseTaskTypes,
          capabilities,
        })
      ) {
        return item;
      }
      const reassigned = {
        ...item,
        department: dept,
        ownerAgent: `director_${dept}`,
        priority: hint.priority ?? item.priority,
      };
      // 同步更新交付说明中的「指派部门」行，避免 LLM 改派后文案仍写旧 slug
      if (item.phaseTitle != null || item.phaseOutcome != null) {
        const lines = String(reassigned.deliverable ?? '').split('\n');
        const idx = lines.findIndex((l) => l.startsWith('【指派部门】'));
        if (idx >= 0) {
          lines[idx] = `【指派部门】${dept}（执行承接：部门主管，系统标识 ownerAgent = director_${dept}）`;
          reassigned.deliverable = lines.join('\n');
        }
      }
      return reassigned;
    });
  }

  private buildDirectorFacingDeliverableFromPhase(params: {
    planning: PlanningResult;
    phase: StrategicPhase;
    phaseIndex: number;
    phaseCount: number;
    department: string;
  }): Pick<
    DistributionPlan['tasks'][number],
    'deliverable' | 'phaseTitle' | 'phaseOutcome' | 'phaseDeadline' | 'phaseOrdinal' | 'phaseCount' | 'strategicGoalSummary'
  > {
    const goalFull = String(params.planning.goal ?? '').trim();
    const strategicGoalSummary = goalFull.length > 360 ? `${goalFull.slice(0, 360)}\u2026` : goalFull;
    const title = String(params.phase.title ?? '').trim();
    const outcome = String(params.phase.outcome ?? '').trim();
    const deadline = String(params.phase.deadline ?? '').trim();
    const pid = String(params.phase.phaseId ?? '').trim() || `p${params.phaseIndex + 1}`;
    const ord = params.phaseIndex + 1;
    const n = params.phaseCount;
    const dept = params.department;
    const goalBlock = goalFull.length > 720 ? `${goalFull.slice(0, 720)}\u2026` : goalFull;

    const deliverable = [
      `\u3010\u534f\u540c\u603b\u76ee\u6807\u3011${goalBlock}`,
      `\u3010\u4ea4\u4ed8\u68c0\u67e5\u70b9\u3011\u7b2c ${ord}/${n} \u6b65\uff08${pid}\uff09`,
      `\u3010\u68c0\u67e5\u70b9\u540d\u79f0\u3011${title}`,
      `\u3010\u672c\u6b65\u622a\u6b62\u65f6\u95f4\u3011${deadline}`,
      `\u3010\u672c\u6b65\u4ea4\u4ed8\u4e0e\u9a8c\u6536\u3011${outcome}`,
      `\u3010\u6307\u6d3e\u90e8\u95e8\u3011${dept}\uff08\u6267\u884c\u627f\u63a5\uff1a\u90e8\u95e8\u4e3b\u7ba1\uff0c\u7cfb\u7edf\u6807\u8bc6 ownerAgent = director_${dept}\uff09`,
      `\u3010\u4e3b\u7ba1\u5de5\u4f5c\u8bf4\u660e\u3011`,
      `1\uff09\u4ee5\u300c\u672c\u6b65\u4ea4\u4ed8\u4e0e\u9a8c\u6536\u300d\u4e3a\u552f\u4e00\u9a8c\u6536\u4f9d\u636e\uff0c\u5728\u622a\u6b62\u65f6\u95f4\u524d\u5b8c\u6210\u53ef\u9a8c\u8bc1\u6210\u679c\uff1b`,
      `2\uff09\u82e5\u4f9d\u8d56\u4e0a\u4e00\u68c0\u67e5\u70b9\u7684\u90e8\u95e8\u5b50\u4efb\u52a1\uff0c\u8bf7\u5728\u4e3b\u7fa4\u786e\u8ba4\u4e0a\u6e38\u5df2\u95ed\u73af\u540e\u518d\u542f\u52a8\u672c\u6b65\uff1b`,
      `3\uff09\u9700\u8981\u8de8\u90e8\u95e8\u534f\u4f5c\u65f6\uff0c\u5728\u4e3b\u534f\u4f5c\u7ebf\u7a0b\u5199\u660e\u4f9d\u8d56\u65b9\u3001\u4ea4\u4ed8\u63a5\u53e3\u4e0e\u65f6\u95f4\uff1b`,
      `4\uff09\u8303\u56f4\u3001\u98ce\u9669\u6216\u6392\u671f\u53d8\u5316\u65f6\uff0c\u540c\u6b65\u5e72\u7cfb\u4eba\u5e76\u5728\u4e3b\u7fa4\u7559\u4e0b\u51b3\u7b56\u8bb0\u5f55\u3002`,
    ].join('\n');

    return { deliverable, phaseTitle: title, phaseOutcome: outcome, phaseDeadline: deadline, phaseOrdinal: ord, phaseCount: n, strategicGoalSummary };
  }

  private parseJsonSafe(raw: string): unknown {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const first = text.indexOf('[');
    const last = text.lastIndexOf(']');
    const candidate = first >= 0 && last > first ? text.slice(first, last + 1) : text;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}
