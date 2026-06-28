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

describe('LlmKeysService embedding reject', () => {
  it('rejects embedding model for acquire()', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmKeysService,
        { provide: SecurityService, useValue: createMockSecurityService() },
        getMockRepositoryProvider<LlmKey>(LlmKey),
        getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage),
        getMockRepositoryProvider<LlmProvider>(LlmProvider),
        getMockRepositoryProvider<BillingRecord>(BillingRecord),
      ],
    }).compile();
    const service = moduleRef.get(LlmKeysService);
    await expect(service.acquire('Qwen3-Embedding-8B')).rejects.toBeInstanceOf(BadRequestException);
  });
});

