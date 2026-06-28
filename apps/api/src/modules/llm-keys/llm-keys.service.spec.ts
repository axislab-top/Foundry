import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { LlmKeysService } from './llm-keys.service.js';
import { LlmKey } from './entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from './entities/llm-key-daily-usage.entity.js';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';
import { LlmProvider } from '../llm-providers/entities/llm-provider.entity.js';
import { BillingRecord } from '../billing/entities/billing-record.entity.js';
import { SecurityService } from '../../common/security/security.service.js';
import { createMockSecurityService } from '../../../test/utils/mock-factories.js';
import { getMockRepositoryProvider } from '../../../test/utils/test-helpers.js';

function makeEncryptedSecret(): string {
  const encrypted = Buffer.from('encrypted-secret').toString('base64');
  const iv = Buffer.from('iv').toString('base64');
  const tag = Buffer.from('tag').toString('base64');
  return Buffer.from(JSON.stringify({ encrypted, iv, tag }), 'utf8').toString('base64');
}

describe('LlmKeysService', () => {
  it('acquire should pick least-used eligible key', async () => {
    const mockSecurityService = createMockSecurityService() as any;
    const mockDecrypt = jest.fn().mockResolvedValue('decrypted-api-key');
    mockSecurityService.getEncryptionManager = jest.fn(() => ({
      decrypt: mockDecrypt,
    }));

    const llmKeyProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyUsageProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const llmProviderProvider = getMockRepositoryProvider<LlmProvider>(LlmProvider);
    const billingProvider = getMockRepositoryProvider<BillingRecord>(BillingRecord);

    const llmKeyRepo = llmKeyProvider.useValue;
    const dailyUsageRepo = dailyUsageProvider.useValue;
    const llmProviderRepo = llmProviderProvider.useValue;

    const key1: Partial<LlmKey> = {
      id: '11111111-1111-1111-1111-111111111111',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'k1',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '100',
      lastUsedAt: new Date('2025-01-01'),
    };

    const key2: Partial<LlmKey> = {
      id: '22222222-2222-2222-2222-222222222222',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'k2',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '100',
      lastUsedAt: new Date('2025-01-02'),
    };

    llmKeyRepo.find.mockResolvedValue([key1 as any, key2 as any]);
    dailyUsageRepo.find.mockResolvedValue([
      { llmKeyId: key1.id, usageDate: new Date().toISOString().slice(0, 10), usedTokens: '200' } as any,
      { llmKeyId: key2.id, usageDate: new Date().toISOString().slice(0, 10), usedTokens: '20' } as any,
    ]);
    llmKeyRepo.save.mockImplementation(async (k: any) => k);
    llmProviderRepo.find.mockResolvedValue([
      {
        code: 'openai',
        kind: 'openai',
        requestUrl: 'https://api.openai.com/v1',
      },
    ] as any);
    llmProviderRepo.findOne.mockResolvedValue({
      kind: 'openai',
      requestUrl: 'https://api.openai.com/v1',
    });

    const llmModelProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    llmModelProvider.useValue.findOne.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        llmModelProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    const out = await service.acquire('gpt-4o-mini');

    expect(out.llmKeyId).toBe(key2.id);
    expect(out.apiKey).toBe('decrypted-api-key');
  });

  it('acquire should match catalog short model name to keys registered with version suffix', async () => {
    const mockSecurityService = createMockSecurityService() as any;
    mockSecurityService.getEncryptionManager = jest.fn(() => ({
      decrypt: jest.fn().mockResolvedValue('decrypted-glm-key'),
    }));

    const llmKeyProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyUsageProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const llmProviderProvider = getMockRepositoryProvider<LlmProvider>(LlmProvider);
    const llmModelProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    const billingProvider = getMockRepositoryProvider<BillingRecord>(BillingRecord);

    const llmKeyRepo = llmKeyProvider.useValue;
    const dailyUsageRepo = dailyUsageProvider.useValue;
    const llmProviderRepo = llmProviderProvider.useValue;
    const llmModelRepo = llmModelProvider.useValue;

    const glmKey: Partial<LlmKey> = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      provider: 'GLM',
      modelName: 'glm-4-flash-250414',
      keyAlias: 'glm-1',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '0',
      lastUsedAt: null,
      llmModelId: null,
    };

    llmKeyRepo.find.mockResolvedValue([]);
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([glmKey]),
    };
    llmKeyRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    dailyUsageRepo.find.mockResolvedValue([]);
    llmKeyRepo.save.mockImplementation(async (k: any) => k);
    llmProviderRepo.find.mockResolvedValue([{ code: 'GLM', kind: 'openai', requestUrl: 'https://open.bigmodel.cn/api/paas/v4' }] as any);
    llmProviderRepo.findOne.mockResolvedValue({
      kind: 'openai',
      requestUrl: 'https://open.bigmodel.cn/api/paas/v4',
    });
    llmModelRepo.findOne.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        llmModelProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    const out = await service.acquire('glm-4-flash');

    expect(out.llmKeyId).toBe(glmKey.id);
    expect(out.modelName).toBe('glm-4-flash-250414');
    expect(out.apiKey).toBe('decrypted-glm-key');
  });

  it('acquire should still succeed when daily quota is fully used (soft warning only)', async () => {
    const mockSecurityService = createMockSecurityService() as any;
    mockSecurityService.getEncryptionManager = jest.fn(() => ({
      decrypt: jest.fn().mockResolvedValue('decrypted-api-key'),
    }));

    const llmKeyProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyUsageProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const llmProviderProvider = getMockRepositoryProvider<LlmProvider>(LlmProvider);
    const billingProvider = getMockRepositoryProvider<BillingRecord>(BillingRecord);

    const llmKeyRepo = llmKeyProvider.useValue;
    const dailyUsageRepo = dailyUsageProvider.useValue;
    const llmProviderRepo = llmProviderProvider.useValue;
    llmProviderRepo.find.mockResolvedValue([
      {
        code: 'openai',
        kind: 'openai',
        requestUrl: 'https://api.openai.com/v1',
      },
    ] as any);
    llmProviderRepo.findOne.mockResolvedValue({
      kind: 'openai',
      requestUrl: 'https://api.openai.com/v1',
    });

    const key: Partial<LlmKey> = {
      id: '33333333-3333-3333-3333-333333333333',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'k3',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '100',
      lastUsedAt: new Date('2025-01-02'),
    };

    llmKeyRepo.find.mockResolvedValue([key as any]);
    dailyUsageRepo.find.mockResolvedValue([
      { llmKeyId: key.id, usageDate: new Date().toISOString().slice(0, 10), usedTokens: '100' } as any,
    ]);

    const llmModelProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    llmModelProvider.useValue.findOne.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        llmModelProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    const out = await service.acquire('gpt-4o-mini');
    expect(out.llmKeyId).toBe(key.id);
    expect(out.warning).toBe('llm_key_daily_quota_remaining_below_15pct');
    expect(out.remainingQuotaPercent).toBe(0);
  });

  it('createKey should encrypt secret and persist key', async () => {
    const mockSecurityService = createMockSecurityService() as any;
    const mockEncrypt = jest.fn().mockResolvedValue({
      encrypted: Buffer.from('encrypted'),
      iv: Buffer.from('iv'),
      tag: Buffer.from('tag'),
    });
    mockSecurityService.getEncryptionManager = jest.fn(() => ({
      encrypt: mockEncrypt,
      decrypt: jest.fn(),
    }));

    const llmKeyProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyUsageProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const llmProviderProvider = getMockRepositoryProvider<LlmProvider>(LlmProvider);
    const billingProvider = getMockRepositoryProvider<BillingRecord>(BillingRecord);

    const llmKeyRepo = llmKeyProvider.useValue;
    llmKeyRepo.create.mockImplementation((x: any) => x);
    llmKeyRepo.save.mockImplementation(async (x: any) => ({
      ...x,
      id: 'created-key-id',
      lastUsedAt: null,
    }));

    const llmModelProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    llmModelProvider.useValue.findOne.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        llmModelProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    const out = await service.createKey({
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'alias',
      secret: 'plain-secret',
      dailyQuotaTokens: 123,
      isActive: true,
    });

    expect(out.id).toBe('created-key-id');
    expect(out.dailyQuotaTokens).toBe('123');
    expect(mockEncrypt).toHaveBeenCalled();
    expect(llmKeyRepo.save).toHaveBeenCalled();
  });

  it('disableKey should set isActive=false and recompute key stats', async () => {
    const mockSecurityService = createMockSecurityService() as any;
    mockSecurityService.getEncryptionManager = jest.fn(() => ({
      decrypt: jest.fn(),
      encrypt: jest.fn(),
    }));

    const llmKeyProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyUsageProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const llmProviderProvider = getMockRepositoryProvider<LlmProvider>(LlmProvider);
    const billingProvider = getMockRepositoryProvider<BillingRecord>(BillingRecord);

    const llmKeyRepo = llmKeyProvider.useValue;
    const dailyUsageRepo = dailyUsageProvider.useValue;
    const billingRepo = billingProvider.useValue;

    const key: any = {
      id: '44444444-4444-4444-4444-444444444444',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'k4',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '100',
      lastUsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    llmKeyRepo.findOne.mockResolvedValue(key);
    llmKeyRepo.save.mockImplementation(async (k: any) => k);
    dailyUsageRepo.findOne.mockResolvedValue(null);

    billingRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ companyCount: '2' }),
    });

    const llmModelProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    llmModelProvider.useValue.findOne.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        llmModelProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    const out = await service.disableKey(key.id);

    expect(out.isActive).toBe(false);
    expect(out.remainingTokens).toBe('100');
    expect(out.assignedCompanyCount).toBe('2');
  });

  it('listKeysGrouped with bindableOnly should exclude bound keys', async () => {
    const mockSecurityService = createMockSecurityService() as any;
    mockSecurityService.getEncryptionManager = jest.fn(() => ({
      decrypt: jest.fn(),
      encrypt: jest.fn(),
    }));

    const llmKeyProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyUsageProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const llmProviderProvider = getMockRepositoryProvider<LlmProvider>(LlmProvider);
    const llmModelProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    const billingProvider = getMockRepositoryProvider<BillingRecord>(BillingRecord);

    const llmKeyRepo = llmKeyProvider.useValue;
    const dailyUsageRepo = dailyUsageProvider.useValue;
    const llmProviderRepo = llmProviderProvider.useValue;
    const billingRepo = billingProvider.useValue;

    const freeKey: Partial<LlmKey> = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'free',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '0',
      lastUsedAt: null,
      llmModelId: null,
    };
    const boundKey: Partial<LlmKey> = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'bound',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '0',
      lastUsedAt: null,
      llmModelId: null,
    };

    const qb = {
      clone: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(2),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([freeKey, boundKey]),
    };
    llmKeyRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    llmKeyRepo.query = jest.fn().mockResolvedValue([{ llm_key_id: boundKey.id }]);
    dailyUsageRepo.find.mockResolvedValue([]);
    billingRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });
    llmModelProvider.useValue.findBy = jest.fn().mockResolvedValue([]);
    llmProviderRepo.find.mockResolvedValue([{ code: 'openai', displayName: 'OpenAI' }] as any);

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        llmModelProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    const out = await service.listKeysGrouped({ bindableOnly: true, modelType: 'chat' });

    expect(out.totalKeys).toBe(1);
    expect(out.groups[0]?.keys.map((k) => k.id)).toEqual([freeKey.id]);
  });

  it('listKeysGrouped with bindableForAgentId should keep keys bound to that agent', async () => {
    const mockSecurityService = createMockSecurityService() as any;
    mockSecurityService.getEncryptionManager = jest.fn(() => ({
      decrypt: jest.fn(),
      encrypt: jest.fn(),
    }));

    const llmKeyProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyUsageProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const llmProviderProvider = getMockRepositoryProvider<LlmProvider>(LlmProvider);
    const llmModelProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    const billingProvider = getMockRepositoryProvider<BillingRecord>(BillingRecord);

    const llmKeyRepo = llmKeyProvider.useValue;
    const dailyUsageRepo = dailyUsageProvider.useValue;
    const llmProviderRepo = llmProviderProvider.useValue;
    const billingRepo = billingProvider.useValue;

    const agentId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const ownKey: Partial<LlmKey> = {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'own',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '0',
      lastUsedAt: null,
      llmModelId: null,
    };
    const otherKey: Partial<LlmKey> = {
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'other',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '0',
      lastUsedAt: null,
      llmModelId: null,
    };
    const freeKey: Partial<LlmKey> = {
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keyAlias: 'free',
      encryptedSecret: makeEncryptedSecret(),
      isActive: true,
      dailyQuotaTokens: '0',
      lastUsedAt: null,
      llmModelId: null,
    };

    const qb = {
      clone: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(3),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([ownKey, otherKey, freeKey]),
    };
    llmKeyRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    llmKeyRepo.query = jest
      .fn()
      .mockResolvedValueOnce([{ llm_key_id: ownKey.id }, { llm_key_id: otherKey.id }])
      .mockResolvedValueOnce([
        { llm_key_id: ownKey.id, marketplace_agent_id: agentId },
        { llm_key_id: otherKey.id, marketplace_agent_id: '99999999-9999-9999-9999-999999999999' },
      ]);
    dailyUsageRepo.find.mockResolvedValue([]);
    billingRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });
    llmModelProvider.useValue.findBy = jest.fn().mockResolvedValue([]);
    llmProviderRepo.find.mockResolvedValue([{ code: 'openai', displayName: 'OpenAI' }] as any);

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        llmModelProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    const out = await service.listKeysGrouped({
      bindableForAgentId: agentId,
      modelType: 'chat',
    });

    expect(out.totalKeys).toBe(2);
    expect(out.groups[0]?.keys.map((k) => k.id).sort()).toEqual([freeKey.id, ownKey.id].sort());
  });
});

