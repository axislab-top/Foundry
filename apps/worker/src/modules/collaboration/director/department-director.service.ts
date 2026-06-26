import { Injectable, Logger } from '@nestjs/common';
import type {
  DirectorSignalPayload,
  DirectorTaskPackage,
  DistributionPlan,
  EmployeeExecutionResult,
} from '@contracts/types';
import { EmployeeExecutionService } from '../employee/employee-execution.service.js';
import { CeoV2TemporalService } from '../ceo/v2/ceo-v2-temporal.service.js';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * Department Director（部门主管层）— **Temporal 兼容路径**。
 *
 * 阶段 3.3：主群 L2 部门拆工/委派以 {@link DirectorAutonomousService} 为 SSOT；
 * 本服务保留给 Temporal workflow 内同步执行，新功能勿再扩展此路径。
 */
@Injectable()
export class DepartmentDirectorService {
  private readonly logger = new Logger(DepartmentDirectorService.name);

  constructor(
    private readonly employee: EmployeeExecutionService,
    private readonly temporal: CeoV2TemporalService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 运行单个部门的 workflow（Stage 4：进程内实现；Stage 5 将迁移为 Temporal activity/workflow）。
   */
  async runDepartmentWorkflow(distributionPlan: DistributionPlan, task: DistributionPlan['tasks'][number]): Promise<void> {
    const traceId = String(
      distributionPlan.planAnchorMessageId ??
        distributionPlan.traceId ??
        (distributionPlan.metadata as { traceId?: string } | undefined)?.traceId ??
        (distributionPlan.metadata as { routingRootMessageId?: string } | undefined)?.routingRootMessageId ??
        '',
    ).trim();
    const parentWorkflowId = String(distributionPlan.metadata?.parentWorkflowId ?? '').trim();
    const departmentSlug = String(task.department ?? 'unknown').trim() || 'unknown';

    this.logger.log('director.department.start', {
      distributionId: distributionPlan.distributionId,
      taskId: task.taskId,
      department: task.department,
      parentWorkflowId: parentWorkflowId || null,
    });

    const plannedTasks = await this.directorPlanningActivity(distributionPlan, task);
    const taskPackages: DirectorTaskPackage[] = plannedTasks.map((t, idx) => ({
      taskId: `${task.taskId}:emp:${idx + 1}`,
      distributionId: distributionPlan.distributionId,
      department: task.department,
      ownerAgent: task.ownerAgent,
      objective: t.objective,
      acceptanceCriteria: t.acceptanceCriteria,
      contextReferences: [],
      priority: task.priority,
      traceId,
      metadata: {
        sourceDistributionItemId: task.taskId,
        directorPlanning: true,
      },
    }));

    if (parentWorkflowId) {
      await this.safeSignal(parentWorkflowId, distributionPlan, task, traceId, {
        signalType: 'task_dispatched',
        taskId: task.taskId,
        department: departmentSlug,
        message: `Director dispatched ${taskPackages.length} employee tasks for department=${departmentSlug}`,
        metadata: { traceId },
      });
    }

    const results = await Promise.allSettled(taskPackages.map((p) => this.employee.executeTask(p)));
    const settled = results.map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean) as EmployeeExecutionResult[];
    const partialNote = `employee_results=${settled.length}/${results.length}`;

    if (parentWorkflowId && traceId && this.config.isWorkerDirectorTemporalEnabled()) {
      await this.temporal.signalDepartmentPartialUpdate({
        traceId,
        parentWorkflowId,
        distributionId: distributionPlan.distributionId,
        distributionItemId: task.taskId,
        departmentId: departmentSlug,
        directorSignal: {
          signalType: 'task_updated',
          taskId: task.taskId,
          department: departmentSlug,
          message: partialNote,
          metadata: { traceId },
        },
        employeePartials: settled,
      });
    }

    if (parentWorkflowId && traceId && this.config.isWorkerDirectorTemporalEnabled()) {
      await this.temporal.signalDepartmentComplete({
        traceId,
        parentWorkflowId,
        distributionId: distributionPlan.distributionId,
        distributionItemId: task.taskId,
        departmentId: departmentSlug,
        directorSignal: {
          signalType: 'task_completed',
          taskId: task.taskId,
          department: departmentSlug,
          message: `complete:${partialNote}`,
          metadata: { traceId },
        },
        employeeResults: settled,
      });
    }

    this.logger.log('director.department.done', {
      distributionId: distributionPlan.distributionId,
      taskId: task.taskId,
      department: task.department,
      ok: true,
      employeeResults: settled.length,
    });
  }

  /**
   * directorPlanningActivity：部门级细化规划（当前规则版）。
   *
   * TODO(stage5): 换成 Temporal activity + 轻量 LLM 结构化输出。
   */
  private async directorPlanningActivity(
    _distributionPlan: DistributionPlan,
    task: DistributionPlan['tasks'][number],
  ): Promise<Array<{ title: string; objective: string; acceptanceCriteria: string[] }>> {
    const title = String(task.deliverable ?? task.taskId ?? '').trim() || 'Department task';
    const summary = String(task.deliverable ?? '').trim();
    const subObjectives = this.splitObjectives(summary);
    return subObjectives.map((obj, idx) => ({
      title: `${title} / Subtask ${idx + 1}`,
      objective: obj,
      acceptanceCriteria: [
        'Provide concise result summary',
        'List artifacts/links if any',
        'List blockers and next actions if not fully done',
      ],
    }));
  }

  private splitObjectives(summary: string): string[] {
    const s = (summary ?? '').trim();
    if (!s) return ['Deliver requested output for the department scope.'];
    const parts = s
      .split(/\n|；|;|。|\./g)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3);
    return parts.length ? parts : [s.slice(0, 240)];
  }

  private async safeSignal(
    parentWorkflowId: string,
    distributionPlan: DistributionPlan,
    task: DistributionPlan['tasks'][number],
    traceId: string,
    directorSignal: DirectorSignalPayload,
  ): Promise<void> {
    try {
      if (!this.config.isWorkerDirectorTemporalEnabled()) {
        this.logger.debug('director.signal.inline', {
          parentWorkflowId,
          signalType: directorSignal.signalType,
        });
        return;
      }
      await this.temporal.signalDepartmentPartialUpdate({
        traceId,
        parentWorkflowId,
        distributionId: distributionPlan.distributionId,
        distributionItemId: task.taskId,
        departmentId: String(task.department ?? ''),
        directorSignal,
      });
    } catch (e) {
      this.logger.warn('director.signal.failed', { parentWorkflowId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}
