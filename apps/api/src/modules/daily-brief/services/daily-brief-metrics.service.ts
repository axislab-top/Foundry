import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalRequest } from '../../approval/entities/approval-request.entity.js';
import { TaskRun } from '../../tasks/entities/task-run.entity.js';
import { TaskExecutionLog } from '../../tasks/entities/task-execution-log.entity.js';
import { getCompanyDayBounds } from '../utils/daily-brief-time.util.js';

export type DailyBriefKeyMetrics = {
  tasksExecutedYesterday: number;
  successRatePercent: number | null;
  approvalsHandledYesterday: number;
  approvalsHandledCompanyYesterday: number;
  estimatedTimeSavedHours: number;
  failedRunsYesterday: number;
};

@Injectable()
export class DailyBriefMetricsService {
  constructor(
    @InjectRepository(TaskRun) private readonly runsRepo: Repository<TaskRun>,
    @InjectRepository(TaskExecutionLog)
    private readonly logsRepo: Repository<TaskExecutionLog>,
    @InjectRepository(ApprovalRequest)
    private readonly approvalsRepo: Repository<ApprovalRequest>,
  ) {}

  async computeYesterdayMetrics(
    companyId: string,
    actorId: string,
    timezone: string,
  ): Promise<DailyBriefKeyMetrics> {
    const { startUtc, endUtc } = getCompanyDayBounds(timezone, -1);

    const [runStats, durationRow, userApprovals, companyApprovals] = await Promise.all([
      this.runsRepo
        .createQueryBuilder('r')
        .select('r.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('r.company_id = :companyId', { companyId })
        .andWhere('r.finished_at >= :start', { start: startUtc })
        .andWhere('r.finished_at < :end', { end: endUtc })
        .andWhere('r.status IN (:...st)', { st: ['succeeded', 'failed'] })
        .groupBy('r.status')
        .getRawMany<{ status: string; count: string }>(),
      this.logsRepo
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.duration_ms), 0)', 'totalMs')
        .where('l.company_id = :companyId', { companyId })
        .andWhere('l.created_at >= :start', { start: startUtc })
        .andWhere('l.created_at < :end', { end: endUtc })
        .getRawOne<{ totalMs: string }>(),
      this.countResolvedApprovals(companyId, actorId, startUtc, endUtc),
      this.countResolvedApprovals(companyId, null, startUtc, endUtc),
    ]);

    let succeeded = 0;
    let failed = 0;
    for (const row of runStats) {
      const n = parseInt(row.count, 10);
      if (row.status === 'succeeded') succeeded = n;
      if (row.status === 'failed') failed = n;
    }

    const totalTerminal = succeeded + failed;
    const successRatePercent =
      totalTerminal > 0 ? Math.round((succeeded / totalTerminal) * 1000) / 10 : null;

    const totalMs = parseInt(durationRow?.totalMs ?? '0', 10);
    let estimatedTimeSavedHours = 0;
    if (totalMs > 0) {
      estimatedTimeSavedHours = Math.round(((totalMs / 3_600_000) * 0.35) * 10) / 10;
    } else if (succeeded > 0) {
      estimatedTimeSavedHours = Math.round(succeeded * 0.25 * 10) / 10;
    }

    const approvalsHandledYesterday =
      userApprovals > 0 ? userApprovals : companyApprovals;

    return {
      tasksExecutedYesterday: succeeded,
      successRatePercent,
      approvalsHandledYesterday,
      approvalsHandledCompanyYesterday: companyApprovals,
      estimatedTimeSavedHours,
      failedRunsYesterday: failed,
    };
  }

  private async countResolvedApprovals(
    companyId: string,
    actorId: string | null,
    startUtc: Date,
    endUtc: Date,
  ): Promise<number> {
    const qb = this.approvalsRepo
      .createQueryBuilder('req')
      .where('req.company_id = :companyId', { companyId })
      .andWhere('req.status IN (:...st)', { st: ['approved', 'rejected'] })
      .andWhere('req.resolved_at >= :start', { start: startUtc })
      .andWhere('req.resolved_at < :end', { end: endUtc });
    if (actorId) {
      qb.andWhere('req.resolved_by = :actorId', { actorId });
    }
    return qb.getCount();
  }
}
