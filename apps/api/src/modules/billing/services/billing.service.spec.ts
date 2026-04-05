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
    };

    const llmKeyRepo: any = {
      update: jest.fn(),
    };

    const mockManager: any = {
      getRepository: jest.fn((entity: any) => {
        if (entity === BillingRecord) return recordRepo;
        if (entity === LlmKey) return llmKeyRepo;
        return {};
      }),
      query: jest.fn(),
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
      incrementCompanyUsed: jest.fn(),
      getUtilizationRatio: jest.fn().mockResolvedValue(0.1),
      getCompanyBudget: jest.fn().mockResolvedValue({
        totalAmount: '100',
        usedAmount: '10',
        warningThreshold: '0.8',
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
    const { service, recordRepo, messaging } = await setup({});
    const row = await service.appendRecord('c1', {
      recordType: 'llm',
      modelName: 'gpt-4o-mini',
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(row.record).toBeDefined();
    expect(recordRepo.save).toHaveBeenCalled();
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
    const { service, recordRepo, messaging } = await setup({
      findOneImpl: () => Promise.resolve(existing),
    });
    const out = await service.appendRecord('c1', {
      recordType: 'llm',
      idempotencyKey: 'k1',
      modelName: 'gpt-4o-mini',
      inputTokens: 100,
      outputTokens: 0,
    });
    expect(out.record.id).toBe('r1');
    expect(recordRepo.save).not.toHaveBeenCalled();
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
    const call = (mockManager.query as jest.Mock).mock.calls.find(() => true);
    expect(call?.[1]).toEqual([llmKeyId, expect.any(String), expect.any(String)]);
    expect(llmKeyRepo.update).toHaveBeenCalledWith(llmKeyId, expect.objectContaining({ lastUsedAt: expect.any(Date) }));
  });

  it('checkAllowance blocks when used + estimated exceeds total', async () => {
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
      ],
    }).compile();

    const service = moduleRef.get(BillingService);
    const out = await service.checkAllowance('c1', 10);
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe('budget_exhausted');
  });
});
