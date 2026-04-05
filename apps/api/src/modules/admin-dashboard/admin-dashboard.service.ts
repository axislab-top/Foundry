import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { DashboardService as TasksDashboardService } from '../tasks/services/dashboard.service.js';
import { DashboardBillingService } from '../billing/services/dashboard-billing.service.js';
import { Company } from '../companies/entities/company.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';

export interface PlatformOverviewStats {
  totalCompanies: number;
  sumInProgress: number;
  sumPending: number;
  sumOverdue: number;
  sumAgentsTotal: number;
  budgetUtilization: number;
  todayCost: number;
  completionRate: number;
  systemHealth: number;
  sparkToken24h: number[];
  sparkToken7d: number[];
  sparkCreation7d: number[];
  sparkAutonomy: number[];
}

interface Actor {
  id: string;
  roles?: string[];
}

function makeFakeSeries(seed: number, count: number): number[] {
  // MVP: deterministic-ish placeholder series until time-series endpoints are wired.
  const base = Math.max(0, seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 2) * 0.12 + Math.cos(i / 3) * 0.08;
    const jitter = (i % 3) * 0.03;
    out.push(base * (1 + wave + jitter));
  }
  return out;
}

function computeCompletionRate(taskSummary: any): number {
  if (!taskSummary) return 0;
  const done = taskSummary.taskCountsByStatus?.completed ?? 0;
  const denom =
    (taskSummary.taskCountsByStatus?.completed ?? 0) +
    (taskSummary.taskCountsByStatus?.in_progress ?? 0) +
    (taskSummary.taskCountsByStatus?.pending ?? 0) +
    (taskSummary.taskCountsByStatus?.review ?? 0);
  return denom > 0 ? done / denom : 0;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly tenantContext: TenantContextService,
    private readonly tasksDashboard: TasksDashboardService,
    private readonly billingDashboard: DashboardBillingService,
  ) {}

  private actorIsPlatformAdmin(actor: Actor): boolean {
    return Boolean(actor?.roles?.some((r) => r === 'admin' || r === 'superadmin'));
  }

  async platformOverview(actor: Actor, companyIds: string[]): Promise<PlatformOverviewStats> {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      return {
        totalCompanies: 0,
        sumInProgress: 0,
        sumPending: 0,
        sumOverdue: 0,
        sumAgentsTotal: 0,
        budgetUtilization: 0,
        todayCost: 0,
        completionRate: 0,
        systemHealth: 0.5,
        sparkToken24h: [],
        sparkToken7d: [],
        sparkCreation7d: [],
        sparkAutonomy: [],
      };
    }

    const isSuper = Boolean(actor.roles?.includes('superadmin'));
    let scopedCompanyIds = companyIds;
    if (!isSuper) {
      const memberships = await this.membershipsRepo.find({
        where: { userId: actor.id, companyId: In(companyIds), isActive: true },
      });
      const allowed = new Set(memberships.map((m) => m.companyId));
      scopedCompanyIds = companyIds.filter((cid) => allowed.has(cid));
      if (scopedCompanyIds.length === 0) {
        throw new ForbiddenException({ message: 'No permission to access requested companies' });
      }
    }

    // Creation trend: based on passed companyIds only (MVP approximate).
    const companies = await this.companiesRepo.find({
      where: { id: In(scopedCompanyIds) },
      select: ['id', 'createdAt'],
    });
    const createdAtById = new Map<string, Date>();
    for (const c of companies) createdAtById.set(c.id, c.createdAt);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const created7dCounts = new Array(7).fill(0);
    for (const cid of scopedCompanyIds) {
      const createdAt = createdAtById.get(cid);
      if (!createdAt) continue;
      const daysAgo = Math.floor((now - createdAt.getTime()) / dayMs);
      if (daysAgo >= 0 && daysAgo <= 6) {
        // oldest -> newest
        const bucket = 6 - daysAgo;
        created7dCounts[bucket] += 1;
      }
    }

    const perCompany = await Promise.all(
      scopedCompanyIds.map(async (cid) => {
        const [taskSummary, billingSummary] = await Promise.all([
          this.tenantContext.runWithCompanyId(cid, () => this.tasksDashboard.getCompanySummary(actor)),
          this.tenantContext.runWithCompanyId(cid, () => this.billingDashboard.getSummary(cid)),
        ]);
        return { cid, taskSummary, billingSummary };
      }),
    );

    let sumInProgress = 0;
    let sumPending = 0;
    let sumOverdue = 0;
    let sumAgentsTotal = 0;

    let used = 0;
    let total = 0;
    let todayCost = 0;
    const completionRates: number[] = [];

    for (const { taskSummary, billingSummary } of perCompany) {
      sumInProgress += taskSummary?.activeWorkflow?.inProgress ?? 0;
      sumPending += taskSummary?.activeWorkflow?.pending ?? 0;
      sumOverdue += taskSummary?.activeWorkflow?.overdueCount ?? 0;
      sumAgentsTotal += taskSummary?.agents?.totalActive ?? 0;

      if (billingSummary?.budget) {
        const u = Number(billingSummary.budget.usedAmount ?? 0);
        const t = Number(billingSummary.budget.totalAmount ?? 0);
        used += Number.isFinite(u) ? u : 0;
        total += Number.isFinite(t) ? t : 0;
      }
      const c = Number(billingSummary?.aggregates?.todayCost ?? 0);
      todayCost += Number.isFinite(c) ? c : 0;

      completionRates.push(computeCompletionRate(taskSummary));
    }

    const budgetUtilization = total > 0 ? used / total : 0;
    const completionRate = completionRates.length
      ? completionRates.reduce((a, x) => a + x, 0) / completionRates.length
      : 0;

    // MVP approximate health: overdue is weighted more than budget utilization.
    const systemHealth = Math.max(0, 1 - sumOverdue / Math.max(1, scopedCompanyIds.length * 5) - Math.max(0, budgetUtilization - 0.9));

    // Series generation (MVP placeholder).
    const sparkToken24h = makeFakeSeries(todayCost / Math.max(1, scopedCompanyIds.length), 24);
    const sparkToken7d = makeFakeSeries(todayCost * 7, 14);
    const sparkAutonomy = makeFakeSeries(completionRate, 14);
    const sparkCreation7d = created7dCounts
      .map((v) => v + Math.random() * 0) // keep deterministic-ish structure
      .flatMap((v) => [v, Math.max(0, v - 0.2)]);
    // Ensure length 14.
    while (sparkCreation7d.length < 14) sparkCreation7d.push(0);
    const sparkCreation7dFinal = sparkCreation7d.slice(0, 14);

    return {
      totalCompanies: scopedCompanyIds.length,
      sumInProgress,
      sumPending,
      sumOverdue,
      sumAgentsTotal,
      budgetUtilization,
      todayCost,
      completionRate,
      systemHealth,
      sparkToken24h,
      sparkToken7d,
      sparkCreation7d: sparkCreation7dFinal,
      sparkAutonomy,
    };
  }
}

