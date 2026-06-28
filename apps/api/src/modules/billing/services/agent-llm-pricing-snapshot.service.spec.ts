import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Agent } from '../../agents/entities/agent.entity.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { BillingService } from './billing.service.js';
import { AgentLlmPricingSnapshotService } from './agent-llm-pricing-snapshot.service.js';

describe('AgentLlmPricingSnapshotService', () => {
  it('resolves live model_pricing from agent.llmModel when no marketplace link', async () => {
    const agentsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'a1',
        companyId: 'c1',
        llmModel: 'gpt-4o',
        metadata: {},
      }),
    };
    const billing: Partial<BillingService> = {
      resolveEffectiveModelPricing: jest.fn().mockResolvedValue({
        modelName: 'gpt-4o',
        inputPricePerMillion: '3',
        outputPricePerMillion: '5',
        embeddingPricePerMillion: '0',
        skillBaseFee: '0',
        currency: 'USD',
        effectiveFrom: new Date(),
        effectiveTo: null,
      }),
    };

    const mod = await Test.createTestingModule({
      providers: [
        AgentLlmPricingSnapshotService,
        { provide: getRepositoryToken(Agent), useValue: agentsRepo },
        { provide: getRepositoryToken(MarketplaceAgent), useValue: { findOne: jest.fn() } },
        { provide: BillingService, useValue: billing },
      ],
    }).compile();

    const svc = mod.get(AgentLlmPricingSnapshotService);
    const out = await svc.getForAgent('c1', 'a1');
    expect(out.pricingSource).toBe('model_pricing');
    expect(out.pricingSnapshotJson?.inputPricePerMillion).toBe('3');
    expect(billing.resolveEffectiveModelPricing).toHaveBeenCalledWith('c1', 'gpt-4o');
  });

  it('uses marketplace boundModelName when agent has marketplaceAgentId and no llmModel', async () => {
    const agentsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'a1',
        companyId: 'c1',
        llmModel: null,
        metadata: { marketplaceAgentId: 'm1' },
      }),
    };
    const mpRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'm1', boundModelName: 'claude-3' }),
    };
    const billing: Partial<BillingService> = {
      resolveEffectiveModelPricing: jest.fn().mockResolvedValue({
        modelName: 'claude-3',
        inputPricePerMillion: '1',
        outputPricePerMillion: '2',
        embeddingPricePerMillion: '0',
        skillBaseFee: '0',
        currency: 'USD',
        effectiveFrom: new Date(),
        effectiveTo: null,
      }),
    };

    const mod = await Test.createTestingModule({
      providers: [
        AgentLlmPricingSnapshotService,
        { provide: getRepositoryToken(Agent), useValue: agentsRepo },
        { provide: getRepositoryToken(MarketplaceAgent), useValue: mpRepo },
        { provide: BillingService, useValue: billing },
      ],
    }).compile();

    const svc = mod.get(AgentLlmPricingSnapshotService);
    await svc.getForAgent('c1', 'a1');
    expect(billing.resolveEffectiveModelPricing).toHaveBeenCalledWith('c1', 'claude-3');
  });
});
