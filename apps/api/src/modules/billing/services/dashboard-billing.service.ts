import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BudgetService } from './budget.service.js';

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
    recordCountMonth: number;
  };
  topAgents: Array<{ id: string; cost: string }>;
  topTasks: Array<{ id: string; cost: string }>;
  topSkills: Array<{ id: string; cost: string }>;
}

@Injectable()
export class DashboardBillingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly budgetService: BudgetService,
  ) {}

  async getSummary(companyId: string): Promise<BillingDashboardSummary> {
    const budget = await this.budgetService.getCompanyBudget(companyId);
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

    const topAgents = await this.topByIds(companyId, 'agent_id', 8);
    const topTasks = await this.topByIds(companyId, 'task_id', 8);
    const topSkills = await this.topByIds(companyId, 'skill_id', 8);

    return {
      companyId,
      budget: budget
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
        recordCountMonth,
      },
      topAgents,
      topTasks,
      topSkills,
    };
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
