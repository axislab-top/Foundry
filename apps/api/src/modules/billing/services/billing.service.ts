import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
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
import { BILLING_CURRENCY } from '../billing-currency.js';
import { AppendBillingRecordDto } from '../dto/append-billing-record.dto.js';
import { QueryBillingRecordsDto } from '../dto/query-billing-records.dto.js';
import { BillingRecord } from '../entities/billing-record.entity.js';
import { ModelPricing } from '../entities/model-pricing.entity.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../../llm-keys/entities/llm-key-daily-usage.entity.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { BudgetService } from './budget.service.js';
import {
  modelPricingToSnapshotJson,
  tryComputeCostFromPricingSnapshotJson,
} from './billing-pricing-snapshot.util.js';
function toUsageDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** 平台目录 `model_pricing`（company_id IS NULL）写入用：与 numeric 列精度一致 */
export function formatCatalogPricePerMillion(n: number | null | undefined): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0;
  return v.toFixed(6);
}

export type PlatformCatalogModelPricingRow = {
  inputPricePerMillion: string;
  outputPricePerMillion: string;
  embeddingPricePerMillion: string;
  currency: string;
};

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
    private readonly moduleRef: ModuleRef,
  ) {}

  async appendRecord(
    companyId: string,
    dto: AppendBillingRecordDto,
  ): Promise<{ record: BillingRecord; utilizationAfter: number }> {
    const occurredAt = dto.occurredAt ?? new Date();
    const usageDate = toUsageDateUTC(occurredAt);

    const resolved = await this.resolveCostCurrencyAndSnapshots(companyId, dto);
    const cost = resolved.cost;
    const currency = resolved.currency;
    const pricingSnapshotJson = resolved.pricingSnapshotJson;
    const pricingSource = resolved.pricingSource;
    const isNominal = resolved.isNominal;
    let deduped = false;

    const saved = await this.recordRepo.manager.transaction(async (manager) => {
      const llmKeyRepo = manager.getRepository(LlmKey);
      if (dto.idempotencyKey) {
        const inserted = await manager.query<Array<{ key: string }>>(
          `
          INSERT INTO billing_record_idempotency (company_id, idempotency_key, created_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (company_id, idempotency_key) DO NOTHING
          RETURNING idempotency_key AS key
          `,
          [companyId, dto.idempotencyKey],
        );
        if (inserted.length === 0) {
          deduped = true;
          return this.loadAggregatedRecord(companyId, dto.agentId ?? null, dto.recordType, usageDate);
        }
      }

      const rows = await manager.query<Array<{ id: string }>>(
        `
        INSERT INTO billing_records (
          company_id, department_id, agent_id, task_id, skill_id, record_type, model_name, llm_key_id,
          input_tokens, output_tokens, skill_call_units, cost, currency, idempotency_key, metadata,
          pricing_snapshot_json, pricing_source, is_nominal, usage_date, occurred_at, created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11::numeric, $12::numeric, $13, $14, $15::jsonb,
          $16::jsonb, $17, $18, $19::date, $20, CURRENT_TIMESTAMP
        )
        ON CONFLICT (company_id, agent_id, usage_date, record_type, is_nominal)
        WHERE agent_id IS NOT NULL
        DO UPDATE SET
          input_tokens = billing_records.input_tokens + EXCLUDED.input_tokens,
          output_tokens = billing_records.output_tokens + EXCLUDED.output_tokens,
          skill_call_units = billing_records.skill_call_units + EXCLUDED.skill_call_units,
          cost = billing_records.cost + EXCLUDED.cost,
          occurred_at = GREATEST(billing_records.occurred_at, EXCLUDED.occurred_at),
          metadata = COALESCE(EXCLUDED.metadata, billing_records.metadata),
          pricing_snapshot_json = COALESCE(EXCLUDED.pricing_snapshot_json, billing_records.pricing_snapshot_json),
          pricing_source = COALESCE(EXCLUDED.pricing_source, billing_records.pricing_source)
        RETURNING id
        `,
        [
          companyId,
          dto.departmentId ?? null,
          dto.agentId ?? null,
          dto.taskId ?? null,
          dto.skillId ?? null,
          dto.recordType,
          dto.modelName ?? null,
          dto.llmKeyId ?? null,
          dto.inputTokens ?? 0,
          dto.outputTokens ?? 0,
          String(dto.skillCallUnits ?? 0),
          String(cost),
          currency,
          dto.idempotencyKey ?? null,
          dto.metadata ? JSON.stringify(dto.metadata) : null,
          pricingSnapshotJson ? JSON.stringify(pricingSnapshotJson) : null,
          pricingSource,
          isNominal,
          usageDate,
          occurredAt,
        ],
      );

      const savedRecord = await manager.getRepository(BillingRecord).findOneOrFail({
        where: { id: rows[0].id },
      });

      await this.budgetService.accrueBillingConsumptionInTransaction(
        manager,
        companyId,
        cost,
        dto.agentId ?? null,
        dto.departmentId ?? null,
      );

      // 与 billing_records 处于同一事务：避免 daily usage 更新失败导致“billing 记录已落库但 usage 未落库”的不一致。
      // 名义占位 token 不计入 llm_key 日用量，避免污染密钥统计。
      if (!isNominal && dto.llmKeyId && dto.recordType === 'llm') {
        const usedTokens = BigInt(dto.inputTokens ?? 0) + BigInt(dto.outputTokens ?? 0);
        if (usedTokens > 0n) {
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

    const utilizationAfter = await this.budgetService.getUtilizationRatio(companyId);
    if (!deduped) {
      await this.publishRecordedEvent(saved, companyId, utilizationAfter);
      if (
        dto.recordType === 'llm' &&
        dto.agentId &&
        ((dto.inputTokens ?? 0) > 0 || (dto.outputTokens ?? 0) > 0)
      ) {
        await this.recordAgentUsage(
          companyId,
          dto.agentId,
          dto.inputTokens ?? 0,
          dto.outputTokens ?? 0,
          dto.modelName ?? '',
        );
      }
    }

    return { record: saved, utilizationAfter };
  }

  /** Lazy resolve breaks ESM cycle: agent-usage.service imports BillingService. */
  private async recordAgentUsage(
    companyId: string,
    agentId: string,
    inputTokens: number,
    outputTokens: number,
    modelName: string,
  ): Promise<void> {
    const { AgentUsageService } = await import('./agent-usage.service.js');
    const agentUsage = this.moduleRef.get(AgentUsageService, { strict: false });
    await agentUsage.recordUsage(companyId, agentId, inputTokens, outputTokens, modelName);
  }

  /**
   * 心跳或外部调度触发：按当前使用率重算预警/超额事件（不新增消耗记录）。
   */
  async refreshBudgetSignals(companyId: string): Promise<{ utilization: number }> {
    await this.budgetService.settleAccruedConsumption(companyId);
    const utilization = await this.budgetService.getUtilizationRatio(companyId);
    await this.maybeEmitBudgetSignals(companyId, utilization);
    return { utilization };
  }

  private async loadAggregatedRecord(
    companyId: string,
    agentId: string | null,
    recordType: AppendBillingRecordDto['recordType'],
    usageDate: string,
  ): Promise<BillingRecord> {
    if (agentId) {
      const found = await this.recordRepo.findOne({
        where: { companyId, agentId, recordType, usageDate },
        order: { occurredAt: 'DESC' },
      });
      if (found) {
        return found;
      }
    }
    return this.recordRepo.findOneOrFail({
      where: { companyId, recordType, usageDate },
      order: { occurredAt: 'DESC' },
    });
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
    if (q.usageDate) {
      qb.andWhere('r.usage_date = :usageDate', { usageDate: q.usageDate });
    }
    if (q.excludeNominal !== false) {
      qb.andWhere('r.is_nominal = false');
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
    warning?: string;
    warnings?: string[];
    remainingMin?: number;
    remainingBudgetPercent?: number;
  }> {
    void opts?.runId;
    return this.budgetService.evaluateSpendAllowance(companyId, estimatedCost, {
      agentId: opts?.agentId,
      departmentId: opts?.departmentId,
    });
  }

  /**
   * 解析 cost / 货币 / 定价快照来源。名义记录 cost=0，不占预算（BudgetService 对 0 为 no-op）。
   */
  private async resolveCostCurrencyAndSnapshots(
    companyId: string,
    dto: AppendBillingRecordDto,
  ): Promise<{
    cost: number;
    currency: string;
    pricingSnapshotJson: Record<string, unknown> | null;
    pricingSource: string | null;
    isNominal: boolean;
  }> {
    const isNominal = dto.isNominal === true;

    if (isNominal) {
      return {
        cost: 0,
        currency: BILLING_CURRENCY,
        pricingSnapshotJson: dto.pricingSnapshotJson ?? { reason: 'nominal_placeholder' },
        pricingSource: 'nominal',
        isNominal: true,
      };
    }

    if (typeof dto.cost === 'number' && Number.isFinite(dto.cost)) {
      const c = Math.max(0, dto.cost);
      const cur =
        typeof dto.pricingSnapshotJson?.currency === 'string'
          ? (dto.pricingSnapshotJson.currency as string)
          : BILLING_CURRENCY;
      return {
        cost: c,
        currency: cur,
        pricingSnapshotJson: dto.pricingSnapshotJson ?? null,
        pricingSource: dto.pricingSource ?? 'explicit_cost',
        isNominal: false,
      };
    }

    if (dto.pricingSnapshotJson && Object.keys(dto.pricingSnapshotJson).length > 0) {
      const fromSnap = tryComputeCostFromPricingSnapshotJson(dto, dto.pricingSnapshotJson);
      if (fromSnap !== null) {
        return {
          cost: fromSnap.cost,
          currency: fromSnap.currency,
          pricingSnapshotJson: dto.pricingSnapshotJson,
          pricingSource: dto.pricingSource ?? 'snapshot',
          isNominal: false,
        };
      }
    }

    const pricing =
      dto.modelName?.trim() || dto.llmModelId
        ? await this.resolvePricing(companyId, dto.modelName?.trim() ?? '', new Date(), dto.llmModelId ?? null)
        : null;

    const cost = this.computeCost(dto, pricing);
    const snap = pricing ? modelPricingToSnapshotJson(pricing) : null;

    return {
      cost,
      currency: pricing?.currency ?? BILLING_CURRENCY,
      pricingSnapshotJson: snap,
      pricingSource: pricing ? 'model_pricing' : 'unpriced',
      isNominal: false,
    };
  }

  /**
   * Effective model_pricing row for a model name at a point in time (tenant override, else platform default).
   */
  async resolveEffectiveModelPricing(
    companyId: string,
    modelName: string,
    asOf: Date = new Date(),
    llmModelId?: string | null,
  ): Promise<ModelPricing | null> {
    return this.resolvePricing(companyId, modelName, asOf, llmModelId ?? null);
  }

  /**
   * 当前生效的平台目录价（company_id IS NULL），按 `llm_models.id` 批量查（优先于按名）。
   */
  async getActivePlatformCatalogPricingByLlmModelIds(
    llmModelIds: string[],
  ): Promise<Map<string, PlatformCatalogModelPricingRow>> {
    const uniq = [...new Set(llmModelIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
    const out = new Map<string, PlatformCatalogModelPricingRow>();
    if (!uniq.length) return out;
    const now = new Date();
    const rows = await this.pricingRepo
      .createQueryBuilder('mp')
      .where('mp.company_id IS NULL')
      .andWhere('mp.llm_model_id IN (:...uniq)', { uniq })
      .andWhere('mp.effective_from <= :now', { now })
      .andWhere('(mp.effective_to IS NULL OR mp.effective_to > :now)', { now })
      .orderBy('mp.llm_model_id', 'ASC')
      .addOrderBy('mp.effective_from', 'DESC')
      .getMany();
    for (const r of rows) {
      const id = r.llmModelId ? String(r.llmModelId) : '';
      if (!id || out.has(id)) continue;
      out.set(id, {
        inputPricePerMillion: r.inputPricePerMillion,
        outputPricePerMillion: r.outputPricePerMillion,
        embeddingPricePerMillion: r.embeddingPricePerMillion,
        currency: r.currency,
      });
    }
    return out;
  }

  /**
   * 当前生效的平台目录价（company_id IS NULL），用于 Admin 模型列表展示 / 编辑回填。
   * 每个 modelName 仅返回 effective_from 最新的一条（legacy：llm_model_id IS NULL 的按名行）。
   */
  async getActivePlatformCatalogPricingByModelNames(
    modelNames: string[],
  ): Promise<Map<string, PlatformCatalogModelPricingRow>> {
    const uniq = [...new Set(modelNames.map((x) => String(x ?? '').trim()).filter(Boolean))];
    const out = new Map<string, PlatformCatalogModelPricingRow>();
    if (!uniq.length) return out;
    const now = new Date();
    const rows = await this.pricingRepo
      .createQueryBuilder('mp')
      .where('mp.company_id IS NULL')
      .andWhere('mp.model_name IN (:...uniq)', { uniq })
      .andWhere('mp.effective_from <= :now', { now })
      .andWhere('(mp.effective_to IS NULL OR mp.effective_to > :now)', { now })
      .orderBy('mp.model_name', 'ASC')
      .addOrderBy('mp.effective_from', 'DESC')
      .getMany();
    for (const r of rows) {
      if (out.has(r.modelName)) continue;
      out.set(r.modelName, {
        inputPricePerMillion: r.inputPricePerMillion,
        outputPricePerMillion: r.outputPricePerMillion,
        embeddingPricePerMillion: r.embeddingPricePerMillion,
        currency: r.currency,
      });
    }
    return out;
  }

  /**
   * 写入/更新平台目录 `model_pricing`（company_id IS NULL）。
   * 关闭当前未结束的版本行并插入新版本，保证与 {@link resolvePricing} 的「取最新有效行」语义一致。
   */
  async upsertPlatformCatalogModelPricing(params: {
    modelName: string;
    llmModelId?: string | null;
    inputPricePerMillion: string;
    outputPricePerMillion: string;
    embeddingPricePerMillion?: string;
    skillBaseFee?: string;
    currency?: string;
  }): Promise<void> {
    const modelName = String(params.modelName ?? '').trim();
    const lid = params.llmModelId?.trim() || null;
    if (!modelName && !lid) {
      return;
    }
    const now = new Date();
    const inputPricePerMillion = formatCatalogPricePerMillion(parseFloat(params.inputPricePerMillion));
    const outputPricePerMillion = formatCatalogPricePerMillion(parseFloat(params.outputPricePerMillion));
    const embeddingPricePerMillion = formatCatalogPricePerMillion(
      parseFloat(params.embeddingPricePerMillion ?? '0'),
    );
    const skillBaseFee = formatCatalogPricePerMillion(parseFloat(params.skillBaseFee ?? '0'));
    const currency = (params.currency ?? BILLING_CURRENCY).trim().slice(0, 8) || BILLING_CURRENCY;

    const headQb = this.pricingRepo
      .createQueryBuilder('mp')
      .where('mp.company_id IS NULL')
      .andWhere('mp.effective_to IS NULL');
    if (lid) {
      headQb.andWhere('(mp.llm_model_id = :lid OR (mp.llm_model_id IS NULL AND mp.model_name = :modelName))', {
        lid,
        modelName,
      });
    } else {
      headQb.andWhere('mp.model_name = :modelName AND mp.llm_model_id IS NULL', { modelName });
    }
    const head = await headQb.orderBy('mp.effective_from', 'DESC').getOne();
    if (
      head &&
      head.inputPricePerMillion === inputPricePerMillion &&
      head.outputPricePerMillion === outputPricePerMillion &&
      head.embeddingPricePerMillion === embeddingPricePerMillion &&
      head.skillBaseFee === skillBaseFee &&
      head.currency === currency &&
      (lid ? head.llmModelId === lid : head.llmModelId == null) &&
      head.modelName === (modelName || head.modelName)
    ) {
      return;
    }

    await this.pricingRepo.manager.transaction(async (em) => {
      const closeQb = em
        .createQueryBuilder()
        .update(ModelPricing)
        .set({ effectiveTo: now })
        .where('company_id IS NULL')
        .andWhere('effective_to IS NULL');
      if (lid) {
        closeQb.andWhere('(llm_model_id = :lid OR (llm_model_id IS NULL AND model_name = :modelName))', {
          lid,
          modelName,
        });
      } else {
        closeQb.andWhere('model_name = :modelName AND llm_model_id IS NULL', { modelName });
      }
      await closeQb.execute();

      await em.save(
        em.create(ModelPricing, {
          companyId: null,
          modelName: modelName || head?.modelName || 'unknown',
          llmModelId: lid,
          inputPricePerMillion,
          outputPricePerMillion,
          embeddingPricePerMillion,
          skillBaseFee,
          currency,
          effectiveFrom: now,
          effectiveTo: null,
        }),
      );
    });
  }

  private async resolvePricing(
    companyId: string,
    modelName: string,
    asOf: Date,
    llmModelId?: string | null,
  ): Promise<ModelPricing | null> {
    const now = asOf;
    const lid = llmModelId?.trim() || '';

    if (lid) {
      const tenantById = await this.pricingRepo
        .createQueryBuilder('mp')
        .where('mp.company_id = :cid', { cid: companyId })
        .andWhere('mp.llm_model_id = :lid', { lid })
        .andWhere('mp.effective_from <= :now', { now })
        .andWhere('(mp.effective_to IS NULL OR mp.effective_to > :now)', { now })
        .orderBy('mp.effective_from', 'DESC')
        .getOne();
      if (tenantById) {
        return tenantById;
      }
      const platformById = await this.pricingRepo
        .createQueryBuilder('mp')
        .where('mp.company_id IS NULL')
        .andWhere('mp.llm_model_id = :lid', { lid })
        .andWhere('mp.effective_from <= :now', { now })
        .andWhere('(mp.effective_to IS NULL OR mp.effective_to > :now)', { now })
        .orderBy('mp.effective_from', 'DESC')
        .getOne();
      if (platformById) {
        return platformById;
      }
    }

    const name = String(modelName ?? '').trim();
    if (!name) {
      return null;
    }

    const tenant = await this.pricingRepo
      .createQueryBuilder('mp')
      .where('mp.company_id = :cid', { cid: companyId })
      .andWhere('mp.model_name = :modelName', { modelName: name })
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
      .andWhere('mp.model_name = :modelName', { modelName: name })
      .andWhere('mp.effective_from <= :now', { now })
      .andWhere('(mp.effective_to IS NULL OR mp.effective_to > :now)', { now })
      .orderBy('mp.effective_from', 'DESC')
      .getOne();
  }

  private computeCost(dto: AppendBillingRecordDto, pricing: ModelPricing | null): number {
    if (typeof dto.cost === 'number' && Number.isFinite(dto.cost)) {
      return Math.max(0, dto.cost);
    }
    const inTok = dto.inputTokens ?? 0;
    const outTok = dto.outputTokens ?? 0;
    const units = dto.skillCallUnits ?? 0;

    if (dto.recordType === 'skill') {
      const base = pricing ? parseFloat(pricing.skillBaseFee) : 0;
      const u = units > 0 ? units : 1;
      return Math.round(base * u * 1e6) / 1e6;
    }

    if (dto.recordType === 'agent_day') {
      // Without explicit cost override, agent_day defaults to 0.
      return 0;
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
