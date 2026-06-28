import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingService } from '../../billing/services/billing.service.js';
import { modelPricingToSnapshotJson } from '../../billing/services/billing-pricing-snapshot.util.js';
import { LlmModel } from '../../llm-models/entities/llm-model.entity.js';
import type { MarketplaceAgent } from '../entities/marketplace-agent.entity.js';

export interface MarketplaceCatalogPricingView {
  inputPricePerMillion: string;
  outputPricePerMillion: string;
  currency: string;
}

@Injectable()
export class MarketplaceCatalogPricingService {
  constructor(
    private readonly billing: BillingService,
    @InjectRepository(LlmModel)
    private readonly llmModelsRepo: Repository<LlmModel>,
  ) {}

  shouldExposePricing(agent: Pick<MarketplaceAgent, 'agentCategory'>): boolean {
    return agent.agentCategory !== 'ceo';
  }

  private toView(row: {
    inputPricePerMillion: string;
    outputPricePerMillion: string;
    currency: string;
  }): MarketplaceCatalogPricingView {
    return {
      inputPricePerMillion: row.inputPricePerMillion,
      outputPricePerMillion: row.outputPricePerMillion,
      currency: row.currency,
    };
  }

  async resolveForAgent(
    agent: Pick<MarketplaceAgent, 'agentCategory' | 'boundModelName'>,
    companyId?: string | null,
  ): Promise<MarketplaceCatalogPricingView | null> {
    if (!this.shouldExposePricing(agent)) {
      return null;
    }
    const modelName = agent.boundModelName?.trim() || '';
    if (!modelName) {
      return null;
    }
    const llmModel = await this.llmModelsRepo.findOne({
      where: { modelName, isActive: true },
    });
    if (companyId) {
      const pricing = await this.billing.resolveEffectiveModelPricing(
        companyId,
        modelName,
        new Date(),
        llmModel?.id ?? null,
      );
      return pricing ? this.toView(pricing) : null;
    }
    const platform = (await this.billing.getActivePlatformCatalogPricingByModelNames([modelName])).get(
      modelName,
    );
    return platform ? this.toView(platform) : null;
  }

  async resolvePricingSnapshotForHire(
    agent: Pick<MarketplaceAgent, 'boundModelName'>,
    companyId: string,
  ): Promise<Record<string, unknown> | null> {
    const modelName = agent.boundModelName?.trim() || '';
    if (!modelName) {
      return null;
    }
    const llmModel = await this.llmModelsRepo.findOne({
      where: { modelName, isActive: true },
    });
    const pricing = await this.billing.resolveEffectiveModelPricing(
      companyId,
      modelName,
      new Date(),
      llmModel?.id ?? null,
    );
    return pricing ? modelPricingToSnapshotJson(pricing) : null;
  }

  async attachToAgents<T extends MarketplaceAgent>(
    agents: T[],
    companyId?: string | null,
  ): Promise<Array<T & { catalogPricing: MarketplaceCatalogPricingView | null }>> {
    if (!agents.length) {
      return [];
    }
    if (companyId) {
      return Promise.all(
        agents.map(async (agent) => ({
          ...agent,
          catalogPricing: await this.resolveForAgent(agent, companyId),
        })),
      );
    }
    const modelNames = [
      ...new Set(
        agents
          .filter((a) => this.shouldExposePricing(a))
          .map((a) => a.boundModelName?.trim() || '')
          .filter((n) => n.length > 0),
      ),
    ];
    const platformMap = await this.billing.getActivePlatformCatalogPricingByModelNames(modelNames);
    return agents.map((agent) => {
      if (!this.shouldExposePricing(agent)) {
        return { ...agent, catalogPricing: null };
      }
      const modelName = agent.boundModelName?.trim() || '';
      if (!modelName) {
        return { ...agent, catalogPricing: null };
      }
      const row = platformMap.get(modelName);
      return { ...agent, catalogPricing: row ? this.toView(row) : null };
    });
  }
}
