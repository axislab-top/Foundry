import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import type { DirectorTaskPackage, EmployeeExecutionResult, MemoryReference } from '@contracts/types';
import { ToolRegistry } from '@service/ai';
import { ConfigService } from '../../../common/config/config.service.js';
import { AgentExecutionService } from '../../agents/services/agent-execution.service.js';
import {
  mapSkillResultToDeliverableArtifacts,
  toCollaborationDeliverableArtifactRows,
} from '../utils/employee-deliverable-artifacts.util.js';
import { pickDeliverableExecutionSkillName } from '../utils/execution-skill-picker.util.js';
import { resolveSkillExecutionOutcome } from '../utils/skill-execution-outcome.util.js';
import { resolveExecutionProfile } from '../utils/execution-profile.util.js';
import { UnifiedDeliverableExecutorService } from '../deliverable/unified-deliverable-executor.service.js';
import { DeliverableGateService } from '../deliverable/deliverable-gate.service.js';
import { buildEmployeeDeliverableMessagePayload } from '../utils/post-employee-deliverable.util.js';
import { FileAssetsRegistrationService } from '../../file-assets/file-assets-registration.service.js';
import { attachFileAssetIdsToArtifactRows } from '../../file-assets/attach-file-asset-ids.util.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Employee 执行层（Stage 4 / Phase 1）。
 *
 * 责任：
 * - 接收 DirectorTaskPackage
 * - 解析部门主管 Agent + 绑定 Skill，经 AgentExecutionService 真执行
 * - 聚合执行产物 + 写入 memory.entries.store
 */
@Injectable()
export class EmployeeExecutionService {
  private readonly logger = new Logger(EmployeeExecutionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly agentExecution: AgentExecutionService,
    private readonly registry: ToolRegistry,
    private readonly unifiedDeliverable: UnifiedDeliverableExecutorService,
    private readonly deliverableGate: DeliverableGateService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly fileAssetsRegistration: FileAssetsRegistrationService,
  ) {}

  async executeTask(taskPackage: DirectorTaskPackage): Promise<EmployeeExecutionResult> {
    const startedAt = Date.now();
    const meta = (taskPackage.metadata ?? {}) as Record<string, unknown>;
    const companyId = String(meta.companyId ?? '').trim();
    const department = String(taskPackage.department ?? '').trim() || 'unknown';
    const objective = String(taskPackage.objective ?? '').trim();
    const label = objective || taskPackage.taskId;
    const acceptance = Array.isArray(taskPackage.acceptanceCriteria) ? taskPackage.acceptanceCriteria : [];

    if (!companyId) {
      return this.failedResult(taskPackage, department, ['missing_company_id'], startedAt, acceptance);
    }

    try {
      const agentId = await this.resolveAgentId(companyId, taskPackage, meta, department);
      if (!agentId) {
        return this.failedResult(taskPackage, department, ['no_agent_for_department'], startedAt, acceptance);
      }

      const skills = await this.unifiedDeliverable.hydrateAgentSkills(companyId, agentId);
      const employeeCount = await this.countDepartmentEmployees(companyId, meta, department);
      const executionProfile =
        (typeof meta.executionProfile === 'string' && meta.executionProfile.trim()) ||
        resolveExecutionProfile({
          assigneeRole: 'director',
          departmentEmployeeCount: employeeCount,
        });

      const taskContext = [objective, ...(taskPackage.acceptanceCriteria ?? [])].join('\n').slice(0, 4000);
      const skillName = this.unifiedDeliverable.pickSkillName(skills, {
        preferredSkillName:
          typeof meta.skillName === 'string'
            ? meta.skillName
            : typeof meta.executionSkill === 'string'
              ? meta.executionSkill
              : null,
        executionProfile: executionProfile as any,
        taskContext,
      });
      if (!skillName) {
        return this.failedResult(taskPackage, department, ['no_skill_bound'], startedAt, acceptance, agentId);
      }

      const args = this.buildSkillArgs(taskPackage, skillName);
      const traceId = String(taskPackage.traceId ?? taskPackage.taskId).trim() || taskPackage.taskId;

      const exec = await this.unifiedDeliverable.execute({
        companyId,
        agentId,
        traceId,
        args,
        preferredSkillName: skillName,
        executionProfile: executionProfile as any,
        layer: 'employee',
        taskContext,
      });
      const skillOutcome = resolveSkillExecutionOutcome(exec.result);
      if (skillOutcome !== 'ok') {
        return this.failedResult(
          taskPackage,
          department,
          [skillOutcome === 'blocked' ? 'skill_blocked' : 'skill_failed'],
          startedAt,
          acceptance,
          agentId,
        );
      }
      const effectiveSkillName = exec.skillName;
      const skillExecutionId = exec.skillExecutionId;
      const executionSource = exec.executionSource;

      const summary = this.summarizeSkillResult(exec.result, label);
      const mappedDeliverables = mapSkillResultToDeliverableArtifacts(exec.result, effectiveSkillName);
      let artifactRows = toCollaborationDeliverableArtifactRows(mappedDeliverables);
      const projectId =
        typeof meta.projectId === 'string' ? meta.projectId : undefined;
      const registered = await this.fileAssetsRegistration.registerFromArtifacts(
        {
          companyId,
          agentId,
          taskId: taskPackage.taskId,
          projectId,
          skillName,
        },
        mappedDeliverables,
        exec.result,
      );
      artifactRows = attachFileAssetIdsToArtifactRows(artifactRows, registered, companyId);
      const requiresDeliverable = meta.requiresDeliverable === true;
      const gate = this.deliverableGate.evaluate({
        artifacts: artifactRows,
        taskId: taskPackage.taskId,
        requiresDeliverable,
      });
      if (!gate.allowed) {
        return this.failedResult(
          taskPackage,
          department,
          ['deliverable_gate_no_artifacts'],
          startedAt,
          acceptance,
          agentId,
        );
      }
      const reportArtifacts = artifactRows.map(({ type, uri, content, fileAssetId, label }) => ({
        type,
        ...(uri ? { uri } : {}),
        ...(content ? { content } : {}),
        ...(fileAssetId ? { fileAssetId } : {}),
        ...(label ? { label } : {}),
      }));
      const roomId = typeof meta.roomId === 'string' ? meta.roomId.trim() : '';
      const deliverableThreadId =
        String(meta.lastDispatchThreadId ?? meta.threadId ?? '').trim() || null;
      if (roomId && artifactRows.length) {
        const payload = buildEmployeeDeliverableMessagePayload({
          companyId,
          actor: this.workerActor(),
          roomId,
          agentId,
          traceId,
          taskId: taskPackage.taskId,
          skillName: effectiveSkillName,
          skillExecutionId,
          department,
          artifacts: artifactRows,
          threadId: deliverableThreadId,
        });
        try {
          await this.rpc('collaboration.messages.appendAgent', {
            companyId,
            actor: this.workerActor(),
            roomId,
            agentId,
            content: payload.content,
            messageType: 'text',
            threadId: deliverableThreadId ?? undefined,
            metadata: payload.metadata,
          });
        } catch (e: unknown) {
          this.logger.warn('employee_execution.deliverable_card_append_failed', {
            taskId: taskPackage.taskId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const memoryReferences = await this.tryStoreMemory({
        namespace: `company:${companyId}:ceo:v2:employee`,
        content: `${label}\n\n${summary}`.slice(0, 7000),
        metadata: {
          source: 'employee_execution_v2',
          companyId,
          taskId: taskPackage.taskId,
          distributionId: taskPackage.distributionId,
          department,
          agentId,
          skillName: effectiveSkillName,
          skillExecutionId,
        },
      });

      const result: EmployeeExecutionResult = {
        taskId: taskPackage.taskId,
        department,
        employeeId: agentId,
        status: 'ok',
        summary,
        artifacts: reportArtifacts,
        confidence: 0.85,
        metadata: {
          elapsedMs: Date.now() - startedAt,
          acceptanceCriteria: acceptance,
          skillExecutionId,
          skillName: effectiveSkillName,
          executionSource,
          skillDurationMs: exec.durationMs,
        },
      };

      this.logger.log('employee.execute.ok', {
        taskId: taskPackage.taskId,
        department,
        agentId,
        skillName: effectiveSkillName,
        skillExecutionId,
        elapsedMs: Date.now() - startedAt,
        memoryReferences: memoryReferences.length,
      });

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('employee.execute.failed', msg, {
        taskId: taskPackage.taskId,
        department,
      });
      return this.failedResult(taskPackage, department, [msg], startedAt, acceptance);
    }
  }

  private failedResult(
    taskPackage: DirectorTaskPackage,
    department: string,
    blockers: string[],
    startedAt: number,
    acceptance: string[],
    employeeId?: string,
  ): EmployeeExecutionResult {
    const primary = String(blockers[0] ?? '').trim();
    let summary = `部门执行未完成：${primary || 'unknown'}`;
    if (primary === 'deliverable_gate_no_artifacts') {
      summary = '部门尚未产出可验收交付物，任务保持进行中。';
    } else if (primary === 'no_skill_bound' || primary === 'unified_deliverable_no_skill') {
      summary = '部门主管未绑定可交付 Skill，请联系管理员执行 backfill:agent-skills 或绑定产品/研究类产出 Skill。';
    } else if (/no builtin handler|department\.knowledge\.query/i.test(primary)) {
      summary = '当前绑定的 Skill 不能用于产出交付物，需绑定带 prompt 的产出型 Skill（如 product-roadmap-prioritizer）。';
    } else if (primary.startsWith('Employee execution failed:')) {
      summary = primary.replace(/^Employee execution failed:\s*/i, '部门执行失败：').slice(0, 400);
    }
    return {
      taskId: taskPackage.taskId,
      department,
      employeeId,
      status: 'failed',
      summary,
      blockers,
      confidence: 0.2,
      metadata: {
        elapsedMs: Date.now() - startedAt,
        acceptanceCriteria: acceptance,
        executionSource: 'agent_execution_service',
      },
    };
  }

  private isUuid(value: string): boolean {
    return UUID_RE.test(value.trim());
  }

  private async resolveAgentId(
    companyId: string,
    taskPackage: DirectorTaskPackage,
    meta: Record<string, unknown>,
    department: string,
  ): Promise<string | null> {
    const fromMeta =
      (typeof meta.agentId === 'string' && meta.agentId.trim()) ||
      (typeof meta.employeeAgentId === 'string' && meta.employeeAgentId.trim()) ||
      '';
    if (fromMeta && this.isUuid(fromMeta)) {
      return fromMeta;
    }

    const orgNodeFromMeta =
      typeof meta.organizationNodeId === 'string' && meta.organizationNodeId.trim()
        ? meta.organizationNodeId.trim()
        : null;
    if (orgNodeFromMeta) {
      const id = await this.findDirectorAgentId(companyId, orgNodeFromMeta);
      if (id) return id;
    }

    const roomId = typeof meta.roomId === 'string' ? meta.roomId.trim() : '';
    const deptSlug =
      (typeof meta.departmentSlug === 'string' && meta.departmentSlug.trim().toLowerCase()) ||
      department.toLowerCase();
    if (roomId && deptSlug) {
      const nodeId = await this.resolveOrgNodeIdBySlug(companyId, roomId, deptSlug);
      if (nodeId) {
        const id = await this.findDirectorAgentId(companyId, nodeId);
        if (id) return id;
      }
    }

    return null;
  }

  private async resolveOrgNodeIdBySlug(
    companyId: string,
    roomId: string,
    departmentSlug: string,
  ): Promise<string | null> {
    try {
      const snap = await this.rpc<{
        departments?: Array<{ id?: string; slug?: string }>;
      }>('organization.nodes.getRoomOrgSnapshot', {
        companyId,
        actor: this.workerActor(),
        roomId,
      });
      const depts = Array.isArray(snap?.departments) ? snap.departments : [];
      const match = depts.find((d) => String(d?.slug ?? '').trim().toLowerCase() === departmentSlug);
      const id = typeof match?.id === 'string' ? match.id.trim() : '';
      return id || null;
    } catch (e: unknown) {
      this.logger.warn('employee.resolve_org_node_by_slug_failed', {
        companyId,
        roomId,
        departmentSlug,
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private async findDirectorAgentId(companyId: string, organizationNodeId: string): Promise<string | null> {
    try {
      const res = await this.rpc<{ items?: Array<{ id?: string }> }>('agents.findAll', {
        companyId,
        actor: this.workerActor(),
        organizationNodeId,
        role: 'director',
        status: 'active',
        page: 1,
        pageSize: 1,
      });
      const id = typeof res?.items?.[0]?.id === 'string' ? res.items[0].id.trim() : '';
      return id || null;
    } catch (e: unknown) {
      this.logger.warn('employee.find_director_agent_id_failed', {
        companyId,
        organizationNodeId,
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private async countDepartmentEmployees(
    companyId: string,
    meta: Record<string, unknown>,
    department: string,
  ): Promise<number> {
    const orgNodeFromMeta =
      typeof meta.organizationNodeId === 'string' && meta.organizationNodeId.trim()
        ? meta.organizationNodeId.trim()
        : null;
    let nodeId = orgNodeFromMeta;
    if (!nodeId) {
      const roomId = typeof meta.roomId === 'string' ? meta.roomId.trim() : '';
      const deptSlug =
        (typeof meta.departmentSlug === 'string' && meta.departmentSlug.trim().toLowerCase()) ||
        department.toLowerCase();
      if (roomId && deptSlug) {
        nodeId = (await this.resolveOrgNodeIdBySlug(companyId, roomId, deptSlug)) ?? undefined;
      }
    }
    if (!nodeId) return 0;
    try {
      const res = await this.rpc<{ items?: Array<{ id?: string }> }>('agents.findAll', {
        companyId,
        actor: this.workerActor(),
        organizationNodeId: nodeId,
        role: 'employee',
        status: 'active',
        page: 1,
        pageSize: 8,
      });
      return (res?.items ?? []).length;
    } catch (e: unknown) {
      this.logger.warn('employee.count_department_employees_failed', {
        companyId,
        department,
        nodeId,
        message: e instanceof Error ? e.message : String(e),
      });
      return 0;
    }
  }

  private buildSkillArgs(taskPackage: DirectorTaskPackage, skillName: string): Record<string, unknown> {
    const meta = (taskPackage.metadata ?? {}) as Record<string, unknown>;
    const objective = String(taskPackage.objective ?? '').trim();
    if (skillName === 'echo') {
      return {
        message: [objective, ...(taskPackage.acceptanceCriteria ?? [])].filter(Boolean).join('\n').slice(0, 8000),
      };
    }
    if (skillName === 'code-run') {
      const command =
        typeof meta.command === 'string'
          ? meta.command
          : typeof meta.shellCommand === 'string'
            ? meta.shellCommand
            : '';
      return {
        command: command.trim() || 'true',
      };
    }
    const criteria = taskPackage.acceptanceCriteria ?? [];
    const deliverable = criteria.length
      ? `${objective}\n\n交付要求：\n${criteria.map((c) => `- ${c}`).join('\n')}`
      : objective;
    return {
      objective,
      deliverable,
      acceptanceCriteria: criteria,
      taskId: taskPackage.taskId,
      distributionId: taskPackage.distributionId,
      department: taskPackage.department,
      metadata: meta,
    };
  }

  private summarizeSkillResult(result: unknown, fallbackLabel: string): string {
    if (result === null || result === undefined) {
      return `Completed: ${fallbackLabel}`;
    }
    if (typeof result === 'string') {
      const t = result.trim();
      return t.length ? t.slice(0, 2400) : `Completed: ${fallbackLabel}`;
    }
    if (typeof result === 'object') {
      const o = result as Record<string, unknown>;
      for (const key of ['summary', 'message', 'deliverable', 'output', 'text', 'content']) {
        const v = o[key];
        if (typeof v === 'string' && v.trim()) {
          return v.trim().slice(0, 2400);
        }
      }
      try {
        return JSON.stringify(result).slice(0, 2400);
      } catch {
        return `Completed: ${fallbackLabel}`;
      }
    }
    return `Completed: ${fallbackLabel}`;
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout({ first: this.config.getCollaborationMentionRpcTimeoutMs() })),
    );
  }

  private async tryStoreMemory(params: {
    namespace: string;
    content: string;
    metadata: Record<string, unknown>;
  }): Promise<MemoryReference[]> {
    const companyId = String(params.metadata.companyId ?? '').trim();
    try {
      const resp = await firstValueFrom(
        this.apiRpc
          .send<{ id?: string }>('memory.entries.store', {
            companyId: companyId || 'unknown',
            actor: this.workerActor(),
            data: {
              namespace: params.namespace,
              collectionLabel: 'ceo_v2_employee',
              content: params.content,
              sourceType: 'summary',
              metadata: params.metadata,
            },
          })
          .pipe(timeout({ first: 1800 })),
      );
      const id = String(resp?.id ?? '').trim();
      return id ? [{ memoryEntryId: id, namespace: params.namespace, sourceType: 'summary' }] : [];
    } catch (e: unknown) {
      this.logger.debug('employee.try_store_memory_failed', {
        companyId,
        namespace: params.namespace,
        message: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }
}
