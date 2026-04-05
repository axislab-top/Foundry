import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type { ModelRoutedEvent } from '@contracts/events';
import type { AgentRole } from '../../agents/entities/agent.entity.js';
import { BillingSettings, RoutingPolicyJson } from '../entities/billing-settings.entity.js';
import { BudgetService } from './budget.service.js';

const DEFAULT_TIER: Record<AgentRole, string> = {
  ceo: 'gpt-4o',
  board_member: 'gpt-4o',
  director: 'claude-3-5-sonnet-20241022',
  executor: 'gpt-4o-mini',
};

const DEFAULT_DEGRADED: Record<AgentRole, string> = {
  ceo: 'claude-3-5-sonnet-20241022',
  board_member: 'claude-3-5-sonnet-20241022',
  director: 'gpt-4o-mini',
  executor: 'deepseek-chat',
};

@Injectable()
export class ModelRouterService {
  constructor(
    @InjectRepository(BillingSettings)
    private readonly settingsRepo: Repository<BillingSettings>,
    private readonly budgetService: BudgetService,
    private readonly messaging: MessagingService,
  ) {}

  async resolveModel(params: {
    companyId: string;
    agentRole: AgentRole;
    agentPreferredModel?: string | null;
    taskPriority?: 'low' | 'normal' | 'high' | 'urgent';
  }): Promise<{
    modelName: string;
    degraded: boolean;
    utilization: number;
    reason: string;
  }> {
    const utilization = await this.budgetService.getUtilizationRatio(params.companyId);
    const settings = await this.settingsRepo.findOne({
      where: { companyId: params.companyId },
    });
    const policy = settings?.routingPolicy ?? {};
    const degradePct = (settings?.degradeThresholdPct ?? 80) / 100;
    const degraded = utilization >= degradePct;

    if (params.agentPreferredModel?.trim()) {
      const resolved = {
        modelName: params.agentPreferredModel.trim(),
        degraded,
        utilization,
        reason: 'agent_preference',
      };
      await this.publishRouted(params.companyId, params.agentRole, resolved);
      return resolved;
    }

    if (params.taskPriority === 'low') {
      const low =
        policy.taskPriorityLowModel ??
        DEFAULT_DEGRADED.executor ??
        'gpt-4o-mini';
      const resolved = {
        modelName: low,
        degraded,
        utilization,
        reason: 'task_priority_low',
      };
      await this.publishRouted(params.companyId, params.agentRole, resolved);
      return resolved;
    }

    const tierMap = degraded
      ? { ...DEFAULT_DEGRADED, ...(policy.degradedTierByRole ?? {}) }
      : { ...DEFAULT_TIER, ...(policy.tierByRole ?? {}) };

    const modelName = tierMap[params.agentRole] ?? DEFAULT_TIER.executor;
    const fallback = settings?.fallbackModel?.trim();

    const resolved = {
      modelName: fallback && degraded ? fallback : modelName,
      degraded,
      utilization,
      reason: degraded ? 'budget_degraded' : 'role_tier',
    };

    await this.publishRouted(params.companyId, params.agentRole, resolved);

    return resolved;
  }

  private async publishRouted(
    companyId: string,
    agentRole: AgentRole,
    resolved: { modelName: string; degraded: boolean; utilization: number; reason: string },
  ): Promise<void> {
    const now = new Date().toISOString();
    const event: ModelRoutedEvent = {
      eventId: randomUUID(),
      eventType: 'model.routed',
      aggregateId: companyId,
      aggregateType: 'company',
      occurredAt: now,
      version: 1,
      companyId,
      data: {
        companyId,
        modelName: resolved.modelName,
        degraded: resolved.degraded,
        utilization: resolved.utilization,
        reason: resolved.reason,
        agentRole,
        occurredAt: now,
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'model.routed',
      persistent: true,
    });
  }

  async getSettings(companyId: string): Promise<BillingSettings | null> {
    return this.settingsRepo.findOne({ where: { companyId } });
  }

  async upsertSettings(
    companyId: string,
    patch: {
      routingPolicy?: RoutingPolicyJson;
      degradeThresholdPct?: number;
      fallbackModel?: string | null;
    },
  ): Promise<BillingSettings> {
    let row = await this.settingsRepo.findOne({ where: { companyId } });
    if (!row) {
      row = this.settingsRepo.create({
        companyId,
        routingPolicy: patch.routingPolicy ?? {},
        degradeThresholdPct: patch.degradeThresholdPct ?? 80,
        fallbackModel: patch.fallbackModel ?? null,
      });
    } else {
      if (patch.routingPolicy !== undefined) {
        row.routingPolicy = patch.routingPolicy;
      }
      if (patch.degradeThresholdPct !== undefined) {
        row.degradeThresholdPct = patch.degradeThresholdPct;
      }
      if (patch.fallbackModel !== undefined) {
        row.fallbackModel = patch.fallbackModel;
      }
    }
    return this.settingsRepo.save(row);
  }

  async ensureDefaultSettings(companyId: string): Promise<BillingSettings> {
    const existing = await this.getSettings(companyId);
    if (existing) {
      return existing;
    }
    return this.upsertSettings(companyId, {});
  }
}
