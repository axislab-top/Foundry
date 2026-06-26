import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CollaborationDirectorDeptReportEvent } from '@contracts/events';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import { deptReportHasDeliverableArtifacts } from '../deliverable/l2-deliverable-gate.util.js';

const L2_AUTO_COMPLETE_DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function l2AutoCompleteDedupeKey(prefix: string, subGoalTaskId: string): string {
  return `${prefix}:collab:l2_auto_complete:v1:${subGoalTaskId}`;
}

/** Minimal shape of the distribution queue record used by resolveL2SubGoalTaskId. */
interface DistributionQueueRecord {
  distributionPlan?: {
    distributionId?: string;
    tasks?: Array<Record<string, unknown>>;
  };
  planTaskIdToChildId?: Record<string, string>;
}

@Injectable()
export class L2AutoCompleteOnDeptReportListener implements OnModuleInit {
  private readonly logger = new Logger(L2AutoCompleteOnDeptReportListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<CollaborationDirectorDeptReportEvent>(
      'collaboration.director.dept-report',
      this.handle.bind(this),
      {
        queue: 'worker-l2-auto-complete-on-dept-report',
        durable: true,
        prefetchCount: 8,
      },
    );
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    const ms = Math.max(4_000, Math.min(60_000, this.config.getApiRpcTimeoutMs()));
    return firstValueFrom(this.apiRpc.send<T>(pattern, payload).pipe(timeout({ first: ms })));
  }

  private resolveL2SubGoalTaskId(params: {
    parentGoalTaskId: string;
    department: string;
    distributionId: string;
    queue: DistributionQueueRecord | null;
  }): string | null {
    const q = params.queue;
    if (!q) return null;
    const dept = params.department.trim().toLowerCase();
    const distId = String(q.distributionPlan?.distributionId ?? '').trim();
    if (distId && distId !== params.distributionId) {
      this.logger.debug('l2_auto_complete.distribution_id_mismatch', {
        expected: distId,
        got: params.distributionId,
      });
    }
    const tasks = Array.isArray(q.distributionPlan?.tasks) ? q.distributionPlan.tasks : [];
    const row = tasks.find((t) => String((t as { department?: string }).department ?? '').trim().toLowerCase() === dept);
    const planTaskId = String((row as { taskId?: string } | undefined)?.taskId ?? '').trim();
    if (planTaskId && q.planTaskIdToChildId?.[planTaskId]) {
      return String(q.planTaskIdToChildId[planTaskId]).trim() || null;
    }
    for (const [pid, childId] of Object.entries(q.planTaskIdToChildId ?? {})) {
      const matchRow = tasks.find((t) => String((t as { taskId?: string }).taskId ?? '').trim() === pid);
      const slug = String((matchRow as { department?: string } | undefined)?.department ?? '').trim().toLowerCase();
      if (slug === dept && childId) return String(childId).trim();
    }
    return null;
  }

  private async handle(event: CollaborationDirectorDeptReportEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    const data = event.data;
    if (!companyId || !data) return;
    if (data.readyForSupervision !== true) return;

    const parentGoalTaskId = String(data.parentGoalTaskId ?? '').trim();
    const department = String(data.department ?? '').trim();
    const distributionId = String(data.distributionId ?? '').trim();
    if (!parentGoalTaskId || !department) {
      this.logger.warn('l2_auto_complete.missing_context', { companyId, parentGoalTaskId, department });
      return;
    }

    const requireDeliverable = this.config.isCollabL2AutoCompleteRequireDeliverable();
    if (requireDeliverable && !deptReportHasDeliverableArtifacts(data.artifacts)) {
      this.logger.warn('l2_auto_complete.skipped_no_deliverable_artifacts', {
        companyId,
        parentGoalTaskId,
        department,
        distributionId,
        artifactCount: Array.isArray(data.artifacts) ? data.artifacts.length : 0,
      });
      return;
    }

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        // NOTE: MainRoomDistributionDispatchExecutorService has been removed.
        // Queue resolution is not available; auto-complete is temporarily disabled.
        const queue: DistributionQueueRecord | null = null;
        const l2SubGoalTaskId = this.resolveL2SubGoalTaskId({
          parentGoalTaskId,
          department,
          distributionId,
          queue,
        });
        if (!l2SubGoalTaskId) {
          this.logger.warn('l2_auto_complete.l2_task_not_found', {
            companyId,
            parentGoalTaskId,
            department,
            distributionId,
          });
          return;
        }

        const dedupeKey = l2AutoCompleteDedupeKey(this.config.getRedisKeyPrefix(), l2SubGoalTaskId);
        const acquired = await this.redisCache.setNxPx(dedupeKey, '1', L2_AUTO_COMPLETE_DEDUPE_TTL_MS);
        if (!acquired) return;

        await this.rpc('tasks.goals.completeMainRoomDistributionChild', {
          companyId,
          actor: this.workerActor(),
          id: l2SubGoalTaskId,
          data: {
            parentGoalTaskId,
            reason: 'auto:director_dept_report_ready_for_supervision',
          },
        });

        this.logger.log('l2_auto_complete.ok', {
          companyId,
          parentGoalTaskId,
          l2SubGoalTaskId,
          department,
          distributionId,
        });
      } catch (e: unknown) {
        this.logger.warn('l2_auto_complete.failed', {
          companyId,
          parentGoalTaskId,
          department,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
