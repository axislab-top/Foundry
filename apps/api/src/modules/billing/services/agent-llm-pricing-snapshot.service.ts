import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from '../../agents/entities/agent.entity.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { BillingService } from './billing.service.js';
import { modelPricingToSnapshotJson } from './billing-pricing-snapshot.util.js';

export type AgentLlmPricingSnapshotRpcResult = {
  /** Current effective model_pricing row as JSON (`resolvedAt` = RPC time). Null if unpriced. */
  pricingSnapshotJson: Record<string, unknown> | null;
  pricingSource: 'model_pricing';
};

/**
 * Worker-side LLM billing: optional **pre-call** snapshot RPC when the caller needs prices frozen before `billing.consumption.requested`.
 * Memory embedding 入账不依赖本 RPC：由 API Memory 路径在 embed 成功后发事件并携带 provenance + 可选快照。
 */
@Injectable()
export class AgentLlmPricingSnapshotService {
  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentsRepo: Repository<MarketplaceAgent>,
    private readonly billing: BillingService,
  ) {}

  async getForAgent(companyId: string, agentId: string): Promise<AgentLlmPricingSnapshotRpcResult> {
    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } });
    if (!agent) {
      return { pricingSnapshotJson: null, pricingSource: 'model_pricing' };
    }

    const meta = agent.metadata ?? null;
    const mpId =
      meta && typeof (meta as { marketplaceAgentId?: unknown }).marketplaceAgentId === 'string'
        ? String((meta as { marketplaceAgentId: string }).marketplaceAgentId).trim()
        : '';

    const modelNameFromAgent = (agent.llmModel ?? '').trim();

    if (!mpId) {
      if (!modelNameFromAgent) {
        return { pricingSnapshotJson: null, pricingSource: 'model_pricing' };
      }
      const pricing = await this.billing.resolveEffectiveModelPricing(companyId, modelNameFromAgent);
      if (!pricing) {
        return { pricingSnapshotJson: null, pricingSource: 'model_pricing' };
      }
      return {
        pricingSnapshotJson: modelPricingToSnapshotJson(pricing),
        pricingSource: 'model_pricing',
      };
    }

    const product = await this.marketplaceAgentsRepo.findOne({ where: { id: mpId } });
    const modelName = modelNameFromAgent || (product?.boundModelName ?? '').trim();
    if (!modelName) {
      return { pricingSnapshotJson: null, pricingSource: 'model_pricing' };
    }

    const pricing = await this.billing.resolveEffectiveModelPricing(companyId, modelName);
    if (!pricing) {
      return { pricingSnapshotJson: null, pricingSource: 'model_pricing' };
    }
    return {
      pricingSnapshotJson: modelPricingToSnapshotJson(pricing),
      pricingSource: 'model_pricing',
    };
  }
}
