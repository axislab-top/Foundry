import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskRun } from '../../tasks/entities/task-run.entity.js';
import { SupervisorLesson } from '../entities/supervisor-lesson.entity.js';

export interface RetrospectiveDashboardSlice {
  failedRuns7d: number;
  lessonsIngested7d: number;
  repeatFailurePatterns7d: number;
  /** Rough rate in [0,1]: share of new failure signatures that matched a prior lesson hash */
  repeatFailureRate7d: number;
}

@Injectable()
export class SupervisorMetricsService {
  constructor(
    @InjectRepository(SupervisorLesson)
    private readonly lessonsRepo: Repository<SupervisorLesson>,
    @InjectRepository(TaskRun) private readonly runsRepo: Repository<TaskRun>,
  ) {}

  async getRetrospectiveSlice(companyId: string): Promise<RetrospectiveDashboardSlice> {
    const failedRuns7d = await this.runsRepo
      .createQueryBuilder('r')
      .where('r.company_id = :companyId', { companyId })
      .andWhere('r.status = :st', { st: 'failed' })
      .andWhere(`r.finished_at > NOW() - INTERVAL '7 days'`)
      .getCount();

    const lessonsIngested7d = await this.lessonsRepo
      .createQueryBuilder('l')
      .where('l.company_id = :companyId', { companyId })
      .andWhere('l.ingested_to_memory = true')
      .andWhere(`l.created_at > NOW() - INTERVAL '7 days'`)
      .getCount();

    const repeatFailurePatterns7d = await this.lessonsRepo
      .createQueryBuilder('l')
      .where('l.company_id = :companyId', { companyId })
      .andWhere('l.is_repeat_pattern = true')
      .andWhere(`l.created_at > NOW() - INTERVAL '7 days'`)
      .getCount();

    const repeatFailureRate7d =
      failedRuns7d > 0 ? Math.min(1, repeatFailurePatterns7d / failedRuns7d) : 0;

    return {
      failedRuns7d,
      lessonsIngested7d,
      repeatFailurePatterns7d,
      repeatFailureRate7d,
    };
  }
}
