import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type {
  BillingRecordedEvent,
  BudgetCriticalLowEvent,
  BudgetExceededEvent,
  BudgetWarningEvent,
} from '@contracts/events';
import { AppendBillingRecordDto } from '../dto/append-billing-record.dto.js';
import { QueryBillingRecordsDto } from '../dto/query-billing-records.dto.js';
import { BillingRecord } from '../entities/billing-record.entity.js';
import { ModelPricing } from '../entities/model-pricing.entity.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../../llm-keys/entities/llm-key-daily-usage.entity.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { BudgetService } from './budget.service.js';
import { BudgetExhaustedError } from '../errors/budget-exhausted.error.js';

function toUsageDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingRecord)
    private readonly recordRepo: Repository<BillingRecord>,
    @InjectRepository(ModelPricing)
    private readonly pricingRepo: Repository<ModelPricing>,
    @InjectRepository(LlmKey)
    private readonly llmKeyRepo: Repository<LlmKey>,
    @InjectRepository(LlmKeyDailyUsage)
    private readonly dailyUsageRepo: Repository<LlmKeyDailyUsage>,
    private readonly budgetService: BudgetService,
    private readonly messaging: MessagingService,
    private readonly cache: CacheService,
  ) {}

  async appendRecord(
    companyId: string,
    dto: AppendBillingRecordDto,
  ): Promise<{ record: BillingRecord; utilizationAfter: number }> {
    if (dto.idempotencyKey) {
      const existing = await this.recordRepo.findOne({
        where: { companyId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return {
          record: existing,
          utilizationAfter: await this.budgetService.getUtilizationRatio(companyId),
        };
      }
    }

    const pricing = dto.modelName
      ? await this.resolvePricing(companyId, dto.modelName)
      : null;

    const cost = this.computeCost(dto, pricing);
    const occurredAt = dto.occurredAt ?? new Date();

    const row = this.recordRepo.create({
      companyId,
      departmentId: dto.departmentId ?? null,
      agentId: dto.agentId ?? null,
      taskId: dto.taskId ?? null,
      skillId: dto.skillId ?? null,
      recordType: dto.recordType,
      modelName: dto.modelName ?? null,
      llmKeyId: dto.llmKeyId ?? null,
      inputTokens: dto.inputTokens ?? 0,
      outputTokens: dto.outputTokens ?? 0,
      skillCallUnits: String(dto.skillCallUnits ?? 0),
      cost: String(cost),
      currency: pricing?.currency ?? 'USD',
      idempotencyKey: dto.idempotencyKey ?? null,
      metadata: dto.metadata ?? null,
      occurredAt,
    });

    let saved: BillingRecord;
    try {
      saved = await this.recordRepo.manager.transaction(async (manager) => {
        const recordRepo = manager.getRepository(BillingRecord);
        const llmKeyRepo = manager.getRepository(LlmKey);

        const savedRecord = await recordRepo.save(row);

        await this.budgetService.applyBillingConsumptionInTransaction(
          manager,
          companyId,
          cost,
          dto.agentId ?? null,
          dto.departmentId ?? null,
        );

        // 与 billing_records 处于同一事务：避免 daily usage 更新失败导致“billing 记录已落库但 usage 未落库”的不一致。
        if (dto.llmKeyId && dto.recordType === 'llm') {
          const usedTokens = BigInt(dto.inputTokens ?? 0) + BigInt(dto.outputTokens ?? 0);
          if (usedTokens > 0n) {
            const usageDate = toUsageDateUTC(savedRecord.occurredAt);
            await manager.query(
              `
              INSERT INTO llm_key_daily_usage (llm_key_id, usage_date, used_tokens, created_at, updated_at)
              VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT (llm_key_id, usage_date)
              DO UPDATE SET
                used_tokens = llm_key_daily_usage.used_tokens + EXCLUDED.used_tokens,
                updated_at = CURRENT_TIMESTAMP
              `,
              [dto.llmKeyId, usageDate, usedTokens.toString()],
            );

            await llmKeyRepo.update(dto.llmKeyId, {
              lastUsedAt: savedRecord.occurredAt,
            } as any);
          }
        }

        return savedRecord;
      });
    } catch (e: unknown) {
      if (e instanceof BudgetExhaustedError) {
        throw e;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('uq_billing_records_company_idempotency') && dto.idempotencyKey) {
        const existing = await this.recordRepo.findOne({
          where: { companyId, idempotencyKey: dto.idempotencyKey },
        });
        if (existing) {
          return {
            record: existing,
            utilizationAfter: await this.budgetService.getUtilizationRatio(companyId),
          };
        }
      }
      throw e;
    }

    await this.budgetService.invalidateUtilizationCache(companyId);
    const utilizationAfter = await this.budgetService.getUtilizationRatio(companyId);
    await this.maybeEmitBudgetSignals(companyId, utilizationAfter);

    await this.publishRecordedEvent(saved, companyId, utilizationAfter);

    return { record: saved, utilizationAfter };
  }

  /**
   * 心跳或外部调度触发：按当前使用率重算预警/超额事件（不新增消耗记录）。
   */
  async refreshBudgetSignals(companyId: string): Promise<{ utilization: number }> {
    const utilization = await this.budgetService.getUtilizationRatio(companyId);
    await this.maybeEmitBudgetSignals(companyId, utilization);
    return { utilization };
  }

  async queryRecords(
    companyId: string,
    q: QueryBillingRecordsDto,
  ): Promise<{ items: BillingRecord[]; total: number }> {
    const qb = this.recordRepo
      .createQueryBuilder('r')
      .where('r.company_id = :companyId', { companyId });

    if (q.from) {
      qb.andWhere('r.occurred_at >= :from', { from: q.from });
    }
    if (q.to) {
      qb.andWhere('r.occurred_at <= :to', { to: q.to });
    }
    if (q.agentId) {
      qb.andWhere('r.agent_id = :agentId', { agentId: q.agentId });
    }
    if (q.modelName) {
      qb.andWhere('r.model_name = :modelName', { modelName: q.modelName });
    }
    if (q.recordType) {
      qb.andWhere('r.record_type = :recordType', { recordType: q.recordType });
    }
    if (q.departmentId) {
      qb.andWhere('r.department_id = :departmentId', { departmentId: q.departmentId });
    }
    if (q.taskId) {
      qb.andWhere('r.task_id = :taskId', { taskId: q.taskId });
    }
    if (q.skillId) {
      qb.andWhere('r.skill_id = :skillId', { skillId: q.skillId });
    }

    const total = await qb.clone().getCount();
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;
    qb.orderBy('r.occurred_at', 'DESC').take(limit).skip(offset);

    const items = await qb.getMany();
    return { items, total };
  }

  async checkAllowance(
    companyId: string,
    estimatedCost = 0,
    opts?: { agentId?: string | null; departmentId?: string | null; runId?: string | null },
  ): Promise<{
    allowed: boolean;
    utilization: number;
    reason?: string;
    remainingMin?: number;
  }> {
    void opts?.runId;
    return this.budgetService.evaluateSpendAllowance(companyId, estimatedCost, {
      agentId: opts?.agentId,
      departmentId: opts?.departmentId,
    });
  }

  private async resolvePricing(
    companyId: string,
    modelName: string,
  ): Promise<ModelPricing | null> {
    const now = new Date();
    const tenant = await this.pricingRepo
      .createQueryBuilder('mp')
      .where('mp.company_id = :cid', { cid: companyId })
      .andWhere('mp.model_name = :modelName', { modelName })
      .andWhere('mp.effective_from <= :now', { now })
      .andWhere('(mp.effective_to IS NULL OR mp.effective_to > :now)', { now })
      .orderBy('mp.effective_from', 'DESC')
      .getOne();
    if (tenant) {
      return tenant;
    }
    return this.pricingRepo
      .createQueryBuilder('mp')
      .where('mp.company_id IS NULL')
      .andWhere('mp.model_name = :modelName', { modelName })
      .andWhere('mp.effective_from <= :now', { now })
      .andWhere('(mp.effective_to IS NULL OR mp.effective_to > :now)', { now })
      .orderBy('mp.effective_from', 'DESC')
      .getOne();
  }

  private computeCost(dto: AppendBillingRecordDto, pricing: ModelPricing | null): number {
    const inTok = dto.inputTokens ?? 0;
    const outTok = dto.outputTokens ?? 0;
    const units = dto.skillCallUnits ?? 0;

    if (dto.recordType === 'skill') {
      const base = pricing ? parseFloat(pricing.skillBaseFee) : 0;
      const u = units > 0 ? units : 1;
      return Math.round(base * u * 1e6) / 1e6;
    }

    if (dto.recordType === 'embedding') {
      const p = pricing ? parseFloat(pricing.embeddingPricePerMillion) : 0;
      return Math.round((inTok / 1_000_000) * p * 1e6) / 1e6;
    }

    if (dto.recordType === 'llm' || dto.recordType === 'summary' || dto.recordType === 'other') {
      if (!pricing) {
        return 0;
      }
      const pin = parseFloat(pricing.inputPricePerMillion);
      const pout = parseFloat(pricing.outputPricePerMillion);
      const c =
        (inTok / 1_000_000) * pin + (outTok / 1_000_000) * pout;
      return Math.round(c * 1e6) / 1e6;
    }

    return 0;
  }

  private async publishRecordedEvent(
    record: BillingRecord,
    companyId: string,
    utilizationAfter: number,
  ): Promise<void> {
    const now = new Date().toISOString();
    const event: BillingRecordedEvent = {
      eventId: randomUUID(),
      eventType: 'billing.recorded',
      aggregateId: record.id,
      aggregateType: 'billing',
      occurredAt: now,
      version: 1,
      companyId,
      data: {
        companyId,
        recordId: record.id,
        recordType: record.recordType,
        cost: record.cost,
        currency: record.currency,
        utilizationAfter,
        occurredAt: record.occurredAt.toISOString(),
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'billing.recorded',
      persistent: true,
    });
  }

  private async maybeEmitBudgetSignals(
    companyId: string,
    utilization: number,
  ): Promise<void> {
    const budget = await this.budgetService.getCompanyBudget(companyId);
    if (!budget) return;

    const warn = parseFloat(budget.warningThreshold);
    const critical = parseFloat(budget.criticalThreshold ?? '0.9');
    const now = new Date().toISOString();

    if (utilization >= 1) {
      const dedupKey = `billing:exceeded_sent:v1:${companyId}`;
      if (await this.cache.get(dedupKey)) {
        return;
      }
      const event: BudgetExceededEvent = {
        eventId: randomUUID(),
        eventType: 'budget.exceeded',
        aggregateId: companyId,
        aggregateType: 'company',
        occurredAt: now,
        version: 1,
        companyId,
        data: {
          companyId,
          utilization,
          occurredAt: now,
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'budget.exceeded',
        persistent: true,
      });
      await this.cache.set(dedupKey, '1', 86400 * 7);
      return;
    }

    if (utilization >= critical && utilization < 1) {
      const dedupKey = `billing:critical_sent:v1:${companyId}`;
      if (!(await this.cache.get(dedupKey))) {
        const event: BudgetCriticalLowEvent = {
          eventId: randomUUID(),
          eventType: 'budget.critical_low',
          aggregateId: companyId,
          aggregateType: 'company',
          occurredAt: now,
          version: 1,
          companyId,
          data: {
            companyId,
            utilization,
            criticalThreshold: critical,
            occurredAt: now,
          },
        };
        await this.messaging.publish(event, {
          routingKey: 'budget.critical_low',
          persistent: true,
        });
        await this.cache.set(dedupKey, '1', 86400);
      }
    }

    if (utilization >= warn && utilization < critical) {
      const dedupKey = `billing:warn_sent:v1:${companyId}`;
      if (await this.cache.get(dedupKey)) {
        return;
      }
      const event: BudgetWarningEvent = {
        eventId: randomUUID(),
        eventType: 'budget.warning',
        aggregateId: companyId,
        aggregateType: 'company',
        occurredAt: now,
        version: 1,
        companyId,
        data: {
          companyId,
          utilization,
          warningThreshold: warn,
          occurredAt: now,
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'budget.warning',
        persistent: true,
      });
      await this.cache.set(dedupKey, '1', 86400);
    }
  }
}
