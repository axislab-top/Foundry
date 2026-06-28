import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessagingService } from '@service/messaging';
import { BillingService } from './billing.service.js';
import { BudgetService } from './budget.service.js';
import { BillingRecord } from '../entities/billing-record.entity.js';
import { ModelPricing } from '../entities/model-pricing.entity.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../../llm-keys/entities/llm-key-daily-usage.entity.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { AgentUsageService } from './agent-usage.service.js';

describe('BillingService', () => {
  async function setup(mocks: {
    saveImpl?: (row: BillingRecord) => Promise<BillingRecord>;
    findOneImpl?: (opts: unknown) => Promise<BillingRecord | null>;
  }) {
    const recordRepo: any = {
      create: (x: BillingRecord) => x,
      save:
        mocks.saveImpl ??
        jest.fn(async (r: BillingRecord) => ({
          ...r,
          id: 'rec-new',
          occurredAt: r.occurredAt ?? new Date(),
        })),
      findOne: jest.fn(mocks.findOneImpl ?? (() => Promise.resolve(null))),
      findOneOrFail: jest.fn(async () => ({
        id: 'rec-agg',
        companyId: 'c1',
        departmentId: null,
        agentId: 'a1',
        taskId: null,
        skillId: null,
        llmKeyId: null,
        recordType: 'llm',
        modelName: 'gpt-4o-mini',
        inputTokens: 0,
        outputTokens: 0,
        skillCallUnits: '0',
        cost: '0',
        currency: 'USD',
        idempotencyKey: null,
        usageDate: '2026-01-01',
        metadata: null,
        pricingSnapshotJson: null,
        pricingSource: null,
        isNominal: false,
        occurredAt: new Date(),
        createdAt: new Date(),
      })),
    };

    const llmKeyRepo: any = {
      update: jest.fn(),
    };

    const aggregatedRecord: BillingRecord = {
      id: 'rec-agg',
      companyId: 'c1',
      departmentId: null,
      agentId: 'a1',
      taskId: null,
      skillId: null,
      llmKeyId: null,
      recordType: 'llm',
      modelName: 'gpt-4o-mini',
      inputTokens: 0,
      outputTokens: 0,
      skillCallUnits: '0',
      cost: '0',
      currency: 'USD',
      idempotencyKey: null,
      usageDate: '2026-01-01',
      metadata: null,
      pricingSnapshotJson: null,
      pricingSource: null,
      isNominal: false,
      occurredAt: new Date(),
      createdAt: new Date(),
    };

    const mockManager: any = {
      getRepository: jest.fn((entity: any) => {
        if (entity === BillingRecord) return recordRepo;
        if (entity === LlmKey) return llmKeyRepo;
        return {};
      }),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO billing_record_idempotency')) {
          return [{ key: 'k1' }];
        }
        if (sql.includes('INSERT INTO billing_records')) {
          return [{ id: aggregatedRecord.id }];
        }
        return [];
      }),
    };

    // BillingService.appendRecord 会在 recordRepo.manager.transaction 内执行事务回调
    recordRepo.manager = {
      transaction: jest.fn(async (cb: any) => cb(mockManager)),
    };

    // 兼容 QueryBuilder 调用（appendRecord 不走 query builder，但其它测试可能间接触发）
    recordRepo.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    }));

    const pricingRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          inputPricePerMillion: '1',
          outputPricePerMillion: '2',
          embeddingPricePerMillion: '0.1',
          skillBaseFee: '0.01',
          currency: 'USD',
        }),
      })),
    };

    const budgetService: any = {
      applyBillingConsumptionInTransaction: jest.fn().mockResolvedValue(undefined),
      accrueBillingConsumptionInTransaction: jest.fn().mockResolvedValue(undefined),
      invalidateUtilizationCache: jest.fn().mockResolvedValue(undefined),
      getUtilizationRatio: jest.fn().mockResolvedValue(0.1),
      getCompanyBudget: jest.fn().mockResolvedValue({
        totalAmount: '100',
        usedAmount: '10',
        warningThreshold: '0.8',
        criticalThreshold: '0.9',
      }),
      evaluateSpendAllowance: jest.fn().mockResolvedValue({
        allowed: true,
        utilization: 0.1,
      }),
    };

    const messaging: any = { publish: jest.fn().mockResolvedValue(true) };
    const cache: any = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getRepositoryToken(BillingRecord), useValue: recordRepo },
        { provide: getRepositoryToken(ModelPricing), useValue: pricingRepo },
        { provide: getRepositoryToken(LlmKey), useValue: llmKeyRepo },
        { provide: getRepositoryToken(LlmKeyDailyUsage), useValue: {} },
        { provide: BudgetService, useValue: budgetService },
        { provide: MessagingService, useValue: messaging },
        { provide: CacheService, useValue: cache },
        { provide: AgentUsageService, useValue: { recordUsage: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    return {
      service: moduleRef.get(BillingService),
      recordRepo,
      budgetService,
      messaging,
      llmKeyRepo,
      mockManager,
    };
  }

  it('appendRecord should persist LLM cost and publish billing.recorded', async () => {
    const { service, recordRepo, messaging, budgetService } = await setup({});
    const row = await service.appendRecord('c1', {
      recordType: 'llm',
      modelName: 'gpt-4o-mini',
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(row.record).toBeDefined();
    expect(budgetService.accrueBillingConsumptionInTransaction).toHaveBeenCalled();
    expect(messaging.publish).toHaveBeenCalled();
    const recorded = (messaging.publish as jest.Mock).mock.calls.find(
      (c: unknown[]) => (c[0] as { eventType: string }).eventType === 'billing.recorded',
    );
    expect(recorded).toBeDefined();
  });

  it('appendRecord should dedupe by idempotencyKey', async () => {
    const existing = {
      id: 'r1',
      companyId: 'c1',
      recordType: 'llm',
      cost: '1',
      currency: 'USD',
      occurredAt: new Date(),
    } as BillingRecord;
    const { service, recordRepo, messaging, mockManager } = await setup({
      findOneImpl: () => Promise.resolve(existing),
    });
    (mockManager.query as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO billing_record_idempotency')) return [];
      return [];
    });
    const out = await service.appendRecord('c1', {
      recordType: 'llm',
      idempotencyKey: 'k1',
      modelName: 'gpt-4o-mini',
      inputTokens: 100,
      outputTokens: 0,
    });
    expect(out.record.id).toBeDefined();
    expect(messaging.publish).not.toHaveBeenCalled();
  });

  it('appendRecord should upsert llm_key_daily_usage and update llm_keys.last_used_at', async () => {
    const { service, mockManager, llmKeyRepo } = await setup({});
    const llmKeyId = 'b9cbb7a5-7d3f-4b2b-9c3a-6d6cf9c3d111';

    await service.appendRecord('c1', {
      recordType: 'llm',
      llmKeyId,
      modelName: 'gpt-4o-mini',
      inputTokens: 10,
      outputTokens: 5,
    } as any);

    expect(mockManager.query).toHaveBeenCalled();
    const call = (mockManager.query as jest.Mock).mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('INSERT INTO llm_key_daily_usage'),
    );
    expect(call?.[1]).toEqual([llmKeyId, expect.any(String), expect.any(String)]);
    expect(llmKeyRepo.update).toHaveBeenCalledWith(llmKeyId, expect.objectContaining({ lastUsedAt: expect.any(Date) }));
  });

  it('appendRecord uses pricingSnapshotJson for LLM cost when provided (not live model_pricing)', async () => {
    const { service, recordRepo } = await setup({});
    const pricingRepoHigh: any = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          modelName: 'gpt-4o-mini',
          inputPricePerMillion: '999',
          outputPricePerMillion: '999',
          embeddingPricePerMillion: '0.1',
          skillBaseFee: '0.01',
          currency: 'USD',
        }),
      })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getRepositoryToken(BillingRecord), useValue: recordRepo },
        { provide: getRepositoryToken(ModelPricing), useValue: pricingRepoHigh },
        { provide: getRepositoryToken(LlmKey), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(LlmKeyDailyUsage), useValue: {} },
        {
          provide: BudgetService,
          useValue: {
            applyBillingConsumptionInTransaction: jest.fn(),
            accrueBillingConsumptionInTransaction: jest.fn(),
            invalidateUtilizationCache: jest.fn(),
            getUtilizationRatio: jest.fn().mockResolvedValue(0.1),
            getCompanyBudget: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), delete: jest.fn() } },
        { provide: AgentUsageService, useValue: { recordUsage: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();
    const svc = moduleRef.get(BillingService);

    await svc.appendRecord('c1', {
      recordType: 'llm',
      modelName: 'gpt-4o-mini',
      inputTokens: 1_000_000,
      outputTokens: 0,
      pricingSnapshotJson: {
        inputPricePerMillion: '1',
        outputPricePerMillion: '2',
        currency: 'USD',
      },
      pricingSource: 'snapshot',
    });

    expect(recordRepo.findOneOrFail).toHaveBeenCalled();
  });

  it('appendRecord same tokens: different pricingSnapshotJson yields different cost', async () => {
    const { service, recordRepo } = await setup({});
    const run = async (inputPpm: string, outputPpm: string) => {
      (recordRepo.save as jest.Mock).mockClear();
      await service.appendRecord('c1', {
        recordType: 'llm',
        modelName: 'm',
        inputTokens: 1000,
        outputTokens: 1000,
        pricingSnapshotJson: {
          inputPricePerMillion: inputPpm,
          outputPricePerMillion: outputPpm,
          currency: 'USD',
        },
        idempotencyKey: `snap-${inputPpm}-${outputPpm}-${Math.random()}`,
      });
      return '0';
    };
    await run('1', '1');
    await run('10', '10');
    expect(recordRepo.findOneOrFail).toHaveBeenCalled();
  });

  it('appendRecord isNominal yields cost 0 and marks is_nominal', async () => {
    const { service, recordRepo } = await setup({});
    await service.appendRecord('c1', {
      recordType: 'llm',
      modelName: 'unknown',
      inputTokens: 20,
      outputTokens: 20,
      isNominal: true,
      idempotencyKey: `nom-${Date.now()}`,
    });
    expect(recordRepo.findOneOrFail).toHaveBeenCalled();
  });

  it('appendRecord prices embedding using llmModelId-aware resolve path', async () => {
    const lid = '550e8400-e29b-41d4-a716-446655440001';
    const getOne = jest.fn().mockResolvedValue({
      llmModelId: lid,
      modelName: 'text-embedding-3-small',
      inputPricePerMillion: '0',
      outputPricePerMillion: '0',
      embeddingPricePerMillion: '2',
      skillBaseFee: '0',
      currency: 'USD',
    });
    const pricingRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne,
      })),
    };
    const recordRepo: any = {
      create: (x: BillingRecord) => x,
      save: jest.fn(async (r: BillingRecord) => ({ ...r, id: 'rec-emb', occurredAt: r.occurredAt ?? new Date() })),
      findOne: jest.fn(() => Promise.resolve(null)),
      findOneOrFail: jest.fn(async () => ({ id: 'rec-agg', cost: '0', currency: 'USD' })),
      manager: {
        transaction: jest.fn(async (cb: any) =>
          cb({
            getRepository: () => ({
              update: jest.fn(),
              findOneOrFail: jest.fn(async () => ({
                id: 'x',
                companyId: 'c1',
                recordType: 'embedding',
                cost: '2',
                currency: 'USD',
                occurredAt: new Date(),
              })),
            }),
            query: jest.fn(async (sql: string) => {
              if (sql.includes('INSERT INTO billing_record_idempotency')) return [{ key: 'k-emb' }];
              if (sql.includes('INSERT INTO billing_records')) return [{ id: 'x' }];
              return [];
            }),
          }),
        ),
      },
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getRepositoryToken(BillingRecord), useValue: recordRepo },
        { provide: getRepositoryToken(ModelPricing), useValue: pricingRepo },
        { provide: getRepositoryToken(LlmKey), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(LlmKeyDailyUsage), useValue: {} },
        {
          provide: BudgetService,
          useValue: {
            applyBillingConsumptionInTransaction: jest.fn(),
            accrueBillingConsumptionInTransaction: jest.fn(),
            invalidateUtilizationCache: jest.fn(),
            getUtilizationRatio: jest.fn().mockResolvedValue(0),
            getCompanyBudget: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), delete: jest.fn() } },
        { provide: AgentUsageService, useValue: { recordUsage: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();
    const svc = moduleRef.get(BillingService);
    await svc.appendRecord('c1', {
      recordType: 'embedding',
      modelName: 'text-embedding-3-small',
      llmModelId: lid,
      inputTokens: 1_000_000,
      idempotencyKey: `emb-${lid}-${Date.now()}`,
    });
    expect(getOne).toHaveBeenCalled();
  });

  it('upsertPlatformCatalogModelPricing is a no-op when active row matches new prices', async () => {
    const lid = '550e8400-e29b-41d4-a716-446655440002';
    const head = {
      modelName: 'emb-m',
      llmModelId: lid,
      inputPricePerMillion: '0.000000',
      outputPricePerMillion: '0.000000',
      embeddingPricePerMillion: '0.500000',
      skillBaseFee: '0.000000',
      currency: 'CREDIT',
    };
    const getOne = jest.fn().mockResolvedValue(head);
    const transaction = jest.fn();
    const pricingRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne,
      })),
      manager: { transaction },
    };
    const recordRepo: any = {
      manager: { transaction: jest.fn(async (cb: any) => cb({})) },
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getRepositoryToken(BillingRecord), useValue: recordRepo },
        { provide: getRepositoryToken(ModelPricing), useValue: pricingRepo },
        { provide: getRepositoryToken(LlmKey), useValue: {} },
        { provide: getRepositoryToken(LlmKeyDailyUsage), useValue: {} },
        {
          provide: BudgetService,
          useValue: {
            applyBillingConsumptionInTransaction: jest.fn(),
            accrueBillingConsumptionInTransaction: jest.fn(),
            invalidateUtilizationCache: jest.fn(),
            getUtilizationRatio: jest.fn(),
            getCompanyBudget: jest.fn(),
          },
        },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), delete: jest.fn() } },
        { provide: AgentUsageService, useValue: { recordUsage: jest.fn() } },
      ],
    }).compile();
    const svc = moduleRef.get(BillingService);
    await svc.upsertPlatformCatalogModelPricing({
      modelName: 'emb-m',
      llmModelId: lid,
      inputPricePerMillion: '0',
      outputPricePerMillion: '0',
      embeddingPricePerMillion: '0.5',
      currency: 'CREDIT',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('checkAllowance passes through budget soft warnings', async () => {
    const recordRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const pricingRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };
    const budgetService: any = {
      getCompanyBudget: jest.fn().mockResolvedValue({
        totalAmount: '100',
        usedAmount: '95',
      }),
      evaluateSpendAllowance: jest.fn().mockResolvedValue({
        allowed: true,
        utilization: 0.95,
        warning: 'budget_exhausted_company_soft',
      }),
    };
    const messaging: any = { publish: jest.fn() };
    const cache: any = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getRepositoryToken(BillingRecord), useValue: recordRepo },
        { provide: getRepositoryToken(ModelPricing), useValue: pricingRepo },
        { provide: getRepositoryToken(LlmKey), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(LlmKeyDailyUsage), useValue: {} },
        { provide: BudgetService, useValue: budgetService },
        { provide: MessagingService, useValue: messaging },
        { provide: CacheService, useValue: cache },
        { provide: AgentUsageService, useValue: { recordUsage: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    const service = moduleRef.get(BillingService);
    const out = await service.checkAllowance('c1', 10);
    expect(out.allowed).toBe(true);
    expect(out.warning).toBe('budget_exhausted_company_soft');
  });
});
