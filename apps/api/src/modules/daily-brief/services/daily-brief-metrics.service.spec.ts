import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DailyBriefMetricsService } from './daily-brief-metrics.service.js';
import { TaskRun } from '../../tasks/entities/task-run.entity.js';
import { TaskExecutionLog } from '../../tasks/entities/task-execution-log.entity.js';
import { ApprovalRequest } from '../../approval/entities/approval-request.entity.js';

describe('DailyBriefMetricsService', () => {
  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const actorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('computes success rate from run stats', async () => {
    const runsRepo = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: 'succeeded', count: '8' },
          { status: 'failed', count: '2' },
        ]),
      })),
    };
    const logsRepo = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalMs: '3600000' }),
      })),
    };
    const approvalsRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(3),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyBriefMetricsService,
        { provide: getRepositoryToken(TaskRun), useValue: runsRepo },
        { provide: getRepositoryToken(TaskExecutionLog), useValue: logsRepo },
        { provide: getRepositoryToken(ApprovalRequest), useValue: approvalsRepo },
      ],
    }).compile();

    const svc = module.get(DailyBriefMetricsService);
    const out = await svc.computeYesterdayMetrics(companyId, actorId, 'UTC');
    expect(out.tasksExecutedYesterday).toBe(8);
    expect(out.successRatePercent).toBe(80);
    expect(out.approvalsHandledYesterday).toBe(3);
    expect(out.estimatedTimeSavedHours).toBeGreaterThan(0);
  });
});
