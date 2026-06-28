import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { createHash } from 'crypto';
import { ConfigService } from '../../../common/config/config.service.js';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';
import { ConversationOutputSanitizerService } from '../../collaboration/conversation-output-sanitizer.service.js';
import type {
  CompanyExecutionResult,
  CompanyHeartbeatContext,
  CompanyPlan,
  CompanyReviewResult,
} from '../dto/company-heartbeat-context.dto.js';

@Injectable()
export class CompanyReporterService {
  private readonly logger = new Logger(CompanyReporterService.name);
  private readonly lastReportHashByCompany = new Map<string, { hash: string; expireAt: number }>();

  constructor(
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
  }

  async generateAndPublishReport(params: {
    context: CompanyHeartbeatContext;
    review: CompanyReviewResult;
    plan: CompanyPlan;
    execution: CompanyExecutionResult;
  }): Promise<void> {
    const { context, review, plan, execution } = params;
    const actor = this.actor();
    const reportText = [
      `【公司心跳汇报】runId=${execution.runId}`,
      `健康分: ${review.healthScore}`,
      `完成率: ${review.completionStatus.completionRate}% | 阻塞率: ${review.completionStatus.blockedRate}% | 卡住率: ${review.completionStatus.stuckRate}%`,
      `卡住任务: ${review.stuckTasks.length > 0 ? review.stuckTasks.map((t) => `${t.title}(${t.ageHours.toFixed(1)}h)`).join(' | ') : '无'}`,
      `关键风险: ${review.keyRisks.join(' | ') || '无'}`,
      `关注点: ${review.focusAreas.join(' | ') || '无'}`,
      `下一步: ${plan.nextActions.join(' | ') || '无'}`,
    ].join('\n');
    const reportHash = createHash('sha256').update(reportText).digest('hex');
    const dedupWindowMs =
      typeof (this.config as { getCompanyHeartbeatReportDedupWindowMs?: () => number })
        .getCompanyHeartbeatReportDedupWindowMs === 'function'
        ? this.config.getCompanyHeartbeatReportDedupWindowMs()
        : 600_000;
    const now = Date.now();
    const prev = this.lastReportHashByCompany.get(context.companyId);
    const duplicateWithinWindow =
      dedupWindowMs > 0 && !!prev && prev.expireAt > now && prev.hash === reportHash;
    this.lastReportHashByCompany.set(context.companyId, {
      hash: reportHash,
      expireAt: now + Math.max(1000, dedupWindowMs),
    });
    if (this.config.isCompanyHeartbeatChatReportEnabled() && !duplicateWithinWindow) {
      try {
        const room = await this.rpc<{ id?: string } | null>('collaboration.rooms.findMain', {
          companyId: context.companyId,
          actor,
        });
        const roomId = room?.id?.trim();
        if (roomId) {
          const ceo = await this.rpc<{ items?: Array<{ id?: string }> }>('agents.findAll', {
            companyId: context.companyId,
            actor,
            role: 'ceo',
            status: 'active',
            page: 1,
            pageSize: 1,
          });
          const ceoId = ceo?.items?.[0]?.id?.trim();
          if (ceoId) {
            await this.rpc('collaboration.messages.appendAgent', {
              companyId: context.companyId,
              actor,
              roomId,
              agentId: ceoId,
              content: ConversationOutputSanitizerService.toVisibleLayer(reportText),
              messageType: 'text',
              metadata: {
                type: 'company_heartbeat_report',
                runId: execution.runId,
                triggerSource: context.triggerSource,
                healthScore: review.healthScore,
              },
            });
          }
        }
      } catch (e: unknown) {
        this.logger.warn('publish heartbeat report to collaboration failed', {
          companyId: context.companyId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (!duplicateWithinWindow) {
      await this.rpc('memory.entries.store', {
        companyId: context.companyId,
        actor,
        data: {
          namespace: 'company_runtime:reports',
          collectionLabel: `heartbeat:${context.tickAt}`,
          sourceType: 'summary',
          content: reportText,
          metadata: {
            runId: execution.runId,
            healthScore: review.healthScore,
            dispatchMode: plan.dispatchMode,
            plannerNotes: plan.plannerNotes ?? null,
            reportHash,
          },
        },
      }).catch(() => undefined);
    }

    this.logger.log('company heartbeat report generated', {
      companyId: context.companyId,
      triggerSource: context.triggerSource,
      runId: execution.runId,
      healthScore: review.healthScore,
      plannedActions: plan.nextActions.length,
      dispatchedActions: execution.dispatchedActions.length,
      duplicateWithinWindow,
    });
    if (!duplicateWithinWindow) {
      this.monitoring.incCompanyReportPublished();
    }
  }
}
