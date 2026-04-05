import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SupervisorMetricsService } from './supervisor-metrics.service.js';
import { SupervisorLesson } from '../entities/supervisor-lesson.entity.js';
import { TaskRun } from '../../tasks/entities/task-run.entity.js';

describe('SupervisorMetricsService', () => {
  it('returns retrospective slice with zeros when repos empty', async () => {
    const lessonsRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };
    const runsRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisorMetricsService,
        { provide: getRepositoryToken(SupervisorLesson), useValue: lessonsRepo },
        { provide: getRepositoryToken(TaskRun), useValue: runsRepo },
      ],
    }).compile();

    const svc = module.get(SupervisorMetricsService);
    const out = await svc.getRetrospectiveSlice('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(out.failedRuns7d).toBe(0);
    expect(out.lessonsIngested7d).toBe(0);
    expect(out.repeatFailureRate7d).toBe(0);
  });
});
