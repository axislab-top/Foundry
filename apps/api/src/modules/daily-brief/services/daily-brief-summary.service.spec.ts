import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DailyBriefSummaryService } from './daily-brief-summary.service.js';
import { CompanyDailyBriefSnapshot } from '../entities/company-daily-brief-snapshot.entity.js';

describe('DailyBriefSummaryService', () => {
  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  const baseMetrics = {
    tasksExecutedYesterday: 5,
    successRatePercent: 80,
    approvalsHandledYesterday: 2,
    approvalsHandledCompanyYesterday: 2,
    estimatedTimeSavedHours: 1.5,
    failedRunsYesterday: 0,
  };

  it('prefers heartbeat snapshot over template', async () => {
    const snapshotsRepo = {
      findOne: jest.fn().mockResolvedValue({
        summaryText: 'CEO 摘要：昨日运行良好',
        updatedAt: new Date('2026-06-02T08:00:00Z'),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyBriefSummaryService,
        { provide: getRepositoryToken(CompanyDailyBriefSnapshot), useValue: snapshotsRepo },
      ],
    }).compile();

    const svc = module.get(DailyBriefSummaryService);
    const out = await svc.resolveYesterdaySummary(companyId, 'UTC', baseMetrics);
    expect(out.source).toBe('heartbeat');
    expect(out.text).toContain('CEO 摘要');
  });

  it('falls back to template when no snapshot', async () => {
    const snapshotsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyBriefSummaryService,
        { provide: getRepositoryToken(CompanyDailyBriefSnapshot), useValue: snapshotsRepo },
      ],
    }).compile();

    const svc = module.get(DailyBriefSummaryService);
    const out = await svc.resolveYesterdaySummary(companyId, 'UTC', baseMetrics);
    expect(out.source).toBe('template');
    expect(out.text).toContain('5 项任务运行');
  });

  it('returns empty placeholder when no activity', async () => {
    const snapshotsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyBriefSummaryService,
        { provide: getRepositoryToken(CompanyDailyBriefSnapshot), useValue: snapshotsRepo },
      ],
    }).compile();

    const svc = module.get(DailyBriefSummaryService);
    const out = await svc.resolveYesterdaySummary(companyId, 'UTC', {
      ...baseMetrics,
      tasksExecutedYesterday: 0,
      approvalsHandledYesterday: 0,
      failedRunsYesterday: 0,
    });
    expect(out.source).toBe('empty');
  });
});
