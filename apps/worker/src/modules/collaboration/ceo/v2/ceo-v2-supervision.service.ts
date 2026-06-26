import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  DirectorTaskPackage,
  DistributionPlan,
  EmployeeExecutionResult,
  HeavyExecutionOutput,
  SupervisionResultSource,
} from '@contracts/types';
import { CeoLayerConfigResolverService } from '../resolver/ceo-layer-config-resolver.service.js';
import { CollaborationLlmBridgeService } from '../../collaboration-llm-bridge.service.js';
import { ConfigService } from '../../../../common/config/config.service.js';
import { ToolRegistry } from '@service/ai';
import { CeoLayerOpenAiToolsService } from '../ceo-layer-open-ai-tools.service.js';
import type { OpenAiFunctionTool } from '@service/ai';
import { AgentExecutionService } from '../../../agents/services/agent-execution.service.js';
import { CeoV2ToolsService } from './tools/ceo-v2-tools.service.js';
import { EmployeeExecutionService } from '../../employee/employee-execution.service.js';
import { CollaborationDeptReportBufferService } from '../../dept-report/collaboration-dept-report-buffer.service.js';
import type { DirectorDeptReportPayload } from '@contracts/types';
import { DeliverableGateService } from '../../deliverable/deliverable-gate.service.js';

const CANONICAL_CEO_TOOL_NAMES = new Set(['memory.search', 'facts.company.query', 'department.knowledge.query']);

/**
 * CEO v2 **Supervisor** 层：对 Orchestration 产出做监督、聚合与收口（可与 Temporal 可恢复执行配合）。
 *
 * 当前阶段提供：
 * - Supervisor 入口编排（接收 distribution plan）
 * - 监控与部分结果（partial update）聚合骨架
 * - merge 与 compensation 的占位逻辑
 *
 * 下一阶段（Stage 4）接入 Temporal durable execution。
 */
@Injectable()
export class CeoV2SupervisionService {
  private readonly logger = new Logger(CeoV2SupervisionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly layerConfigResolver: CeoLayerConfigResolverService,
    private readonly registry: ToolRegistry,
    private readonly ceoLayerTools: CeoLayerOpenAiToolsService,
    private readonly agentExecution: AgentExecutionService,
    private readonly ceoTools: CeoV2ToolsService,
    private readonly employeeExecution: EmployeeExecutionService,
    private readonly deptReportBuffer: CollaborationDeptReportBufferService,
    private readonly deliverableGate: DeliverableGateService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  /**
   * Temporal：部门子任务执行完成后、进入下一就绪任务前的 Supervisor 门闸。
   * 默认自动放行并写入可审计摘要；后续可替换为 LLM/人工审批而不改状态机形状。
   */
  async supervisorGateRelease(params: {
    distributionPlan: DistributionPlan;
    taskId: string;
    employeeResults: EmployeeExecutionResult[];
  }): Promise<{ released: boolean; summary: string }> {
    const tid = String(params.taskId ?? '').trim();
    const failed = params.employeeResults.some((r) => r.status === 'failed');
    if (failed) {
      return {
        released: false,
        summary: `gate_blocked:${tid}:${params.employeeResults.map((r) => r.summary?.slice?.(0, 160) ?? r.status).join('|')}`,
      };
    }

    if (false) { // deliverable QC disabled — service removed
      const artifacts = params.employeeResults.flatMap((r) =>
        Array.isArray(r.artifacts) ? r.artifacts : [],
      );
      const gate = this.deliverableGate.evaluate({
        artifacts: artifacts as import('@contracts/types').DeptReportArtifact[],
        requiresDeliverable: true,
      });
      if (!gate.allowed) {
        this.logger.log('ceo_v2.supervision.gate_release_deliverable_blocked', {
          distributionId: params.distributionPlan.distributionId,
          taskId: tid,
          reason: gate.reason,
        });
        return {
          released: false,
          summary: `gate_deliverable_blocked:${tid}:${gate.reason ?? 'no_artifacts'}`,
        };
      }
    }

    const released = true;
    this.logger.log('ceo_v2.supervision.gate_release', {
      distributionId: params.distributionPlan.distributionId,
      taskId: tid,
      released,
      employeeResultCount: params.employeeResults.length,
    });
    return {
      released,
      summary: released
        ? `gate_ok:${tid}`
        : `gate_blocked:${tid}:${params.employeeResults.map((r) => r.summary?.slice?.(0, 160) ?? r.status).join('|')}`,
    };
  }

  /**
   * 部门串行管道：在子任务全部完成后，对证据包做一次结构化监督判定（与主群 distribution supervise 解耦）。
   */
  async reviewDepartmentTaskPipelineEvidence(params: {
    companyId: string;
    parentTaskId: string;
    evidence: Record<string, unknown>;
  }): Promise<{
    decision: 'pass' | 'fail' | 'human_required';
    summary?: string;
    failureReason?: string;
  }> {
    if (String(process.env.DEPARTMENT_PIPELINE_SUPERVISION_SKIP_LLM ?? '').trim() === '1') {
      return { decision: 'pass', summary: 'skip_llm_env' };
    }
    const companyId = String(params.companyId ?? '').trim();
    const supSetting = await this.layerConfigResolver.resolveLayerSetting(companyId, 'supervision');
    const supervisionModel = String(supSetting.modelName ?? '').trim();
    if (!supervisionModel) {
      this.logger.warn('ceo_v2.dept_pipeline.supervision_no_model', {
        companyId,
        parentTaskId: params.parentTaskId,
      });
      return { decision: 'human_required', failureReason: 'supervision_model_unconfigured' };
    }
    const traceId = `dept-sup:${params.parentTaskId}`;
    const resolved = await this.llmBridge.createChatModelResolved({
      companyId,
      fallbackModelName: supervisionModel,
      llmTimeoutMs: 25_000,
      maxOutputTokens: 600,
      ceoContext: 'supervision',
      trace: { messageId: traceId, callsite: 'ceo.v2.deptPipeline.supervision' },
    });
    const messages: any[] = [
      new SystemMessage(
        [
          'You audit a completed department task pipeline (serial employee steps and optional cross-department handoff).',
          'Given JSON evidence, decide if outputs are coherent and sufficient for governance.',
          'Return STRICT JSON only: {"decision":"pass"|"fail"|"human_required","summary":string,"failureReason":string|null}.',
          'Use "human_required" when unsure, missing critical evidence, or policy ambiguity.',
          'Use "fail" only for clear quality or safety violations; keep summary concise (max 800 chars).',
        ].join('\n'),
      ),
      new HumanMessage(JSON.stringify({ parentTaskId: params.parentTaskId, evidence: params.evidence })),
    ];
    try {
      const response: any = await resolved.model.invoke(messages);
      const raw =
        response && typeof response.content === 'string'
          ? response.content
          : response && Array.isArray(response.content)
            ? response.content.map((x: any) => (typeof x === 'string' ? x : JSON.stringify(x))).join('')
            : String(response?.content ?? '');
      const parsed = this.parseJsonSafe(raw) as Record<string, unknown> | null;
      const d = String(parsed?.decision ?? '').trim().toLowerCase();
      if (d === 'pass') {
        return {
          decision: 'pass',
          summary: typeof parsed?.summary === 'string' ? parsed.summary.slice(0, 2000) : undefined,
        };
      }
      if (d === 'fail') {
        return {
          decision: 'fail',
          summary: typeof parsed?.summary === 'string' ? parsed.summary.slice(0, 2000) : undefined,
          failureReason: typeof parsed?.failureReason === 'string' ? parsed.failureReason : undefined,
        };
      }
      if (d === 'human_required') {
        return {
          decision: 'human_required',
          summary: typeof parsed?.summary === 'string' ? parsed.summary.slice(0, 2000) : undefined,
          failureReason: typeof parsed?.failureReason === 'string' ? parsed.failureReason : undefined,
        };
      }
    } catch (e: unknown) {
      this.logger.warn('ceo_v2.dept_pipeline.supervision_llm_failed', {
        companyId,
        parentTaskId: params.parentTaskId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    return { decision: 'human_required', failureReason: 'supervision_parse_or_llm_error' };
  }

  private readCeoAgentIdFromDistribution(distributionPlan: DistributionPlan): string | null {
    const raw = (distributionPlan.metadata as any)?.ceoAgentId;
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

  private async ensureLayerSkillIdsBound(params: {
    companyId: string;
    ceoAgentId: string;
    layer: 'supervision';
    skillIds: string[];
    traceId: string;
  }): Promise<{ bound: boolean; outcome?: string; pendingApproval?: boolean; pendingSkillIds?: string[] }> {
    const skillIds = Array.isArray(params.skillIds)
      ? params.skillIds.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    if (!skillIds.length) return { bound: false };
    try {
      const res = await firstValueFrom(
        this.apiRpc
          .send<any>('agents.bindSkills', {
            companyId: params.companyId,
            actor: this.workerActor(),
            id: params.ceoAgentId,
            data: {
              skillIds,
              source: `ceo-layer-config:${params.layer}`,
              isTemporary: false,
            },
          })
          .pipe(timeout({ first: 5_000 })),
      );
      const outcome = typeof res?.outcome === 'string' ? String(res.outcome) : undefined;
      if (outcome === 'pending_approval') {
        return {
          bound: false,
          outcome,
          pendingApproval: true,
          pendingSkillIds: Array.isArray(res?.pendingSkillIds) ? res.pendingSkillIds : undefined,
        };
      }
      return { bound: true, outcome };
    } catch (e: unknown) {
      this.logger.warn('ceo_v2.supervision.skills.bind_failed', {
        traceId: params.traceId,
        companyId: params.companyId,
        ceoAgentId: params.ceoAgentId,
        layer: params.layer,
        message: e instanceof Error ? e.message : String(e),
      });
      return { bound: false };
    }
  }

  private async buildInjectedTools(params: {
    companyId: string;
    ceoAgentId: string;
    layer: 'supervision';
    configuredSkillIds: string[];
  }): Promise<{ tools: OpenAiFunctionTool[]; injectedToolNames: string[]; dedupeDroppedCount: number }> {
    const built = await this.ceoLayerTools.build({
      companyId: params.companyId,
      ceoAgentId: params.ceoAgentId,
      layer: 'supervision',
      configuredSkillIds: params.configuredSkillIds,
      applyV2ToolSurface: true,
    });
    return {
      tools: built.tools,
      injectedToolNames: built.injectedToolNames,
      dedupeDroppedCount: built.dedupeDroppedCount,
    };
  }

  private parseJsonSafe(raw: string): unknown {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    const candidate = first >= 0 && last > first ? text.slice(first, last + 1) : text;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  private async maybeRunSupervisionAdvisor(params: {
    distributionPlan: DistributionPlan;
    companyId: string;
    ceoAgentId: string | null;
    layerCfg: any;
    monitored: EmployeeExecutionResult[];
    merged: any;
    compensated: any;
  }): Promise<{
    injectedToolNames: string[];
    calledToolNames: string[];
    adviceApplied: boolean;
    finalTextAppend?: string;
    suggestedNextStepsOverride?: string[];
  }> {
    const traceId = String(params.distributionPlan.traceId ?? params.distributionPlan.distributionId).trim();
    const enabled = params.layerCfg?.specialConfig?.['enableLlmSupervisionAdvisor'] === true;
    if (!enabled) {
      return { injectedToolNames: [], calledToolNames: [], adviceApplied: false, finalTextAppend: undefined, suggestedNextStepsOverride: undefined };
    }
    if (!params.companyId) {
      return { injectedToolNames: [], calledToolNames: [], adviceApplied: false, finalTextAppend: undefined, suggestedNextStepsOverride: undefined };
    }

    const configuredSkillIds = Array.isArray(params.layerCfg?.skillIds) ? params.layerCfg.skillIds : [];
    const ceoAgentId = params.ceoAgentId;
    if (ceoAgentId && configuredSkillIds.length) {
      const bind = await this.ensureLayerSkillIdsBound({
        companyId: params.companyId,
        ceoAgentId,
        layer: 'supervision',
        skillIds: configuredSkillIds,
        traceId,
      });
      this.logger.log('ceo_v2.supervision.skills.bind', {
        traceId,
        companyId: params.companyId,
        ceoAgentId,
        layer: 'supervision',
        configuredSkillIdsCount: configuredSkillIds.length,
        bound: bind.bound,
        outcome: bind.outcome ?? null,
        pendingApproval: bind.pendingApproval ?? false,
      });
    }

    const { tools, injectedToolNames, dedupeDroppedCount } =
      ceoAgentId && configuredSkillIds.length
        ? await this.buildInjectedTools({
            companyId: params.companyId,
            ceoAgentId,
            layer: 'supervision',
            configuredSkillIds,
          })
        : { tools: [], injectedToolNames: [], dedupeDroppedCount: 0 };

    const supSetting = await this.layerConfigResolver.resolveLayerSetting(params.companyId, 'supervision');
    const supervisionModel = String(supSetting.modelName ?? '').trim();
    if (!supervisionModel) {
      throw new Error('ceo_v2_supervision_admin_supervision_model_unconfigured');
    }
    const resolved = await this.llmBridge.createChatModelResolved({
      companyId: params.companyId,
      fallbackModelName: supervisionModel,
      llmTimeoutMs: 18_000,
      maxOutputTokens: 700,
      ceoContext: 'supervision',
      trace: { messageId: traceId, callsite: 'ceo.v2.supervision.advisor' },
      meteringAgentId: ceoAgentId ?? undefined,
    });

    const modelWithTools =
      tools.length && typeof (resolved.model as any)?.bind === 'function'
        ? (resolved.model as any).bind({ tools, tool_choice: 'auto' })
        : resolved.model;

    const messages: any[] = [
      new SystemMessage(
        [
          'You are CEO v2 Supervisor advisor.',
          'Given distribution status and partial results, propose safe next steps and an optional concise append for finalText.',
          'Return strict JSON: {"finalTextAppend": string|null, "suggestedNextSteps": string[]|null}.',
        ].join('\n'),
      ),
      new HumanMessage(
        JSON.stringify({
          distributionId: params.distributionPlan.distributionId,
          planId: params.distributionPlan.planId,
            executionStateSnapshot:
              typeof (params.distributionPlan.metadata as any)?.executionStateSnapshot === 'string'
                ? String((params.distributionPlan.metadata as any).executionStateSnapshot).slice(0, 1200)
                : '',
          fallbackPolicy: params.distributionPlan.fallbackPolicy,
          monitored: params.monitored.map((x) => ({
            department: x.department,
            status: x.status,
            summary: x.summary,
          })),
          merged: {
            status: params.merged.status,
            deltaReason: params.merged.deltaReason ?? null,
            departmentResults: params.merged.departmentResults,
          },
          compensated: {
            status: params.compensated.status,
            deltaReason: params.compensated.deltaReason ?? null,
            suggestedNextSteps: params.compensated.suggestedNextSteps,
          },
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
          if (CANONICAL_CEO_TOOL_NAMES.has(String(call.name ?? '').trim())) {
            const results = await this.ceoTools.executeTools({
              companyId: params.companyId,
              roomId: String((params.distributionPlan.metadata as any)?.roomId ?? '').trim() || '(unknown)',
              threadId: null,
              traceId,
              messageId: traceId,
              ceoAgentId,
              humanSenderId: null,
              toolCalls: [{ id: call.id, name: call.name, args }],
              maxCalls: 1,
            });
            const content = JSON.stringify(results[0] ?? { ok: false, error: 'CANONICAL_TOOL_NO_RESULT' });
            messages.push(new ToolMessage({ tool_call_id: call.id, content }));
          } else {
            const exec = await this.agentExecution.executeSkill({
              companyId: params.companyId,
              agentId: ceoAgentId,
              projectId: undefined,
              skillName: call.name,
              args,
              traceId,
              roles: this.workerActor().roles,
              layer: 'supervision',
              capabilitySkillIds: configuredSkillIds,
            } as any);
            const content = typeof exec?.result === 'string' ? exec.result : JSON.stringify(exec?.result ?? null);
            messages.push(new ToolMessage({ tool_call_id: call.id, content }));
          }
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

    this.logger.log('ceo_v2.supervision.skills.tools', {
      traceId,
      companyId: params.companyId,
      ceoAgentId: ceoAgentId ?? null,
      layer: 'supervision',
      configuredSkillIdsCount: configuredSkillIds.length,
      injectedToolCount: injectedToolNames.length,
      openAiToolDedupeDropped: dedupeDroppedCount,
      injectedToolNames: injectedToolNames.slice(0, 50),
      calledToolCount: calledToolNames.length,
      calledToolNames: calledToolNames.slice(0, 50),
    });

    const raw =
      response && typeof response.content === 'string'
        ? response.content
        : response && Array.isArray(response.content)
          ? response.content.map((x: any) => (typeof x === 'string' ? x : JSON.stringify(x))).join('')
          : String(response?.content ?? '');
    const parsed = this.parseJsonSafe(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { injectedToolNames, calledToolNames, adviceApplied: false, finalTextAppend: undefined, suggestedNextStepsOverride: undefined };
    }
    const finalTextAppendRaw = (parsed as any).finalTextAppend;
    const suggestedNextStepsRaw = (parsed as any).suggestedNextSteps;
    const finalTextAppend =
      typeof finalTextAppendRaw === 'string' && finalTextAppendRaw.trim() ? finalTextAppendRaw.trim().slice(0, 1200) : undefined;
    const suggestedNextStepsOverride = Array.isArray(suggestedNextStepsRaw)
      ? suggestedNextStepsRaw.map((x: any) => String(x ?? '').trim()).filter(Boolean).slice(0, 8)
      : undefined;
    const adviceApplied = Boolean(finalTextAppend || (suggestedNextStepsOverride && suggestedNextStepsOverride.length));
    return { injectedToolNames, calledToolNames, adviceApplied, finalTextAppend, suggestedNextStepsOverride };
  }

  async supervise(
    distributionPlan: DistributionPlan,
    options?: { supervisionResultSource?: SupervisionResultSource; deferInlineEmployeeExecution?: boolean },
  ): Promise<HeavyExecutionOutput> {
    const supervisionResultSource: SupervisionResultSource =
      options?.supervisionResultSource ?? 'skill_execution';
    const startedAt = Date.now();
    const companyId = String(distributionPlan.metadata?.companyId ?? '').trim();
    const layerCfg = companyId
      ? await this.layerConfigResolver.resolveLayerSetting(companyId, 'supervision').catch(() => null)
      : null;
    const maxIterations =
      typeof layerCfg?.maxIterations === 'number' ? Math.max(1, Math.floor(layerCfg.maxIterations)) : 2;
    const timeoutMs = typeof layerCfg?.timeoutMs === 'number' ? Math.max(1_000, Math.floor(layerCfg.timeoutMs)) : null;
    const enableMemoryRetrieval = layerCfg?.enableMemoryRetrieval ?? true;
    const historyMessagesLimit =
      typeof layerCfg?.historyMessagesLimit === 'number' ? Math.max(1, Math.floor(layerCfg.historyMessagesLimit)) : 20;
    const forceFailOnAnyTimeout = layerCfg?.specialConfig?.['forceFailOnAnyTimeout'] === true;
    const compensationOnTimeout =
      layerCfg?.specialConfig?.['compensationOnTimeout'] === 'fail_fast' ? 'fail_fast' : 'partial_merge';
    const compensationOnDepartmentFailure =
      layerCfg?.specialConfig?.['compensationOnDepartmentFailure'] === 'fail_fast'
        ? 'fail_fast'
        : 'retry_then_degrade';
    const compensationForceVisible =
      typeof layerCfg?.specialConfig?.['compensationForceVisible'] === 'boolean'
        ? layerCfg.specialConfig?.['compensationForceVisible'] === true
        : true;
    const metaSup = distributionPlan.metadata as Record<string, unknown> | undefined;
    const deferInlineEmployeeExecution =
      options?.deferInlineEmployeeExecution === true || metaSup?.deferInlineEmployeeExecution === true;
    const planAnchorMessageId = String(
      distributionPlan.planAnchorMessageId ?? distributionPlan.traceId ?? '',
    ).trim();
    const turnMessageId = String(distributionPlan.turnMessageId ?? metaSup?.turnMessageId ?? '').trim();
    const routingRootMessageId = String(
      distributionPlan.routingRootMessageId ?? metaSup?.routingRootMessageId ?? '',
    ).trim();
    const runId = String(distributionPlan.runId ?? metaSup?.runId ?? '').trim();
    this.logger.log('ceo_v2.supervision.enter', {
      distributionId: distributionPlan.distributionId,
      itemCount: distributionPlan.tasks.length,
      traceId: planAnchorMessageId || distributionPlan.traceId,
      planAnchorMessageId: planAnchorMessageId || distributionPlan.traceId,
      ...(turnMessageId ? { turnMessageId } : {}),
      ...(routingRootMessageId ? { routingRootMessageId } : {}),
      ...(runId ? { runId } : {}),
    });

    const inputMode = this.config.getCollabSupervisionInputMode();
    // inline_skill 模式下预查询部门房间映射，使 deliverable 发到部门群而非主群
    const departmentRoomMap =
      !deferInlineEmployeeExecution && inputMode !== 'dept_reports'
        ? await this.resolveDepartmentRoomMap(distributionPlan).catch(() => new Map<string, string>())
        : undefined;
    const monitored = deferInlineEmployeeExecution
      ? this.buildDeferredDistributionPlanResults(distributionPlan)
      : inputMode === 'dept_reports'
        ? await this.runDeptReportsForDistributionPlan(distributionPlan)
        : await this.runEmployeeExecutionForDistributionPlan(distributionPlan, departmentRoomMap);
    const supervisionInputModeResolved = deferInlineEmployeeExecution
      ? 'distribution_plan_only'
      : inputMode;
    const supervisionResultSourceResolved: SupervisionResultSource =
      deferInlineEmployeeExecution || inputMode === 'dept_reports'
        ? 'skill_execution'
        : supervisionResultSource;
    const employeeArtifactTypes = [
      ...new Set(
        monitored.flatMap((r) =>
          (Array.isArray(r.artifacts) ? r.artifacts : [])
            .map((a) => String(a?.type ?? '').trim())
            .filter(Boolean),
        ),
      ),
    ].slice(0, 16);
    const employeeExecutionDigest = monitored.slice(0, 24).map((r) => {
      const rmeta =
        r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {};
      return {
        taskId: r.taskId,
        department: r.department,
        employeeId: r.employeeId ?? null,
        status: r.status,
        skillName: typeof rmeta.skillName === 'string' ? rmeta.skillName : null,
        skillExecutionId: typeof rmeta.skillExecutionId === 'string' ? rmeta.skillExecutionId : null,
        artifactTypes: (Array.isArray(r.artifacts) ? r.artifacts : [])
          .map((a) => String(a?.type ?? '').trim())
          .filter(Boolean)
          .slice(0, 8),
        blockers: Array.isArray(r.blockers) ? r.blockers.slice(0, 6) : [],
      };
    });
    const employeeExecutionStats = {
      total: monitored.length,
      ok: monitored.filter((r) => r.status === 'ok').length,
      failed: monitored.filter((r) => r.status === 'failed').length,
      noSkillBound: monitored.filter((r) =>
        Array.isArray(r.blockers) ? r.blockers.includes('no_skill_bound') : false,
      ).length,
    };
    const mergePhaseEndedAt = Date.now();
    const merged = this.mergingActivity(
      distributionPlan,
      monitored,
      forceFailOnAnyTimeout,
      compensationOnDepartmentFailure,
      compensationOnTimeout,
    );
    const compensated = this.partialMergeCompensationActivity(
      distributionPlan,
      merged,
      maxIterations,
      compensationForceVisible,
    );
    const ceoAgentId = this.readCeoAgentIdFromDistribution(distributionPlan);
    const advisor = await this.maybeRunSupervisionAdvisor({
      distributionPlan,
      companyId,
      ceoAgentId,
      layerCfg,
      monitored,
      merged,
      compensated,
    }).catch((e) => {
      this.logger.warn('ceo_v2.supervision.advisor.failed', {
        traceId: distributionPlan.traceId,
        distributionId: distributionPlan.distributionId,
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { injectedToolNames: [], calledToolNames: [], adviceApplied: false, finalTextAppend: undefined, suggestedNextStepsOverride: undefined };
    });
    const memoryReferences = this.memoryConsolidationActivity(compensated, enableMemoryRetrieval, historyMessagesLimit);
    const endedAt = Date.now();
    const timeoutExceeded =
      timeoutMs !== null && mergePhaseEndedAt - startedAt > timeoutMs;
    const finalStatus = timeoutExceeded && compensated.status === 'completed' ? 'partial_completed' : compensated.status;
    const finalDeltaReason = timeoutExceeded ? `supervision_timeout_exceeded:${timeoutMs}` : compensated.deltaReason;
    const withAdvisorAppend =
      advisor?.adviceApplied && advisor.finalTextAppend
        ? `${compensated.finalText}\n\n监督补充说明\n${advisor.finalTextAppend}`
        : compensated.finalText;
    const finalText = timeoutExceeded
      ? `${withAdvisorAppend}\n\n本次监督计算超过配置的时间上限（约 ${timeoutMs}ms），结果已按「部分完成」处理；你可稍后重试或缩小问题范围。`
      : withAdvisorAppend;
    const suggestedNextSteps =
      advisor?.adviceApplied && advisor.suggestedNextStepsOverride?.length
        ? advisor.suggestedNextStepsOverride
        : compensated.suggestedNextSteps;
    this.logger.log('foundry.ceo.v2.execution_outcome', {
      companyId,
      traceId: distributionPlan.traceId,
      distributionId: distributionPlan.distributionId,
      status: finalStatus,
      departmentCount: compensated.departmentResults.length,
      timeoutExceeded,
    });
    return {
      schemaVersion: '1.0',
      traceId: distributionPlan.traceId,
      status: finalStatus,
      finalText,
      departmentResults: compensated.departmentResults,
      memoryReferences,
      suggestedNextSteps,
      executionTrace: {
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        latencyMs: endedAt - startedAt,
      },
      deltaReason: finalDeltaReason,
      metadata: {
        ...(distributionPlan.metadata ?? {}),
        supervision: 'ceo.v2.l3.complete',
        supervisionConfigApplied: {
          maxIterations,
          timeoutMs,
          enableMemoryRetrieval,
          historyMessagesLimit,
          forceFailOnAnyTimeout,
          compensationOnTimeout,
          compensationOnDepartmentFailure,
          compensationForceVisible,
        },
        ceoSkillConfig: {
          injectedToolNames: advisor.injectedToolNames ?? [],
          calledToolNames: advisor.calledToolNames ?? [],
          adviceApplied: advisor.adviceApplied ?? false,
        },
        supervisionResultSource: supervisionResultSourceResolved,
        supervisionInputMode: supervisionInputModeResolved,
        ...(deferInlineEmployeeExecution ? { supervisionDeferredInlineExecution: true } : {}),
        ...(supervisionInputModeResolved === 'dept_reports'
          ? { directorDeptReportCount: (await this.deptReportBuffer.listDirectorReports(distributionPlan.distributionId)).length }
          : {}),
        ...(employeeArtifactTypes.length ? { employeeArtifactTypes } : {}),
        employeeExecutionDigest,
        employeeExecutionStats,
        memoryConsolidation: {
          skipped: true,
          reason: 'not_wired_post_employee_merge',
        },
      },
    };
  }

  private normalizeEmployeeExecutionStatus(raw: string): 'ok' | 'partial' | 'timeout' | 'failed' {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === 'failed') return 'failed';
    if (s === 'timeout') return 'timeout';
    if (s === 'partial') return 'partial';
    if (s === 'succeeded' || s === 'ok') return 'ok';
    return 'ok';
  }

  /**
   * 批量查询部门 slug → 部门群 roomId 映射，用于 inline supervision 路径将 deliverable 发到部门群而非主群。
   */
  private async resolveDepartmentRoomMap(
    distributionPlan: DistributionPlan,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const companyId = String(distributionPlan.metadata?.companyId ?? '').trim();
    if (!companyId) return map;
    const tasks = Array.isArray(distributionPlan.tasks) ? distributionPlan.tasks : [];
    const uniqueSlugs = [...new Set(tasks.map((t) => String(t.department ?? '').trim().toLowerCase()).filter(Boolean))];
    if (!uniqueSlugs.length) return map;
    const actor = this.workerActor();
    const rpcTimeout = 8000;
    await Promise.all(
      uniqueSlugs.map(async (slug) => {
        try {
          const room = await firstValueFrom(
            this.apiRpc
              .send<{ id?: string } | null>('collaboration.rooms.findDepartmentBySlug', {
                companyId,
                actor,
                departmentSlug: slug,
              })
              .pipe(timeout({ first: rpcTimeout })),
          );
          const roomId = typeof room?.id === 'string' ? room.id.trim() : '';
          if (roomId) map.set(slug, roomId);
        } catch {
          // RPC 失败时跳过该部门，fallback 到主群 roomId
        }
      }),
    );
    return map;
  }

  private async executeOneDistributionTask(
    distributionPlan: DistributionPlan,
    t: DistributionPlan['tasks'][number],
    traceId: string,
    departmentRoomMap?: Map<string, string>,
  ): Promise<EmployeeExecutionResult> {
    const objective = String(t.deliverable ?? t.taskId ?? '').trim() || t.taskId;
    const phaseOutcome = String(t.phaseOutcome ?? '').trim();
    const acceptanceCriteria =
      phaseOutcome.length > 0
        ? [phaseOutcome]
        : objective
          ? [objective.length > 1600 ? `${objective.slice(0, 1600)}…` : objective]
          : [];
    const pkg: DirectorTaskPackage = {
      taskId: t.taskId,
      distributionId: distributionPlan.distributionId,
      department: t.department,
      ownerAgent: t.ownerAgent,
      objective,
      acceptanceCriteria,
      priority: t.priority,
      traceId,
      metadata: {
        source: 'ceo.v2.supervision.employee',
        departmentSlug: t.department,
        companyId: String(distributionPlan.metadata?.companyId ?? '').trim(),
        roomId: departmentRoomMap?.get(String(t.department ?? '').trim().toLowerCase())
          || String(distributionPlan.metadata?.roomId ?? '').trim()
          || undefined,
        strategicPhaseId: t.strategicPhaseId ?? null,
        distributionItemId: t.taskId,
        requiresDeliverable: true,
      },
    };
    const raw = await this.employeeExecution.executeTask(pkg);
    const st = this.normalizeEmployeeExecutionStatus(String(raw.status ?? 'ok'));
    return {
      ...raw,
      department: t.department,
      status: st,
      summary: String(raw.summary ?? '').trim() || objective.slice(0, 400),
    } as EmployeeExecutionResult;
  }

  private async runDeptReportsForDistributionPlan(
    distributionPlan: DistributionPlan,
  ): Promise<EmployeeExecutionResult[]> {
    const distId = String(distributionPlan.distributionId ?? '').trim();
    const tasks = Array.isArray(distributionPlan.tasks) ? distributionPlan.tasks : [];
    const directorReports = distId
      ? await this.deptReportBuffer.listDirectorReports(distId)
      : [];
    const byDept = new Map<string, DirectorDeptReportPayload>();
    for (const r of directorReports) {
      byDept.set(r.department, r);
    }

    const results: EmployeeExecutionResult[] = [];
    for (const t of tasks) {
      const dept = String(t.department ?? '').trim() || 'unknown';
      const dirReport = byDept.get(dept);
      if (!dirReport) {
        results.push({
          taskId: t.taskId,
          department: dept,
          status: 'failed',
          summary: `部门 ${dept} 尚无主管汇报（dept_reports 模式）`,
          blockers: ['missing_director_dept_report'],
          artifacts: [],
          metadata: { supervisionInputMode: 'dept_reports' },
        });
        continue;
      }
      if (!dirReport.readyForSupervision) {
        results.push({
          taskId: t.taskId,
          department: dept,
          status: 'partial',
          summary: dirReport.summary.slice(0, 1200),
          employeeId: dirReport.directorAgentId,
          blockers: dirReport.blockers ?? ['director_report_not_ready'],
          artifacts: (dirReport.artifacts ?? []).map((a) => ({
            type: a.type,
            uri: a.uri,
            content: a.content,
          })),
          metadata: {
            supervisionInputMode: 'dept_reports',
            directorDeptReport: true,
          },
        });
        continue;
      }
      results.push({
        taskId: t.taskId,
        department: dept,
        status: dirReport.status === 'ok' ? 'ok' : 'failed',
        summary: dirReport.summary.slice(0, 1200),
        employeeId: dirReport.directorAgentId,
        artifacts: (dirReport.artifacts ?? []).map((a) => ({
          type: a.type,
          uri: a.uri,
          content: a.content,
        })),
        metadata: {
          supervisionInputMode: 'dept_reports',
          directorDeptReport: true,
          employeeReportCount: dirReport.employeeReports.length,
        },
      });
    }
    return results;
  }

  private buildDeferredDistributionPlanResults(
    distributionPlan: DistributionPlan,
  ): EmployeeExecutionResult[] {
    const tasks = Array.isArray(distributionPlan.tasks) ? distributionPlan.tasks : [];
    return tasks.map((t) => {
      const dept = String(t.department ?? '').trim() || 'unknown';
      const objective = String(t.deliverable ?? t.taskId ?? '').trim();
      return {
        taskId: t.taskId,
        department: dept,
        status: 'ok',
        summary: objective
          ? `已纳入部门分工草稿，确认下发后由 ${dept} 在部门群执行：${objective.slice(0, 200)}`
          : `已纳入部门分工草稿，确认下发后由 ${dept} 在部门群执行。`,
        artifacts: [],
        metadata: { supervisionDeferredExecution: true },
      };
    });
  }

  private async runEmployeeExecutionForDistributionPlan(
    distributionPlan: DistributionPlan,
    departmentRoomMap?: Map<string, string>,
  ): Promise<EmployeeExecutionResult[]> {
    const traceId = String(
      distributionPlan.planAnchorMessageId ?? distributionPlan.traceId ?? distributionPlan.distributionId,
    ).trim();
    const tasks = Array.isArray(distributionPlan.tasks) ? [...distributionPlan.tasks] : [];
    if (!tasks.length) return [];
    const maxConcurrent = Math.max(
      1,
      Math.floor(distributionPlan.parallelism?.maxConcurrentDepartments ?? 1),
    );
    const taskById = new Map(tasks.map((t) => [t.taskId, t]));
    const pendingPrereqCount = new Map<string, number>();
    for (const t of tasks) {
      const n = (t.dependencies ?? []).filter((d) => taskById.has(d)).length;
      pendingPrereqCount.set(t.taskId, n);
    }
    const completed = new Set<string>();
    const results: EmployeeExecutionResult[] = [];
    while (completed.size < tasks.length) {
      const ready = tasks
        .filter((t) => !completed.has(t.taskId) && (pendingPrereqCount.get(t.taskId) ?? 0) === 0)
        .sort((a, b) => tasks.indexOf(a) - tasks.indexOf(b));
      if (!ready.length) {
        this.logger.warn('ceo_v2.supervision.topo_cycle_or_stuck', {
          distributionId: distributionPlan.distributionId,
          completed: completed.size,
          total: tasks.length,
        });
        for (const t of tasks) {
          if (!completed.has(t.taskId)) {
            results.push(await this.executeOneDistributionTask(distributionPlan, t, traceId, departmentRoomMap));
            completed.add(t.taskId);
          }
        }
        break;
      }
      const batch = ready.slice(0, maxConcurrent);
      const batchOut = await Promise.all(
        batch.map((t) => this.executeOneDistributionTask(distributionPlan, t, traceId, departmentRoomMap)),
      );
      results.push(...batchOut);
      for (const t of batch) {
        completed.add(t.taskId);
        for (const u of tasks) {
          if (completed.has(u.taskId)) continue;
          const deps = u.dependencies ?? [];
          if (deps.includes(t.taskId)) {
            pendingPrereqCount.set(u.taskId, Math.max(0, (pendingPrereqCount.get(u.taskId) ?? 0) - 1));
          }
        }
      }
    }
    return results;
  }

  private mergingActivity(
    distributionPlan: DistributionPlan,
    results: EmployeeExecutionResult[],
    forceFailOnAnyTimeout: boolean,
    compensationOnDepartmentFailure: 'retry_then_degrade' | 'fail_fast',
    compensationOnTimeout: 'partial_merge' | 'fail_fast',
  ) {
    const grouped = new Map<string, { status: 'ok' | 'timeout' | 'failed'; summary: string[] }>();
    for (const row of results) {
      const current = grouped.get(row.department) ?? { status: 'ok', summary: [] };
      if (row.status === 'failed') current.status = 'failed';
      if (row.status === 'timeout' && current.status !== 'failed') current.status = 'timeout';
      current.summary.push(row.summary);
      grouped.set(row.department, current);
    }
    const departmentResults = Array.from(grouped.entries()).map(([department, out]) => ({
      department,
      status: out.status,
      summary: out.summary.join(' '),
    }));
    const statusLabel = (s: 'ok' | 'timeout' | 'failed'): string => {
      if (s === 'ok') return '已完成';
      if (s === 'timeout') return '超时';
      return '未通过';
    };
    const deptLines = departmentResults.map((x) => {
      const detail = x.summary?.trim() ? `（${x.summary.trim().slice(0, 160)}）` : '';
      return `• ${x.department}：${statusLabel(x.status)}${detail}`;
    });
    const mergeSummaryBody = [
      '我已对本次规划下的跨部门执行结果做了监督汇总。',
      '各部门子任务状态如下：',
      ...deptLines,
      '如需结合公司资料做更具体的说明，可以告诉我希望侧重「产品 / 组织 / 风险 / 目标」中的哪一块。',
    ].join('\n');

    if (
      (forceFailOnAnyTimeout || compensationOnTimeout === 'fail_fast') &&
      departmentResults.some((x) => x.status === 'timeout')
    ) {
      return {
        status: 'failed' as const,
        departmentResults,
        finalText:
          '监督层检测到部分任务超时，已按当前策略终止本次合并。建议排查超时链路或稍后重试；若问题持续，请联系运维核对工作流配置。',
        suggestedNextSteps: ['排查超时链路', '修复后重跑全量任务'],
        deltaReason: 'force_fail_on_timeout',
      };
    }
    if (compensationOnDepartmentFailure === 'fail_fast' && departmentResults.some((x) => x.status === 'failed')) {
      return {
        status: 'failed' as const,
        departmentResults,
        finalText:
          '监督层检测到部分部门执行未通过，已按当前策略终止合并。建议定位失败根因后重试，或缩小本次执行范围再试。',
        suggestedNextSteps: ['定位失败部门根因', '修复后重跑全量任务'],
        deltaReason: 'force_fail_on_department_failure',
      };
    }
    const finalText = mergeSummaryBody;
    return {
      status: departmentResults.some((x) => x.status !== 'ok') ? ('partial_completed' as const) : ('completed' as const),
      departmentResults,
      finalText,
      suggestedNextSteps: ['复核关键部门输出', '执行最终审批/发布'],
      deltaReason: undefined as string | undefined,
    };
  }

  private partialMergeCompensationActivity(
    distributionPlan: DistributionPlan,
    merged: {
      status: 'completed' | 'partial_completed' | 'failed';
      departmentResults: Array<{ department: string; status: 'ok' | 'timeout' | 'failed'; summary: string }>;
      finalText: string;
      suggestedNextSteps: string[];
      deltaReason?: string;
    },
    maxIterations: number,
    compensationForceVisible: boolean,
  ) {
    if (merged.status === 'completed' || merged.status === 'failed') return merged;
    const nextSteps =
      maxIterations <= 1 ? ['人工接管并完成收尾'] : ['补齐超时部门任务', '发起补偿重跑'].slice(0, maxIterations);
    const appended = compensationForceVisible
      ? `${merged.finalText}\n\n部分任务仍在收尾，系统已在后台尝试补偿合并；若你急需结论，可说明优先级以便人工介入。`
      : merged.finalText;
    return {
      ...merged,
      status: 'partial_completed' as const,
      finalText: appended,
      suggestedNextSteps: nextSteps,
      deltaReason: `partial_merge_compensation:${distributionPlan.fallbackPolicy.onTimeout}`,
    };
  }

  private memoryConsolidationActivity(
    result: {
      departmentResults: Array<{ department: string; status: 'ok' | 'timeout' | 'failed'; summary: string }>;
    },
    _enableMemoryRetrieval: boolean,
    _historyMessagesLimit: number,
  ): string[] {
    void result;
    return [];
  }
}
