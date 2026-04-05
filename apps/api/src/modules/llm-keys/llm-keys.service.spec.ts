import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { LlmKeysService } from './llm-keys.service.js';
import { LlmKey } from './entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from './entities/llm-key-daily-usage.entity.js';
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    const out = await service.acquire('gpt-4o-mini');

    expect(out.llmKeyId).toBe(key2.id);
    expect(out.apiKey).toBe('decrypted-api-key');
  });

  it('acquire should throw when all keys are exhausted', async () => {
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    await expect(service.acquire('gpt-4o-mini')).rejects.toThrow(BadRequestException);
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: mockSecurityService },
        llmKeyProvider,
        dailyUsageProvider,
        llmProviderProvider,
        billingProvider,
      ],
    }).compile();

    const service = moduleRef.get(LlmKeysService);
    const out = await service.disableKey(key.id);

    expect(out.isActive).toBe(false);
    expect(out.remainingTokens).toBe('100');
    expect(out.assignedCompanyCount).toBe('2');
  });
});

