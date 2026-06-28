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
import { CompanyRuntimePreferenceService } from '../../companies/services/company-runtime-preference.service.js';
import { Brackets } from 'typeorm';

const noopRuntimePref = {
  applyFromApprovedRequest: jest.fn().mockResolvedValue(undefined),
};

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
        { provide: CompanyRuntimePreferenceService, useValue: noopRuntimePref },
      ],
    }).compile();

    const svc = mod.get(ApprovalService);
    await expect(
      svc.consumeExecutionToken({
        companyId: 'c1',
        executionTokenId: '00000000-0000-4000-8000-000000000099',
        action: 'skill:test',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(metrics.observeConsumeSeconds).toHaveBeenCalledWith('deny', expect.any(Number));
  });

  it('rejects consume when skillSlug does not match bound token (0 rows)', async () => {
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
    const mod = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: getRepositoryToken(ApprovalRequest), useValue: {} },
        { provide: getRepositoryToken(ApprovalAuditLog), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(ApprovalExecutionToken), useValue: tokenRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: ApprovalTemporalBridgeService, useValue: {} },
        {
          provide: ApprovalRedisMirrorService,
          useValue: { assertMirrorMatchesOrAbsent: jest.fn(), onConsumed: jest.fn() },
        },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: CollaborationApprovalNotifier, useValue: { pushApprovalStatus: jest.fn() } },
        { provide: ApprovalMetricsService, useValue: { observeConsumeSeconds: jest.fn(), incDecision: jest.fn() } },
        { provide: CompanyRuntimePreferenceService, useValue: noopRuntimePref },
      ],
    }).compile();
    const svc = mod.get(ApprovalService);
    await expect(
      svc.consumeExecutionToken({
        companyId: 'c1',
        executionTokenId: '00000000-0000-4000-8000-000000000099',
        action: 'runner.exec',
        skillSlug: 'wrong-skill',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects consume when Redis mirror marks token as already used (replay)', async () => {
    const tokenRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    const companyRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'c1', executionPaused: false }),
    };
    const redisMirror = {
      assertMirrorMatchesOrAbsent: jest.fn().mockRejectedValue(
        Object.assign(new Error('execution token already used (redis)'), { status: 403 }),
      ),
      onConsumed: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: getRepositoryToken(ApprovalRequest), useValue: {} },
        { provide: getRepositoryToken(ApprovalAuditLog), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(ApprovalExecutionToken), useValue: tokenRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: ApprovalTemporalBridgeService, useValue: {} },
        { provide: ApprovalRedisMirrorService, useValue: redisMirror },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: CollaborationApprovalNotifier, useValue: { pushApprovalStatus: jest.fn() } },
        { provide: ApprovalMetricsService, useValue: { observeConsumeSeconds: jest.fn(), incDecision: jest.fn() } },
        { provide: CompanyRuntimePreferenceService, useValue: noopRuntimePref },
      ],
    }).compile();
    const svc = mod.get(ApprovalService);
    await expect(
      svc.consumeExecutionToken({
        companyId: 'c1',
        executionTokenId: '00000000-0000-4000-8000-000000000099',
        action: 'runner.exec',
        skillSlug: 'code-run',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(tokenRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rejects consume when Redis mirror reports companyId mismatch (cross-tenant)', async () => {
    const tokenRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    const companyRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'c1', executionPaused: false }),
    };
    const redisMirror = {
      assertMirrorMatchesOrAbsent: jest.fn().mockRejectedValue(
        Object.assign(new Error('execution token tenant or action mismatch (redis)'), { status: 403 }),
      ),
      onConsumed: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: getRepositoryToken(ApprovalRequest), useValue: {} },
        { provide: getRepositoryToken(ApprovalAuditLog), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(ApprovalExecutionToken), useValue: tokenRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: ApprovalTemporalBridgeService, useValue: {} },
        { provide: ApprovalRedisMirrorService, useValue: redisMirror },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: CollaborationApprovalNotifier, useValue: { pushApprovalStatus: jest.fn() } },
        { provide: ApprovalMetricsService, useValue: { observeConsumeSeconds: jest.fn(), incDecision: jest.fn() } },
        { provide: CompanyRuntimePreferenceService, useValue: noopRuntimePref },
      ],
    }).compile();
    const svc = mod.get(ApprovalService);
    await expect(
      svc.consumeExecutionToken({
        companyId: 'c1',
        executionTokenId: '00000000-0000-4000-8000-000000000099',
        action: 'runner.exec',
        skillSlug: 'code-run',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(tokenRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rejects consume when token is expired or consumed (PG update affects 0 rows)', async () => {
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
    const mod = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: getRepositoryToken(ApprovalRequest), useValue: {} },
        { provide: getRepositoryToken(ApprovalAuditLog), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(ApprovalExecutionToken), useValue: tokenRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: ApprovalTemporalBridgeService, useValue: {} },
        {
          provide: ApprovalRedisMirrorService,
          useValue: { assertMirrorMatchesOrAbsent: jest.fn().mockResolvedValue(undefined), onConsumed: jest.fn() },
        },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: CollaborationApprovalNotifier, useValue: { pushApprovalStatus: jest.fn() } },
        { provide: ApprovalMetricsService, useValue: { observeConsumeSeconds: jest.fn(), incDecision: jest.fn() } },
        { provide: CompanyRuntimePreferenceService, useValue: noopRuntimePref },
      ],
    }).compile();
    const svc = mod.get(ApprovalService);
    await expect(
      svc.consumeExecutionToken({
        companyId: 'c1',
        executionTokenId: '00000000-0000-4000-8000-000000000099',
        action: 'runner.exec',
        skillSlug: 'code-run',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('ApprovalService.createExecutionToken', () => {
  it('rejects when approval is not approved', async () => {
    const reqRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'a1',
        companyId: 'c1',
        status: 'pending',
        actionType: 'runner.exec',
      }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: getRepositoryToken(ApprovalRequest), useValue: reqRepo },
        { provide: getRepositoryToken(ApprovalAuditLog), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(ApprovalExecutionToken), useValue: {} },
        {
          provide: getRepositoryToken(Company),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: 'c1', executionPaused: false }) },
        },
        { provide: ApprovalTemporalBridgeService, useValue: {} },
        { provide: ApprovalRedisMirrorService, useValue: { setMirror: jest.fn() } },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: CollaborationApprovalNotifier, useValue: { pushApprovalStatus: jest.fn() } },
        { provide: ApprovalMetricsService, useValue: { observeConsumeSeconds: jest.fn(), incDecision: jest.fn() } },
        { provide: CompanyRuntimePreferenceService, useValue: noopRuntimePref },
      ],
    }).compile();
    const svc = mod.get(ApprovalService);
    await expect(
      svc.createExecutionToken({
        companyId: 'c1',
        actorId: 'u1',
        approvalRequestId: 'a1',
        skillSlug: 'code-run',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects when actionType is not runner.exec', async () => {
    const reqRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'a1',
        companyId: 'c1',
        status: 'approved',
        actionType: 'budget.autonomous',
      }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: getRepositoryToken(ApprovalRequest), useValue: reqRepo },
        { provide: getRepositoryToken(ApprovalAuditLog), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(ApprovalExecutionToken), useValue: {} },
        {
          provide: getRepositoryToken(Company),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: 'c1', executionPaused: false }) },
        },
        { provide: ApprovalTemporalBridgeService, useValue: {} },
        { provide: ApprovalRedisMirrorService, useValue: { setMirror: jest.fn() } },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: CollaborationApprovalNotifier, useValue: { pushApprovalStatus: jest.fn() } },
        { provide: ApprovalMetricsService, useValue: { observeConsumeSeconds: jest.fn(), incDecision: jest.fn() } },
        { provide: CompanyRuntimePreferenceService, useValue: noopRuntimePref },
      ],
    }).compile();
    const svc = mod.get(ApprovalService);
    await expect(
      svc.createExecutionToken({
        companyId: 'c1',
        actorId: 'u1',
        approvalRequestId: 'a1',
        skillSlug: 'code-run',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('ApprovalService.listFiltered', () => {
  function makeModuleForList() {
    const andWhere = jest.fn().mockReturnThis();
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere,
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const reqRepo = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const auditRepo = { create: jest.fn(), save: jest.fn() };
    const tokenRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    const companyRepo = { findOne: jest.fn() };
    const temporal: Partial<ApprovalTemporalBridgeService> = {};
    const redisMirror: Partial<ApprovalRedisMirrorService> = {};
    const messaging = { publish: jest.fn() };
    const collaborationNotifier = { pushApprovalStatus: jest.fn() };
    const metrics = { observeConsumeSeconds: jest.fn(), incDecision: jest.fn() };

    return Test.createTestingModule({
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
        { provide: CompanyRuntimePreferenceService, useValue: noopRuntimePref },
      ],
    }).compile().then((m) => ({ svc: m.get(ApprovalService), qb, andWhere }));
  }

  it('applies actionTypeCsv include roots', async () => {
    const { svc, andWhere } = await makeModuleForList();
    await svc.listFiltered({
      companyId: 'c1',
      actorId: 'u1',
      scope: 'company_all',
      actionTypeCsv: 'billing,skill',
      limit: 10,
    });
    const bracketCalls = andWhere.mock.calls.map((c) => c[0]);
    expect(bracketCalls.some((x) => x instanceof Brackets)).toBe(true);
  });

  it('applies __other__ by excluding built-in action roots', async () => {
    const { svc, andWhere } = await makeModuleForList();
    await svc.listFiltered({
      companyId: 'c1',
      actorId: 'u1',
      scope: 'company_all',
      actionTypeCsv: '__other__',
      limit: 10,
    });
    const calls = andWhere.mock.calls.map((c) => String(c[0]));
    expect(calls.some((x) => x.includes('NOT ILIKE'))).toBe(true);
  });
});
