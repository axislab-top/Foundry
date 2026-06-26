import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CollaborationEmployeeDeptReportEvent, TaskCompletedEvent } from '@contracts/events';
import { COLLABORATION_EMPLOYEE_DEPT_REPORT_ROUTING_KEY } from '@contracts/events';
import { firstValueFrom, timeout } from 'rxjs';
import { DirectorAutonomousService } from '../director/director-autonomous.service.js';
import { CollaborationDeptReportService } from '../dept-report/collaboration-dept-report.service.js';

/**
 * ??????????????????
 */
@Injectable()
export class EmployeeDeptReportListener implements OnModuleInit {
  private readonly logger = new Logger(EmployeeDeptReportListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly directorAutonomous: DirectorAutonomousService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<CollaborationEmployeeDeptReportEvent>(
      COLLABORATION_EMPLOYEE_DEPT_REPORT_ROUTING_KEY,
      (event) => this.handleEmployeeReport(event),
      { queue: 'collaboration-employee-dept-report-queue', durable: true, prefetchCount: 8 },
    );
  }

  private async handleEmployeeReport(event: CollaborationEmployeeDeptReportEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.directorAutonomous.tryAggregateEmployeeDeptReports({
          companyId,
          report: event.data,
        });
      } catch (e: unknown) {
        this.logger.warn('employee_dept_report.aggregate_failed', {
          companyId,
          taskId: event.data.taskId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}

/**
 * `task.completed` ??????????????
 */
@Injectable()
export class TaskCompletedEmployeeDeptReportListener implements OnModuleInit {
  private readonly logger = new Logger(TaskCompletedEmployeeDeptReportListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly deptReports: CollaborationDeptReportService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<TaskCompletedEvent>(
      'task.completed',
      (event) => this.handle(event),
      { queue: 'task-completed-employee-dept-report-queue', durable: true, prefetchCount: 8 },
    );
  }

  private async handle(event: TaskCompletedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    const taskId = String(event.data.taskId ?? '').trim();
    if (!companyId || !taskId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      let task: Record<string, unknown>;
      try {
        task = await firstValueFrom(
          this.apiRpc.send('tasks.findOne', { companyId, id: taskId }).pipe(timeout(12_000)),
        );
      } catch {
        return;
      }
      const meta = (task.metadata ?? {}) as Record<string, unknown>;
      const assigneeType = String(task.assigneeType ?? '');
      if (assigneeType !== 'agent') return;
      const agentId = String(task.assigneeId ?? '').trim();
      if (!agentId) return;
      const delegationId = String(meta.collaborationDelegationTaskId ?? '').trim();
      const employeeInitiated = meta.employeeInitiatedSubtask === true;
      const directorInitiated = meta.directorInitiatedSubtask === true;
      if (!delegationId && !employeeInitiated && !directorInitiated) return;

      const distributionPlanTaskId = String(meta.distributionPlanTaskId ?? '').trim() || undefined;
      const distributionId =
        String(meta.distributionId ?? meta.distributionPlanId ?? '').trim() ||
        distributionPlanTaskId ||
        taskId;
      const department = String(meta.departmentSlug ?? meta.department ?? 'unknown').trim() || 'unknown';
      const parentGoalTaskId = String(task.parentId ?? event.data.parentId ?? '').trim() || undefined;
      const summary = String(task.title ?? '').trim() || `?? ${taskId} ???`;
      const rawArtifacts = meta.deliverableArtifacts;
      const artifacts = Array.isArray(rawArtifacts)
        ? rawArtifacts
            .map((a) => {
              if (!a || typeof a !== 'object') return null;
              const row = a as Record<string, unknown>;
              return {
                type: String(row.type ?? 'artifact').trim() || 'artifact',
                uri: typeof row.uri === 'string' ? row.uri : undefined,
                content: typeof row.content === 'string' ? row.content : undefined,
                fileAssetId: typeof row.fileAssetId === 'string' ? row.fileAssetId : undefined,
                label: typeof row.label === 'string' ? row.label : undefined,
              };
            })
            .filter(Boolean)
        : [];

      try {
        await this.deptReports.publishEmployeeDeptReport({
          companyId,
          traceId: String(meta.ceoTraceId ?? taskId).trim() || taskId,
          taskId,
          parentGoalTaskId,
          distributionId,
          distributionPlanTaskId,
          department,
          agentId,
          directorAgentId: typeof meta.directorAgentId === 'string' ? meta.directorAgentId : undefined,
          roomId: typeof meta.roomId === 'string' ? meta.roomId : undefined,
          status: this.deptReports.mapTaskStatusToDeptReport(String(task.status ?? 'completed')),
          summary,
          artifacts,
          metadata: { source: 'task.completed' },
        });
      } catch (e: unknown) {
        this.logger.warn('task.completed.employee_dept_report_failed', {
          companyId,
          taskId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
