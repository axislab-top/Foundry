import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getMockRepositoryProvider } from '../../../../test/utils/test-helpers.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../../llm-keys/entities/llm-key-daily-usage.entity.js';
import { MarketplaceAgentKeyBinding } from '../entities/marketplace-agent-key-binding.entity.js';
import { MarketplaceAgent } from '../entities/marketplace-agent.entity.js';
import { MarketplaceAdminService } from './marketplace-admin.service.js';

describe('MarketplaceAdminService', () => {
  it('update should reject keyBindings with mismatched model', async () => {
    const agentsProvider = getMockRepositoryProvider<MarketplaceAgent>(MarketplaceAgent);
    const bindingsProvider = getMockRepositoryProvider<MarketplaceAgentKeyBinding>(MarketplaceAgentKeyBinding);
    const llmKeysProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);

    const manager = {
      getRepository: (cls: any) => {
        if (cls === MarketplaceAgent) return agentsProvider.useValue;
        if (cls === MarketplaceAgentKeyBinding) return bindingsProvider.useValue;
        if (cls === LlmKey) return llmKeysProvider.useValue;
        throw new Error('unknown repo');
      },
    } as any;

    const dataSourceMock = {
      transaction: async (fn: any) => await fn(manager),
    } as any as DataSource;

    const agentRow: Partial<MarketplaceAgent> = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      boundModelName: 'gpt-4o',
      name: 'A',
      slug: 'a',
      pricingModel: 'free',
      priceCents: 0,
      isPublished: false,
    };

    agentsProvider.useValue.findOne.mockResolvedValue(agentRow as any);
    agentsProvider.useValue.save.mockImplementation(async (x: any) => x);

    llmKeysProvider.useValue.find.mockResolvedValue([
      { id: 'k1', modelName: 'gpt-4o-mini', dailyQuotaTokens: '100', isActive: true } as any,
    ]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketplaceAdminService,
        { provide: DataSource, useValue: dataSourceMock },
        agentsProvider,
        bindingsProvider,
        llmKeysProvider,
        dailyProvider,
      ],
    }).compile();

    const svc = moduleRef.get(MarketplaceAdminService);
    await expect(
      svc.update(agentRow.id!, {
        boundModelName: 'gpt-4o',
        keyBindings: [{ llmKeyId: 'k1', sortOrder: 0 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

