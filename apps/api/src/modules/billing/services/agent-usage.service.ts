import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createClient, type RedisClientType } from 'redis';
import { ConfigService } from '../../../common/config/config.service.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { DailyAgentUsage } from '../entities/daily-agent-usage.entity.js';
import { QueryAgentDailyUsageDto } from '../dto/query-agent-daily-usage.dto.js';
import { BillingSettings } from '../entities/billing-settings.entity.js';
import { BillingService } from './billing.service.js';

export type AgentDailyUsageRow = {
  id: string;
  agentId: string;
  agentName: string;
  departmentName: string | null;
  usageDate: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: string;
  outputCost: string;
  totalCost: string;
  llmModel: string | null;
  callCount: number;
};

type UsageCostConfig = {
  inputPricePer1k?: number;
  outputPricePer1k?: number;
};

function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AgentUsageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentUsageService.name);
  private redis: RedisClientType | null = null;
  private aggregationTimer: NodeJS.Timeout | null = null;
  private currentAggregationIntervalMinutes: number | null = null;
  private readonly flushInputField = 'flushed_input_tokens';
  private readonly flushOutputField = 'flushed_output_tokens';
  private readonly flushInputCostField = 'flushed_input_cost';
  private readonly flushOutputCostField = 'flushed_output_cost';
  private readonly flushCountField = 'flushed_count';

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(DailyAgentUsage)
    private readonly usageRepo: Repository<DailyAgentUsage>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(LlmKey)
    private readonly llmKeysRepo: Repository<LlmKey>,
    @InjectRepository(BillingSettings)
    private readonly billingSettingsRepo: Repository<BillingSettings>,
    private readonly billingService: BillingService,
  ) {}

  async onModuleInit(): Promise<void> {
    const rc = this.config.getRedisConfig();
    const url = rc.url?.trim();
    if (!url) return;
    try {
      this.redis = createClient({ url });
      this.redis.on('error', (e) => this.logger.warn(`agent usage redis error: ${String((e as any)?.message ?? e)}`));
      await this.redis.connect();
      await this.scheduleIncrementalAggregation();
    } catch (e: unknown) {
      this.logger.warn(`agent usage redis disabled: ${e instanceof Error ? e.message : String(e)}`);
      this.redis = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.clearCurrentSchedule();
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
      this.redis = null;
    }
  }

  usageKey(companyId: string, agentId: string, day = utcDate()): string {
    return `usage:company:${companyId}:agent:${agentId}:day:${day}`;
  }

  async recordUsage(
    companyId: string,
    agentId: string,
    inputTokens: number,
    outputTokens: number,
    model: string,
    costConfig?: UsageCostConfig,
  ): Promise<void> {
    if (!companyId || !agentId) return;
    const inTok = Math.max(0, Math.floor(Number(inputTokens || 0)));
    const outTok = Math.max(0, Math.floor(Number(outputTokens || 0)));
    if (inTok <= 0 && outTok <= 0) return;
    const day = utcDate();
    const key = this.usageKey(companyId, agentId, day);
    const cfg = await this.resolvePricingConfig(companyId, agentId, costConfig);
    const inputCost = Number(((inTok / 1000) * cfg.inputPricePer1k).toFixed(6));
    const outputCost = Number(((outTok / 1000) * cfg.outputPricePer1k).toFixed(6));
    if (this.redis) {
      await this.redis.hIncrBy(key, 'input_tokens', inTok);
      await this.redis.hIncrBy(key, 'output_tokens', outTok);
      await this.redis.hIncrByFloat(key, 'input_cost', inputCost);
      await this.redis.hIncrByFloat(key, 'output_cost', outputCost);
      await this.redis.hIncrBy(key, 'count', 1);
      if (model?.trim()) await this.redis.hSet(key, 'model', model.trim());
      await this.redis.expire(key, 8 * 24 * 3600);
      return;
    }
    await this.upsertDailyUsage({
      companyId,
      agentId,
      day,
      inputTokens: inTok,
      outputTokens: outTok,
      inputCost,
      outputCost,
      model: model?.trim() || null,
      count: 1,
    });
  }

  /**
   * 公司下全部 Agent 在指定 UTC 日的用量（`daily_agent_usage` 已落库部分；未 flush 的 Redis 增量不在此结果中）。
   * 无当日记录的 Agent 仍返回一行，token/cost 为 0。
   */
  async listCompanyAgentsDailyUsage(
    companyId: string,
    day = utcDate(),
  ): Promise<
    Array<{
      agentId: string;
      agentName: string;
      agentRole: string;
      date: string;
      inputTokens: number;
      outputTokens: number;
      inputCost: number;
      outputCost: number;
      totalCost: number;
      llmModel: string | null;
      count: number;
    }>
  > {
    const rows = await this.usageRepo.manager.query<
      Array<{
        agent_id: string;
        agent_name: string;
        agent_role: string;
        usage_date: string;
        input_tokens: string | null;
        output_tokens: string | null;
        input_cost: string | null;
        output_cost: string | null;
        total_cost: string | null;
        llm_model: string | null;
        call_count: string | number | null;
      }>
    >(
      `
      SELECT
        a.id::text AS agent_id,
        a.name AS agent_name,
        a.role::text AS agent_role,
        $2::date::text AS usage_date,
        COALESCE(dau.input_tokens::text, '0') AS input_tokens,
        COALESCE(dau.output_tokens::text, '0') AS output_tokens,
        COALESCE(dau.input_cost::text, '0') AS input_cost,
        COALESCE(dau.output_cost::text, '0') AS output_cost,
        COALESCE(dau.total_cost::text, '0') AS total_cost,
        dau.llm_model AS llm_model,
        COALESCE(dau.call_count, 0) AS call_count
      FROM agents a
      LEFT JOIN daily_agent_usage dau
        ON dau.agent_id = a.id
        AND dau.company_id = a.company_id
        AND dau.usage_date = $2::date
      WHERE a.company_id = $1
      ORDER BY COALESCE(dau.total_cost::numeric, 0) DESC, a.name ASC
      `,
      [companyId, day],
    );
    return rows.map((r) => ({
      agentId: r.agent_id,
      agentName: r.agent_name,
      agentRole: r.agent_role,
      date: r.usage_date,
      inputTokens: Number(r.input_tokens ?? 0),
      outputTokens: Number(r.output_tokens ?? 0),
      inputCost: Number(r.input_cost ?? 0),
      outputCost: Number(r.output_cost ?? 0),
      totalCost: Number(r.total_cost ?? 0),
      llmModel: r.llm_model ?? null,
      count: Number(r.call_count ?? 0),
    }));
  }

  /**
   * 按 UTC 日期范围列出 Agent 日用量（`daily_agent_usage` 已落库部分）。
   * 默认仅返回有消费或调用的 Agent-日行。
   */
  async listAgentDailyUsageRange(
    companyId: string,
    q: QueryAgentDailyUsageDto,
  ): Promise<{ items: AgentDailyUsageRow[]; total: number }> {
    const today = utcDate();
    const defaultFrom = new Date();
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
    const fromStr = q.from ? q.from.toISOString().slice(0, 10) : defaultFrom.toISOString().slice(0, 10);
    const toStr = q.to ? q.to.toISOString().slice(0, 10) : today;
    const activeOnly = q.activeOnly !== false;
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;

    const params: unknown[] = [companyId, fromStr, toStr];
    let paramIdx = 4;
    const filters: string[] = ['dau.company_id = $1', 'dau.usage_date >= $2::date', 'dau.usage_date <= $3::date'];

    if (activeOnly) {
      filters.push('(dau.total_cost::numeric > 0 OR dau.call_count > 0)');
    }
    if (q.agentId) {
      filters.push(`dau.agent_id = $${paramIdx}`);
      params.push(q.agentId);
      paramIdx += 1;
    }

    const whereClause = filters.join(' AND ');

    const countRows = await this.usageRepo.manager.query<Array<{ c: number }>>(
      `
      SELECT COUNT(*)::int AS c
      FROM daily_agent_usage dau
      WHERE ${whereClause}
      `,
      params,
    );
    const total = countRows[0]?.c ?? 0;

    const listParams = [...params, limit, offset];
    const rows = await this.usageRepo.manager.query<
      Array<{
        id: string;
        agent_id: string;
        agent_name: string;
        department_name: string | null;
        usage_date: string;
        input_tokens: string;
        output_tokens: string;
        input_cost: string;
        output_cost: string;
        total_cost: string;
        llm_model: string | null;
        call_count: number;
      }>
    >(
      `
      SELECT
        dau.id::text AS id,
        dau.agent_id::text AS agent_id,
        COALESCE(a.name, dau.agent_id::text) AS agent_name,
        o.name AS department_name,
        dau.usage_date::text AS usage_date,
        dau.input_tokens::text AS input_tokens,
        dau.output_tokens::text AS output_tokens,
        dau.input_cost::text AS input_cost,
        dau.output_cost::text AS output_cost,
        dau.total_cost::text AS total_cost,
        dau.llm_model AS llm_model,
        COALESCE(dau.call_count, 0) AS call_count
      FROM daily_agent_usage dau
      INNER JOIN agents a ON a.id = dau.agent_id AND a.company_id = dau.company_id
      LEFT JOIN organization_nodes o ON o.id = a.organization_node_id AND o.company_id = a.company_id
      WHERE ${whereClause}
      ORDER BY dau.usage_date DESC, dau.total_cost::numeric DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `,
      listParams,
    );

    const items: AgentDailyUsageRow[] = rows.map((r) => ({
      id: r.id,
      agentId: r.agent_id,
      agentName: r.agent_name,
      departmentName: r.department_name ?? null,
      usageDate: r.usage_date,
      inputTokens: Number(r.input_tokens ?? 0),
      outputTokens: Number(r.output_tokens ?? 0),
      inputCost: r.input_cost ?? '0',
      outputCost: r.output_cost ?? '0',
      totalCost: r.total_cost ?? '0',
      llmModel: r.llm_model ?? null,
      callCount: Number(r.call_count ?? 0),
    }));

    return { items, total };
  }

  async getDailyUsage(companyId: string, agentId: string, day = utcDate()): Promise<{
    companyId: string;
    agentId: string;
    date: string;
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
    llmModel: string | null;
    count: number;
  } | null> {
    const key = this.usageKey(companyId, agentId, day);
    if (this.redis) {
      const m = await this.redis.hGetAll(key);
      if (m && Object.keys(m).length > 0) {
        const inputCost = Number(m.input_cost ?? 0);
        const outputCost = Number(m.output_cost ?? 0);
        return {
          companyId,
          agentId,
          date: day,
          inputTokens: Number(m.input_tokens ?? 0),
          outputTokens: Number(m.output_tokens ?? 0),
          inputCost,
          outputCost,
          totalCost: Number((inputCost + outputCost).toFixed(6)),
          llmModel: m.model ?? null,
          count: Number(m.count ?? 0),
        };
      }
    }
    const row = await this.usageRepo.findOne({ where: { companyId, agentId, usageDate: day } as any });
    if (!row) return null;
    return {
      companyId,
      agentId,
      date: day,
      inputTokens: Number(row.inputTokens ?? 0),
      outputTokens: Number(row.outputTokens ?? 0),
      inputCost: Number(row.inputCost ?? 0),
      outputCost: Number(row.outputCost ?? 0),
      totalCost: Number(row.totalCost ?? 0),
      llmModel: row.llmModel ?? null,
      count: row.count ?? 0,
    };
  }

  async scheduleIncrementalAggregation(intervalMinutes?: number): Promise<void> {
    const minutes = await this.resolveEffectiveIntervalMinutes(intervalMinutes);
    const ms = minutes * 60 * 1000;
    this.clearCurrentSchedule();
    this.currentAggregationIntervalMinutes = minutes;
    this.aggregationTimer = setInterval(() => {
      void this.aggregateIncremental();
    }, ms);
    this.logger.log(`agent usage incremental aggregation scheduled every ${minutes} minute(s)`);
  }

  clearCurrentSchedule(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
    this.currentAggregationIntervalMinutes = null;
  }

  async reloadAggregationSchedule(intervalMinutes?: number): Promise<{ intervalMinutes: number }> {
    const minutes = await this.resolveEffectiveIntervalMinutes(intervalMinutes);
    const ms = minutes * 60 * 1000;
    this.clearCurrentSchedule();
    this.currentAggregationIntervalMinutes = minutes;
    this.aggregationTimer = setInterval(() => {
      void this.aggregateIncremental();
    }, ms);
    this.logger.log(`agent_usage_schedule_reloaded interval=${minutes}min`);
    return { intervalMinutes: minutes };
  }

  private async resolveEffectiveIntervalMinutes(overrideMinutes?: number): Promise<number> {
    const fromEnvRaw = Number.parseInt(process.env.AGENT_USAGE_AGGREGATE_INTERVAL_MINUTES ?? '10', 10);
    const envMinutes = Number.isFinite(fromEnvRaw) && fromEnvRaw > 0 ? fromEnvRaw : 10;
    const normalizedOverride = Number(overrideMinutes ?? 0);
    const candidateOverride =
      Number.isFinite(normalizedOverride) && normalizedOverride > 0 ? Math.floor(normalizedOverride) : null;
    // Global default (env) + tenant override (billing_settings). Use the minimum positive value
    // so any stricter tenant requirement can take effect process-wide without restart.
    const row = await this.billingSettingsRepo
      .createQueryBuilder('s')
      .select('MIN(s.agent_usage_aggregate_interval_minutes)', 'v')
      .where('s.agent_usage_aggregate_interval_minutes IS NOT NULL')
      .getRawOne<{ v?: string | number | null }>()
      .catch(() => ({ v: null }));
    const settingsMinutesRaw = Number(row?.v ?? 0);
    const settingsMinutes =
      Number.isFinite(settingsMinutesRaw) && settingsMinutesRaw > 0
        ? Math.floor(settingsMinutesRaw)
        : null;
    const candidates = [envMinutes, settingsMinutes, candidateOverride].filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
    if (candidates.length === 0) return 10;
    return Math.max(1, Math.min(...candidates));
  }

  async aggregateIncremental(day = utcDate()): Promise<{ aggregated: number }> {
    if (!this.redis) return { aggregated: 0 };
    let cursor = 0;
    let aggregated = 0;
    const pattern = `usage:company:*:agent:*:day:${day}`;
    do {
      const scan = await this.redis.scan(cursor, { MATCH: pattern, COUNT: 200 });
      cursor = scan.cursor;
      for (const key of scan.keys) {
        const m = await this.redis.hGetAll(key);
        if (!m || Object.keys(m).length === 0) continue;
        const parsed = this.parseUsageKey(key);
        if (!parsed) continue;
        const inputTokens = Number(m.input_tokens ?? 0);
        const outputTokens = Number(m.output_tokens ?? 0);
        const inputCost = Number(m.input_cost ?? 0);
        const outputCost = Number(m.output_cost ?? 0);
        const count = Number(m.count ?? 0);
        const flushedInput = Number(m[this.flushInputField] ?? 0);
        const flushedOutput = Number(m[this.flushOutputField] ?? 0);
        const flushedInputCost = Number(m[this.flushInputCostField] ?? 0);
        const flushedOutputCost = Number(m[this.flushOutputCostField] ?? 0);
        const flushedCount = Number(m[this.flushCountField] ?? 0);

        const deltaInput = Math.max(0, inputTokens - flushedInput);
        const deltaOutput = Math.max(0, outputTokens - flushedOutput);
        const deltaInputCost = Math.max(0, Number((inputCost - flushedInputCost).toFixed(6)));
        const deltaOutputCost = Math.max(0, Number((outputCost - flushedOutputCost).toFixed(6)));
        const deltaCount = Math.max(0, count - flushedCount);
        if (
          deltaInput <= 0 &&
          deltaOutput <= 0 &&
          deltaInputCost <= 0 &&
          deltaOutputCost <= 0 &&
          deltaCount <= 0
        ) {
          continue;
        }
        await this.upsertDailyUsage({
          companyId: parsed.companyId,
          agentId: parsed.agentId,
          day: parsed.day,
          inputTokens: deltaInput,
          outputTokens: deltaOutput,
          inputCost: deltaInputCost,
          outputCost: deltaOutputCost,
          model: m.model ?? null,
          count: deltaCount,
        });
        await this.redis.hSet(key, {
          [this.flushInputField]: String(inputTokens),
          [this.flushOutputField]: String(outputTokens),
          [this.flushInputCostField]: String(inputCost),
          [this.flushOutputCostField]: String(outputCost),
          [this.flushCountField]: String(count),
        });
        aggregated += 1;
      }
    } while (cursor !== 0);
    return { aggregated };
  }

  private parseUsageKey(key: string): { companyId: string; agentId: string; day: string } | null {
    const m = key.match(/^usage:company:([^:]+):agent:([^:]+):day:(\d{4}-\d{2}-\d{2})$/);
    if (!m) return null;
    return { companyId: m[1]!, agentId: m[2]!, day: m[3]! };
  }

  private async resolvePricingConfig(companyId: string, agentId: string, direct?: UsageCostConfig): Promise<{ inputPricePer1k: number; outputPricePer1k: number }> {
    const normalize = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    if (direct && (direct.inputPricePer1k != null || direct.outputPricePer1k != null)) {
      return {
        inputPricePer1k: normalize(direct.inputPricePer1k, 0),
        outputPricePer1k: normalize(direct.outputPricePer1k, 0),
      };
    }
    const agent = await this.agentsRepo.findOne({
      where: { id: agentId, companyId } as any,
      select: ['llmModel', 'llmKeyId'] as any,
    });
    const modelName = agent?.llmModel?.trim() || '';
    if (!modelName) {
      return { inputPricePer1k: 0, outputPricePer1k: 0 };
    }
    const keyId = agent?.llmKeyId?.trim() || '';
    const key = keyId ? await this.llmKeysRepo.findOne({ where: { id: keyId } }) : null;
    const pricing = await this.billingService.resolveEffectiveModelPricing(
      companyId,
      modelName,
      new Date(),
      key?.id ?? null,
    );
    if (!pricing) {
      return { inputPricePer1k: 0, outputPricePer1k: 0 };
    }
    const pin = parseFloat(pricing.inputPricePerMillion);
    const pout = parseFloat(pricing.outputPricePerMillion);
    return {
      inputPricePer1k: normalize(pin / 1000, 0),
      outputPricePer1k: normalize(pout / 1000, 0),
    };
  }

  private async upsertDailyUsage(input: {
    companyId: string;
    agentId: string;
    day: string;
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    model: string | null;
    count: number;
  }): Promise<void> {
    await this.usageRepo.manager.query(
      `
      INSERT INTO daily_agent_usage (
        company_id, agent_id, usage_date, input_tokens, output_tokens, input_cost, output_cost, total_cost, llm_model, call_count, created_at, updated_at
      )
      VALUES ($1, $2, $3::date, $4::bigint, $5::bigint, $6::numeric, $7::numeric, ($6::numeric + $7::numeric), $8, $9::int, now(), now())
      ON CONFLICT (company_id, agent_id, usage_date)
      DO UPDATE SET
        input_tokens = daily_agent_usage.input_tokens + EXCLUDED.input_tokens,
        output_tokens = daily_agent_usage.output_tokens + EXCLUDED.output_tokens,
        input_cost = daily_agent_usage.input_cost + EXCLUDED.input_cost,
        output_cost = daily_agent_usage.output_cost + EXCLUDED.output_cost,
        total_cost = daily_agent_usage.total_cost + EXCLUDED.total_cost,
        llm_model = COALESCE(EXCLUDED.llm_model, daily_agent_usage.llm_model),
        call_count = daily_agent_usage.call_count + EXCLUDED.call_count,
        updated_at = now()
      `,
      [
        input.companyId,
        input.agentId,
        input.day,
        String(input.inputTokens),
        String(input.outputTokens),
        String(input.inputCost),
        String(input.outputCost),
        input.model,
        input.count,
      ],
    );
  }
}

