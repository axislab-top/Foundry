import { HttpException } from '@nestjs/common';
import express, { type Express } from 'express';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Server } from 'http';
import { TenantContextService } from '@service/tenant';
import { CompanyMembership } from '../../src/modules/companies/entities/company-membership.entity.js';
import { TaskRun } from '../../src/modules/tasks/entities/task-run.entity.js';
import { Task } from '../../src/modules/tasks/entities/task.entity.js';
import { TaskExecutionLog } from '../../src/modules/tasks/entities/task-execution-log.entity.js';
import { TaskExecutionService } from '../../src/modules/tasks/services/task-execution.service.js';
import { TaskRunService } from '../../src/modules/tasks/services/task-run.service.js';

/** 与 contracts/pact/pacts 中示例 UUID 对齐，便于 Pact 精确匹配 */
export const PACT_COMPANY_ID = '550e8400-e29b-41d4-a716-446655440000';
export const PACT_ACTOR_ID = '660e8400-e29b-41d4-a716-446655440001';
export const PACT_RUN_ID = '770e8400-e29b-41d4-a716-446655440002';
export const PACT_TASK_ID = '880e8400-e29b-41d4-a716-446655440003';

export interface PactHarness {
  app: Express;
  server: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * 仅用于 Pact Provider 验证：模拟 RPC 负载走 TaskRunService / TaskExecutionService（内存桩）。
 */
export async function createPactRpcHarness(): Promise<PactHarness> {
  const membershipsRepo = {
    findOne: jest.fn().mockResolvedValue({ role: 'owner', isActive: true }),
  };
  const runsRepo = {
    create: jest.fn((x: TaskRun) => x),
    save: jest.fn(async (row: TaskRun) => ({
      ...row,
      id: row.id ?? PACT_RUN_ID,
      startedAt: row.startedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    })),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const tasksRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: PACT_TASK_ID,
      companyId: PACT_COMPANY_ID,
    }),
  };
  const logsRepo = {
    create: jest.fn((x: TaskExecutionLog) => x),
    save: jest.fn(async (row: TaskExecutionLog) => ({
      ...row,
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    find: jest.fn(),
  };

  let activeCompanyId: string | null = null;
  const tenantContext = {
    getCompanyId: () => activeCompanyId,
    runWithCompanyId: async (companyId: string, fn: () => Promise<unknown>) => {
      const prev = activeCompanyId;
      activeCompanyId = companyId;
      try {
        return await fn();
      } finally {
        activeCompanyId = prev;
      }
    },
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      TaskRunService,
      TaskExecutionService,
      { provide: getRepositoryToken(TaskRun), useValue: runsRepo },
      { provide: getRepositoryToken(CompanyMembership), useValue: membershipsRepo },
      { provide: getRepositoryToken(Task), useValue: tasksRepo },
      { provide: getRepositoryToken(TaskExecutionLog), useValue: logsRepo },
      { provide: TenantContextService, useValue: tenantContext },
    ],
  }).compile();

  const taskRuns = moduleRef.get(TaskRunService);
  const execution = moduleRef.get(TaskExecutionService);

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const sendError = (res: express.Response, e: unknown) => {
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const body = e.getResponse();
      res.status(status).json(typeof body === 'object' && body !== null ? body : { message: body });
      return;
    }
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  };

  app.post('/__pact/rpc/tasks.run.start', async (req, res) => {
    try {
      const { companyId, actor, triggerSource, temporalWorkflowId, temporalRunId, metadata } =
        req.body ?? {};
      await tenantContext.runWithCompanyId(companyId, async () => {
        const out = await taskRuns.startRun(
          {
            triggerSource,
            temporalWorkflowId: temporalWorkflowId ?? null,
            temporalRunId: temporalRunId ?? null,
            metadata: metadata ?? null,
          },
          actor,
        );
        res.status(200).json(out);
      });
    } catch (e: unknown) {
      sendError(res, e);
    }
  });

  app.post('/__pact/rpc/tasks.executionLog.append', async (req, res) => {
    try {
      const { companyId, actor, id: taskId, data } = req.body ?? {};
      await tenantContext.runWithCompanyId(companyId, async () => {
        const out = await execution.appendLog(taskId, data, actor);
        res.status(200).json(out);
      });
    } catch (e: unknown) {
      sendError(res, e);
    }
  });

  return await new Promise<PactHarness>((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'));
        return;
      }
      resolve({
        app,
        server,
        port: addr.port,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res(undefined)));
          }),
      });
    });
  });
}
