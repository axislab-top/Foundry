import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BudgetService } from './budget.service.js';
import { UserCreditService } from './user-credit.service.js';

export interface BillingDashboardSummary {
  companyId: string;
  budget: {
    totalAmount: string;
    usedAmount: string;
    utilization: number;
    warningThreshold: string;
    criticalThreshold: string;
    currency: string;
  } | null;
  aggregates: {
    todayCost: string;
    monthCost: string;
    lastMonthCost: string;
    monthInputTokens: number;
    monthOutputTokens: number;
    recordCountMonth: number;
  };
  topAgents: Array<{ id: string; cost: string }>;
  topTasks: Array<{ id: string; cost: string }>;
  topSkills: Array<{ id: string; cost: string }>;
  agentUsageRealtime: {
    aggregationIntervalMinutes: number;
    lastAggregatedAt: string | null;
    topAgentsToday: Array<{ agentId: string; agentName: string; totalCost: string; count: number }>;
    topDepartmentsToday: Array<{ organizationNodeId: string; departmentName: string; totalCost: string; count: number }>;
  };
}

@Injectable()
export class DashboardBillingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly budgetService: BudgetService,
    private readonly userCreditService: UserCreditService,
  ) {}

  async getSummary(companyId: string): Promise<BillingDashboardSummary> {
    const budget = await this.budgetService.getCompanyBudget(companyId);
    const accountCredit = await this.userCreditService.getAccountCreditViewForCompany(companyId);
    const utilization = await this.budgetService.getUtilizationRatio(companyId);

    const monthCost = await this.scalarSum(
      companyId,
      `date_trunc('month', occurred_at) = date_trunc('month', CURRENT_TIMESTAMP)`,
    );
    const todayCost = await this.scalarSum(
      companyId,
      `occurred_at::date = CURRENT_DATE`,
    );
    const recordCountMonth = await this.scalarCount(
      companyId,
      `date_trunc('month', occurred_at) = date_trunc('month', CURRENT_TIMESTAMP)`,
    );
    const lastMonthCost = await this.scalarSum(
      companyId,
      `date_trunc('month', occurred_at) = date_trunc('month', CURRENT_TIMESTAMP - interval '1 month')`,
    );
    const monthTokens = await this.scalarTokenSums(
      companyId,
      `date_trunc('month', occurred_at) = date_trunc('month', CURRENT_TIMESTAMP)`,
    );

    const topAgents = await this.topByIds(companyId, 'agent_id', 8);
    const topTasks = await this.topByIds(companyId, 'task_id', 8);
    const topSkills = await this.topByIds(companyId, 'skill_id', 8);
    const agentUsageRealtime = await this.getRealtimeAgentUsage(companyId);

    return {
      companyId,
      budget: accountCredit
        ? {
            totalAmount: accountCredit.totalAmount,
            usedAmount: accountCredit.usedAmount,
            utilization,
            warningThreshold: budget?.warningThreshold ?? '0.8',
            criticalThreshold: budget?.criticalThreshold ?? '0.9',
            currency: accountCredit.currency,
          }
        : budget
          ? {
              totalAmount: budget.totalAmount,
              usedAmount: budget.usedAmount,
              utilization,
              warningThreshold: budget.warningThreshold,
              criticalThreshold: budget.criticalThreshold ?? '0.9',
              currency: budget.currency,
            }
          : null,
      aggregates: {
        todayCost,
        monthCost,
        lastMonthCost,
        monthInputTokens: monthTokens.inputTokens,
        monthOutputTokens: monthTokens.outputTokens,
        recordCountMonth,
      },
      topAgents,
      topTasks,
      topSkills,
      agentUsageRealtime,
    };
  }

  private async getRealtimeAgentUsage(companyId: string): Promise<BillingDashboardSummary['agentUsageRealtime']> {
    const envRaw = Number.parseInt(process.env.AGENT_USAGE_AGGREGATE_INTERVAL_MINUTES ?? '10', 10);
    const envMinutes = Number.isFinite(envRaw) && envRaw > 0 ? envRaw : 10;
    const intervalRows = await this.safeReadAggregationIntervalMinutes(companyId);
    const cfgRaw = Number(intervalRows?.[0]?.v ?? 0);
    const aggregationIntervalMinutes = Number.isFinite(cfgRaw) && cfgRaw > 0 ? Math.floor(cfgRaw) : envMinutes;
    const agg = await this.dataSource.query(
      `
      SELECT MAX(updated_at) AS last_aggregated_at
      FROM daily_agent_usage
      WHERE company_id = $1 AND usage_date = CURRENT_DATE
      `,
      [companyId],
    );
    const topAgents = await this.dataSource.query(
      `
      SELECT dau.agent_id, COALESCE(a.name, dau.agent_id::text) AS agent_name,
             COALESCE(SUM(dau.total_cost), 0)::text AS total_cost,
             COALESCE(SUM(dau.call_count), 0)::int AS cnt
      FROM daily_agent_usage dau
      LEFT JOIN agents a ON a.id = dau.agent_id AND a.company_id = dau.company_id
      WHERE dau.company_id = $1
        AND dau.usage_date = CURRENT_DATE
      GROUP BY dau.agent_id, a.name
      ORDER BY SUM(dau.total_cost) DESC
      LIMIT 8
      `,
      [companyId],
    );
    const topDepartments = await this.dataSource.query(
      `
      SELECT COALESCE(a.organization_node_id::text, 'unassigned') AS organization_node_id,
             COALESCE(o.name, '未分配部门') AS department_name,
             COALESCE(SUM(dau.total_cost), 0)::text AS total_cost,
             COALESCE(SUM(dau.call_count), 0)::int AS cnt
      FROM daily_agent_usage dau
      LEFT JOIN agents a ON a.id = dau.agent_id AND a.company_id = dau.company_id
      LEFT JOIN organization_nodes o ON o.id = a.organization_node_id
      WHERE dau.company_id = $1
        AND dau.usage_date = CURRENT_DATE
      GROUP BY COALESCE(a.organization_node_id::text, 'unassigned'), COALESCE(o.name, '未分配部门')
      ORDER BY SUM(dau.total_cost) DESC
      LIMIT 8
      `,
      [companyId],
    );
    return {
      aggregationIntervalMinutes,
      lastAggregatedAt: agg?.[0]?.last_aggregated_at ? new Date(agg[0].last_aggregated_at).toISOString() : null,
      topAgentsToday: (topAgents as Array<any>).map((x) => ({
        agentId: String(x.agent_id),
        agentName: String(x.agent_name ?? x.agent_id),
        totalCost: String(x.total_cost ?? '0'),
        count: Number(x.cnt ?? 0),
      })),
      topDepartmentsToday: (topDepartments as Array<any>).map((x) => ({
        organizationNodeId: String(x.organization_node_id ?? 'unassigned'),
        departmentName: String(x.department_name ?? '未分配部门'),
        totalCost: String(x.total_cost ?? '0'),
        count: Number(x.cnt ?? 0),
      })),
    };
  }

  private async safeReadAggregationIntervalMinutes(
    companyId: string,
  ): Promise<Array<{ v?: string | number | null }>> {
    try {
      return (await this.dataSource.query(
        `
        SELECT agent_usage_aggregate_interval_minutes AS v
        FROM billing_settings
        WHERE company_id = $1
        LIMIT 1
        `,
        [companyId],
      )) as Array<{ v?: string | number | null }>;
    } catch {
      // Backward compatibility: older DB schema may not have this column yet.
      return [];
    }
  }

  private async scalarSum(companyId: string, datePredicate: string): Promise<string> {
    const rows = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(cost), 0)::text AS s
      FROM billing_records
      WHERE company_id = $1 AND ${datePredicate}
      `,
      [companyId],
    );
    return rows[0]?.s ?? '0';
  }

  private async scalarCount(companyId: string, datePredicate: string): Promise<number> {
    const rows = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS c
      FROM billing_records
      WHERE company_id = $1 AND ${datePredicate}
      `,
      [companyId],
    );
    return rows[0]?.c ?? 0;
  }

  private async scalarTokenSums(
    companyId: string,
    datePredicate: string,
  ): Promise<{ inputTokens: number; outputTokens: number }> {
    const rows = await this.dataSource.query(
      `
      SELECT
        COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens
      FROM billing_records
      WHERE company_id = $1 AND is_nominal = false AND ${datePredicate}
      `,
      [companyId],
    );
    return {
      inputTokens: Number(rows[0]?.input_tokens ?? 0),
      outputTokens: Number(rows[0]?.output_tokens ?? 0),
    };
  }

  /**
   * P18：按 UTC 日历日聚合 `billing_records.cost`（须已在 `TenantContext.runWithCompanyId(companyId)` 下调用以满足 RLS）。
   */
  async getDailyCostTrend(companyId: string, days = 7): Promise<Array<{ date: string; cost: string }>> {
    const d = Math.min(90, Math.max(1, Math.floor(days)));
    const rows = await this.dataSource.query(
      `
      SELECT to_char((occurred_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS d,
             COALESCE(SUM(cost), 0)::text AS total
      FROM billing_records
      WHERE company_id = $1
        AND (occurred_at AT TIME ZONE 'UTC')::date >= (timezone('UTC', now())::date - $2::int + 1)
        AND (occurred_at AT TIME ZONE 'UTC')::date <= timezone('UTC', now())::date
      GROUP BY 1
      ORDER BY 1
      `,
      [companyId, d],
    );
    const byDay = new Map<string, string>(
      (rows as Array<{ d: string; total: string }>).map((r) => [r.d, r.total]),
    );
    const out: Array<{ date: string; cost: string }> = [];
    const todayUtc = new Date();
    for (let i = d - 1; i >= 0; i--) {
      const x = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() - i));
      const key = x.toISOString().slice(0, 10);
      out.push({ date: key, cost: byDay.get(key) ?? '0' });
    }
    return out;
  }

  private async topByIds(
    companyId: string,
    column: 'agent_id' | 'task_id' | 'skill_id',
    limit: number,
  ): Promise<Array<{ id: string; cost: string }>> {
    const rows = await this.dataSource.query(
      `
      SELECT ${column} AS id, COALESCE(SUM(cost), 0)::text AS cost
      FROM billing_records
      WHERE company_id = $1 AND ${column} IS NOT NULL
      GROUP BY ${column}
      ORDER BY SUM(cost) DESC
      LIMIT $2
      `,
      [companyId, limit],
    );
    return rows.map((r: { id: string; cost: string }) => ({
      id: r.id,
      cost: r.cost,
    }));
  }
}
