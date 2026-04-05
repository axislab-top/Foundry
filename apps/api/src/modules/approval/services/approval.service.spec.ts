import { Test } from '@nestjs/testing';
import { MessagingService } from '@service/messaging';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApprovalService } from './approval.service.js';
import { ApprovalTemporalBridgeService } from './approval-temporal-bridge.service.js';
import { ApprovalRequest } from '../entities/approval-request.entity.js';
import { ApprovalAuditLog } from '../entities/approval-audit-log.entity.js';
import { ApprovalExecutionToken } from '../entities/approval-execution-token.entity.js';
import { Company } from '../../companies/entities/company.entity.js';
import { ApprovalRedisMirrorService } from './approval-redis-mirror.service.js';
import { CollaborationApprovalNotifier } from '../../collaboration/services/collaboration-approval-notifier.service.js';
import { ApprovalMetricsService } from './approval-metrics.service.js';

describe('ApprovalService.consumeExecutionToken', () => {
  it('rejects when update affects 0 rows', async () => {
    const reqRepo = {};
    const auditRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const tokenRepo = {
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      })),
      findOne: jest.fn(),
    };
    const companyRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'c1', executionPaused: false }),
    };
    const temporal: Partial<ApprovalTemporalBridgeService> = {};
    const redisMirror: Partial<ApprovalRedisMirrorService> = {
      assertMirrorMatchesOrAbsent: jest.fn().mockResolvedValue(undefined),
      onConsumed: jest.fn().mockResolvedValue(undefined),
    };
    const messaging = { publish: jest.fn().mockResolvedValue(undefined) };
    const collaborationNotifier = { pushApprovalStatus: jest.fn().mockResolvedValue(undefined) };
    const metrics = { observeConsumeSeconds: jest.fn(), incDecision: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: getRepositoryToken(ApprovalRequest), useValue: reqRepo },
        { provide: getRepositoryToken(ApprovalAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(ApprovalExecutionToken), useValue: tokenRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: ApprovalTemporalBridgeService, useValue: temporal },
        { provide: ApprovalRedisMirrorService, useValue: redisMirror },
        { provide: MessagingService, useValue: messaging },
        { provide: CollaborationApprovalNotifier, useValue: collaborationNotifier },
        { provide: ApprovalMetricsService, useValue: metrics },
      ],
    }).compile();

    const svc = mod.get(ApprovalService);
    await expect(
      svc.consumeExecutionToken({
        companyId: 'c1',
        tokenId: '00000000-0000-4000-8000-000000000099',
        action: 'skill:test',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(metrics.observeConsumeSeconds).toHaveBeenCalledWith('deny', expect.any(Number));
  });
});
