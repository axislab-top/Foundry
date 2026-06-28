import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BillingService } from '../../billing/services/billing.service.js';
import { LlmModel } from '../../llm-models/entities/llm-model.entity.js';
import { MarketplaceCatalogPricingService } from './marketplace-catalog-pricing.service.js';

describe('MarketplaceCatalogPricingService', () => {
  it('returns null catalogPricing for ceo agents', async () => {
    const billing = {
      getActivePlatformCatalogPricingByModelNames: jest.fn(),
      resolveEffectiveModelPricing: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketplaceCatalogPricingService,
        { provide: BillingService, useValue: billing },
        { provide: getRepositoryToken(LlmModel), useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    const svc = moduleRef.get(MarketplaceCatalogPricingService);
    const view = await svc.resolveForAgent({ agentCategory: 'ceo', boundModelName: 'gpt-4o' });
    expect(view).toBeNull();
    expect(billing.getActivePlatformCatalogPricingByModelNames).not.toHaveBeenCalled();
  });

  it('attachToAgents omits pricing for ceo and resolves employee model', async () => {
    const billing = {
      getActivePlatformCatalogPricingByModelNames: jest.fn().mockResolvedValue(
        new Map([
          [
            'gpt-4o',
            {
              inputPricePerMillion: '1',
              outputPricePerMillion: '2',
              embeddingPricePerMillion: '0',
              currency: 'CREDIT',
            },
          ],
        ]),
      ),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketplaceCatalogPricingService,
        { provide: BillingService, useValue: billing },
        { provide: getRepositoryToken(LlmModel), useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    const svc = moduleRef.get(MarketplaceCatalogPricingService);
    const out = await svc.attachToAgents([
      { agentCategory: 'ceo', boundModelName: 'gpt-4o' } as any,
      { agentCategory: 'employee', boundModelName: 'gpt-4o' } as any,
    ]);
    expect(out[0].catalogPricing).toBeNull();
    expect(out[1].catalogPricing).toEqual({
      inputPricePerMillion: '1',
      outputPricePerMillion: '2',
      currency: 'CREDIT',
    });
  });
});
