import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { DataSource } from 'typeorm';
import { CompanySpaceService } from './company-space.service.js';
import { RUNNER_RPC_CLIENT } from '../../common/runner/runner-rpc.constants.js';
import { TenantContextService } from '@service/tenant';
import { MemoryService } from '../memory/services/memory.service.js';
import { DashboardBillingService } from '../billing/services/dashboard-billing.service.js';
import { ApprovalService } from '../approval/services/approval.service.js';
import { CompanyRuntimePreferenceService } from '../companies/services/company-runtime-preference.service.js';

const runtimeProviders = [
  { provide: ApprovalService, useValue: { create: jest.fn() } },
  {
    provide: CompanyRuntimePreferenceService,
    useValue: { getStoredKind: jest.fn().mockResolvedValue(null) },
  },
];

const metricsProviders = [
  { provide: DashboardBillingService, useValue: { getDailyCostTrend: jest.fn().mockResolvedValue([]) } },
  { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([{ total: 0, ok: 0, last_ok: null }]) } },
  ...runtimeProviders,
];

describe('CompanySpaceService (API)', () => {
  it('restoreFromSnapshot uses runWithCompanyId before runner RPC', async () => {
    const runWithCompanyId = jest.fn((_id: string, fn: () => unknown) => fn());
    const runnerSend = jest.fn().mockReturnValue(of({ ok: true }));
    const mod = await Test.createTestingModule({
      providers: [
        CompanySpaceService,
        { provide: RUNNER_RPC_CLIENT, useValue: { send: runnerSend } },
        { provide: MemoryService, useValue: { importMigrationBundle: jest.fn() } },
        {
          provide: TenantContextService,
          useValue: { runWithCompanyId },
        },
        ...metricsProviders,
      ],
    }).compile();
    const svc = mod.get(CompanySpaceService);
    const cid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    await svc.restoreFromSnapshot(
      { id: '00000000-0000-4000-8000-000000000001', roles: ['admin'] },
      cid,
      'snap-a',
    );
    expect(runWithCompanyId).toHaveBeenCalledWith(cid, expect.any(Function));
    expect(runnerSend).toHaveBeenCalled();
  });

  it('forwards runner 403 volume_snapshot_company_mismatch (cross-tenant restore)', async () => {
    const runWithCompanyId = jest.fn((_id: string, fn: () => unknown) => fn());
    const runnerSend = jest.fn().mockReturnValue(
      throwError(() => ({
        error: { status: 403, message: 'volume_snapshot_company_mismatch' },
      })),
    );
    const mod = await Test.createTestingModule({
      providers: [
        CompanySpaceService,
        { provide: RUNNER_RPC_CLIENT, useValue: { send: runnerSend } },
        { provide: MemoryService, useValue: { importMigrationBundle: jest.fn() } },
        {
          provide: TenantContextService,
          useValue: { runWithCompanyId },
        },
        ...metricsProviders,
      ],
    }).compile();
    const svc = mod.get(CompanySpaceService);
    await expect(
      svc.restoreFromSnapshot(
        { id: '00000000-0000-4000-8000-000000000001', roles: ['admin'] },
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'snap-x',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forwards runner 403 volume_snapshot_missing_company_label', async () => {
    const runWithCompanyId = jest.fn((_id: string, fn: () => unknown) => fn());
    const runnerSend = jest.fn().mockReturnValue(
      throwError(() => ({
        error: { status: 403, message: 'volume_snapshot_missing_company_label' },
      })),
    );
    const mod = await Test.createTestingModule({
      providers: [
        CompanySpaceService,
        { provide: RUNNER_RPC_CLIENT, useValue: { send: runnerSend } },
        { provide: MemoryService, useValue: { importMigrationBundle: jest.fn() } },
        { provide: TenantContextService, useValue: { runWithCompanyId } },
        ...metricsProviders,
      ],
    }).compile();
    const svc = mod.get(CompanySpaceService);
    await expect(
      svc.restoreFromSnapshot(
        { id: '00000000-0000-4000-8000-000000000001', roles: ['admin'] },
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'orphan',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('non-admin restore throws before tenant wrap', async () => {
    const runWithCompanyId = jest.fn();
    const mod = await Test.createTestingModule({
      providers: [
        CompanySpaceService,
        { provide: RUNNER_RPC_CLIENT, useValue: { send: jest.fn() } },
        { provide: MemoryService, useValue: { importMigrationBundle: jest.fn() } },
        { provide: TenantContextService, useValue: { runWithCompanyId } },
        ...metricsProviders,
      ],
    }).compile();
    const svc = mod.get(CompanySpaceService);
    await expect(
      svc.restoreFromSnapshot(
        { id: '00000000-0000-4000-8000-000000000002', roles: ['user'] },
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'snap',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runWithCompanyId).not.toHaveBeenCalled();
  });

  it('getWorkspaceMetrics runs tenant wrap and merges runner + billing + audit', async () => {
    const cid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const runWithCompanyId = jest.fn((_id: string, fn: () => unknown) => fn());
    const runnerSend = jest.fn().mockReturnValue(
      of({
        execMode: 'kubernetes',
        namespace: 'ns',
        warmPool: {
          enabled: true,
          targetIdleJobs: 2,
          idleJobs: [
            { name: 'w1', phase: 'Running', creationTimestamp: null, activePods: 1 },
            { name: 'w2', phase: 'Running', creationTimestamp: null, activePods: 1 },
          ],
        },
        snapshots: { count: 3, latest: { name: 'snap-a', readyToUse: true } },
        runtimeProfile: {
          clusterDefaultRuntimeKind: 'gvisor',
          gvisorRuntimeClassName: 'gvisor',
          firecrackerRuntimeClassName: null,
          firecrackerPlacementConfigured: false,
        },
      }),
    );
    const getDailyCostTrend = jest.fn().mockResolvedValue([{ date: '2026-04-12', cost: '1.5' }]);
    const query = jest.fn().mockResolvedValue([{ total: 4, ok: 3, last_ok: new Date('2026-04-10T00:00:00.000Z') }]);
    const mod = await Test.createTestingModule({
      providers: [
        CompanySpaceService,
        { provide: RUNNER_RPC_CLIENT, useValue: { send: runnerSend } },
        { provide: MemoryService, useValue: { importMigrationBundle: jest.fn() } },
        { provide: TenantContextService, useValue: { runWithCompanyId } },
        { provide: DashboardBillingService, useValue: { getDailyCostTrend } },
        { provide: DataSource, useValue: { query } },
        ...runtimeProviders,
      ],
    }).compile();
    const svc = mod.get(CompanySpaceService);
    const out = await svc.getWorkspaceMetrics(
      { id: '00000000-0000-4000-8000-000000000001', roles: ['admin'] },
      cid,
    );
    expect(runWithCompanyId).toHaveBeenCalledWith(cid, expect.any(Function));
    expect(out.warmPool.health).toBe('green');
    expect(out.warmPool.healthColor).toBe('green');
    expect(out.warmPool.currentIdle).toBe(2);
    expect(out.warmPool.target).toBe(2);
    expect(out.snapshots.total).toBe(3);
    expect(out.snapshots.successRate).toBeCloseTo(0.75);
    expect(out.costTrend).toHaveLength(1);
    expect(getDailyCostTrend).toHaveBeenCalledWith(cid, 7);
    expect(query).toHaveBeenCalled();
    expect(out.runtime.effectiveRuntimeKind).toBe('gvisor');
    expect(out.runtime.gvisorRuntimeClassName).toBe('gvisor');
  });
});
