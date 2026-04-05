import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CacheService } from '../../../common/cache/cache.service.js';
import { Budget } from '../entities/budget.entity.js';
import { UpsertBudgetDto } from '../dto/upsert-budget.dto.js';
import { BudgetExhaustedError } from '../errors/budget-exhausted.error.js';
import { Company } from '../../companies/entities/company.entity.js';

@Injectable()
export class BudgetService {
  private readonly CACHE_PREFIX = 'billing:util:v1:';
  private readonly CACHE_TTL_SEC = 60;

  constructor(
    @InjectRepository(Budget) private readonly budgetRepo: Repository<Budget>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly cache: CacheService,
  ) {}

  async getCompanyBudget(companyId: string): Promise<Budget | null> {
    return this.budgetRepo.findOne({
      where: { companyId, scope: 'company' },
    });
  }

  async listBudgets(companyId: string): Promise<Budget[]> {
    return this.budgetRepo.find({
      where: { companyId },
      order: { scope: 'ASC', updatedAt: 'DESC' },
    });
  }

  async upsertBudget(companyId: string, dto: UpsertBudgetDto): Promise<Budget> {
    if (dto.scope === 'department' && !dto.departmentId) {
      throw new NotFoundException('departmentId required for department scope');
    }
    if (dto.scope === 'agent' && !dto.agentId) {
      throw new NotFoundException('agentId required for agent scope');
    }

    let existing: Budget | null = null;
    if (dto.scope === 'company') {
      existing = await this.budgetRepo.findOne({
        where: { companyId, scope: 'company' },
      });
    } else if (dto.scope === 'department' && dto.departmentId) {
      existing = await this.budgetRepo.findOne({
        where: { companyId, scope: 'department', departmentId: dto.departmentId },
      });
    } else if (dto.scope === 'agent' && dto.agentId) {
      existing = await this.budgetRepo.findOne({
        where: { companyId, scope: 'agent', agentId: dto.agentId },
      });
    }

    const warning =
      dto.warningThreshold !== undefined ? String(dto.warningThreshold) : '0.8';
    const critical =
      dto.criticalThreshold !== undefined ? String(dto.criticalThreshold) : undefined;

    if (existing) {
      existing.totalAmount = String(dto.totalAmount);
      existing.period = dto.period;
      existing.warningThreshold = warning;
      if (critical !== undefined) {
        existing.criticalThreshold = critical;
      }
      existing.periodStart = dto.periodStart ?? existing.periodStart;
      existing.periodEnd = dto.periodEnd ?? existing.periodEnd;
      const saved = await this.budgetRepo.save(existing);
      await this.invalidateUtilCache(companyId);
      return saved;
    }

    const row = this.budgetRepo.create({
      companyId,
      scope: dto.scope,
      departmentId: dto.departmentId ?? null,
      agentId: dto.agentId ?? null,
      period: dto.period,
      totalAmount: String(dto.totalAmount),
      usedAmount: '0',
      warningThreshold: warning,
      criticalThreshold: critical ?? '0.9',
      periodStart: dto.periodStart ?? null,
      periodEnd: dto.periodEnd ?? null,
    });
    const saved = await this.budgetRepo.save(row);
    await this.invalidateUtilCache(companyId);
    return saved;
  }

  /**
   * 初始化公司级预算（company.created 或管理端补建）
   */
  async ensureCompanyBudget(
    companyId: string,
    totalAmount: number,
    currency = 'USD',
  ): Promise<Budget> {
    const existing = await this.getCompanyBudget(companyId);
    if (existing) {
      return existing;
    }
    const row = this.budgetRepo.create({
      companyId,
      scope: 'company',
      period: 'monthly',
      currency,
      totalAmount: String(totalAmount),
      usedAmount: '0',
      warningThreshold: '0.8',
      criticalThreshold: '0.9',
    });
    return this.budgetRepo.save(row);
  }

  /** agent.created 后初始化 Agent 级预算上限（与 checklist：Agent 配额） */
  async ensureAgentBudget(
    companyId: string,
    agentId: string,
    totalAmount: number,
    currency = 'USD',
  ): Promise<Budget> {
    const existing = await this.budgetRepo.findOne({
      where: { companyId, scope: 'agent', agentId },
    });
    if (existing) {
      return existing;
    }
    const row = this.budgetRepo.create({
      companyId,
      scope: 'agent',
      agentId,
      period: 'monthly',
      currency,
      totalAmount: String(totalAmount),
      usedAmount: '0',
      warningThreshold: '0.8',
      criticalThreshold: '0.9',
    });
    return this.budgetRepo.save(row);
  }

  /**
   * 在同一 DB 事务内按维度原子递增已用预算；任一存在且额度不足则抛 BudgetExhaustedError。
   * 无对应 budgets 行则跳过该维度（视为未设上限）。
   */
  async applyBillingConsumptionInTransaction(
    manager: EntityManager,
    companyId: string,
    cost: number,
    agentId?: string | null,
    departmentId?: string | null,
  ): Promise<void> {
    if (!Number.isFinite(cost) || cost <= 0) {
      return;
    }

    const cid = companyId;
    const hasCompany = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM budgets WHERE company_id = $1 AND scope = 'company' LIMIT 1`,
      [cid],
    );
    if (hasCompany.length > 0) {
      const updated = await manager.query<Array<{ id: string }>>(
        `
        UPDATE budgets
        SET used_amount = used_amount + $1::numeric,
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = $2 AND scope = 'company'
          AND used_amount + $1::numeric <= total_amount
        RETURNING id
        `,
        [cost, cid],
      );
      if (updated.length === 0) {
        throw new BudgetExhaustedError('company_budget_exhausted');
      }
    }

    if (agentId) {
      const hasAgent = await manager.query<Array<{ id: string }>>(
        `
        SELECT id FROM budgets
        WHERE company_id = $1 AND scope = 'agent' AND agent_id = $2
        LIMIT 1
        `,
        [cid, agentId],
      );
      if (hasAgent.length > 0) {
        const updated = await manager.query<Array<{ id: string }>>(
          `
          UPDATE budgets
          SET used_amount = used_amount + $1::numeric,
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = $2 AND scope = 'agent' AND agent_id = $3
            AND used_amount + $1::numeric <= total_amount
          RETURNING id
          `,
          [cost, cid, agentId],
        );
        if (updated.length === 0) {
          throw new BudgetExhaustedError('agent_budget_exhausted');
        }
      }
    }

    if (departmentId) {
      const hasDept = await manager.query<Array<{ id: string }>>(
        `
        SELECT id FROM budgets
        WHERE company_id = $1 AND scope = 'department' AND department_id = $2
        LIMIT 1
        `,
        [cid, departmentId],
      );
      if (hasDept.length > 0) {
        const updated = await manager.query<Array<{ id: string }>>(
          `
          UPDATE budgets
          SET used_amount = used_amount + $1::numeric,
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = $2 AND scope = 'department' AND department_id = $3
            AND used_amount + $1::numeric <= total_amount
          RETURNING id
          `,
          [cost, cid, departmentId],
        );
        if (updated.length === 0) {
          throw new BudgetExhaustedError('department_budget_exhausted');
        }
      }
    }
  }

  async invalidateUtilizationCache(companyId: string): Promise<void> {
    await this.invalidateUtilCache(companyId);
  }

  /**
   * 预检：各已配置预算维度上 used + estimated 是否均 ≤ total（非原子，入账以 applyBillingConsumptionInTransaction 为准）。
   */
  async evaluateSpendAllowance(
    companyId: string,
    estimatedCost: number,
    opts?: { agentId?: string | null; departmentId?: string | null },
  ): Promise<{
    allowed: boolean;
    utilization: number;
    reason?: string;
    /** 所评估维度中的最小剩余额度（与 total 同单位） */
    remainingMin?: number;
  }> {
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
      return { allowed: true, utilization: 0 };
    }

    const tenantRow = await this.companyRepo.findOne({
      where: { id: companyId },
      select: ['id', 'executionPaused'],
    });
    if (tenantRow?.executionPaused) {
      return { allowed: false, utilization: 0, reason: 'execution_paused' };
    }

    const company = await this.getCompanyBudget(companyId);
    let utilization = 0;
    let remainingMin = Number.POSITIVE_INFINITY;

    const consider = (b: Budget | null | undefined): boolean => {
      if (!b) return true;
      const total = parseFloat(b.totalAmount);
      const used = parseFloat(b.usedAmount);
      if (total <= 0) {
        return true;
      }
      const rem = total - used;
      remainingMin = Math.min(remainingMin, rem);
      if (used + estimatedCost > total) {
        return false;
      }
      return true;
    };

    if (company) {
      const total = parseFloat(company.totalAmount);
      const used = parseFloat(company.usedAmount);
      if (total > 0) {
        utilization = Math.min(1, used / total);
        remainingMin = Math.min(remainingMin, total - used);
      }
      if (!consider(company)) {
        return {
          allowed: false,
          utilization,
          reason: 'budget_exhausted',
          remainingMin: Number.isFinite(remainingMin) ? Math.max(0, remainingMin) : undefined,
        };
      }
    }

    if (opts?.agentId) {
      const agentB = await this.budgetRepo.findOne({
        where: { companyId, scope: 'agent', agentId: opts.agentId },
      });
      if (agentB) {
        const total = parseFloat(agentB.totalAmount);
        const used = parseFloat(agentB.usedAmount);
        if (total > 0) {
          remainingMin = Math.min(remainingMin, total - used);
        }
        if (!consider(agentB)) {
          return {
            allowed: false,
            utilization,
            reason: 'agent_budget_exhausted',
            remainingMin: Number.isFinite(remainingMin) ? Math.max(0, remainingMin) : undefined,
          };
        }
      }
    }

    if (opts?.departmentId) {
      const deptB = await this.budgetRepo.findOne({
        where: { companyId, scope: 'department', departmentId: opts.departmentId },
      });
      if (deptB) {
        const total = parseFloat(deptB.totalAmount);
        const used = parseFloat(deptB.usedAmount);
        if (total > 0) {
          remainingMin = Math.min(remainingMin, total - used);
        }
        if (!consider(deptB)) {
          return {
            allowed: false,
            utilization,
            reason: 'department_budget_exhausted',
            remainingMin: Number.isFinite(remainingMin) ? Math.max(0, remainingMin) : undefined,
          };
        }
      }
    }

    if (!company && !(opts?.agentId) && !(opts?.departmentId)) {
      return { allowed: true, utilization: 0 };
    }

    return {
      allowed: true,
      utilization,
      remainingMin:
        Number.isFinite(remainingMin) && remainingMin !== Number.POSITIVE_INFINITY
          ? Math.max(0, remainingMin)
          : undefined,
    };
  }

  async getUtilizationRatio(companyId: string): Promise<number> {
    const cached = await this.cache.get<string>(this.cacheKey(companyId));
    if (cached !== null && cached !== undefined) {
      const n = parseFloat(cached);
      if (!Number.isNaN(n)) return n;
    }

    const b = await this.getCompanyBudget(companyId);
    if (!b) {
      return 0;
    }
    const total = parseFloat(b.totalAmount);
    const used = parseFloat(b.usedAmount);
    if (total <= 0) {
      return used > 0 ? 1 : 0;
    }
    const ratio = Math.min(1, used / total);
    await this.cache.set(this.cacheKey(companyId), String(ratio), this.CACHE_TTL_SEC);
    return ratio;
  }

  private cacheKey(companyId: string): string {
    return `${this.CACHE_PREFIX}${companyId}`;
  }

  private async invalidateUtilCache(companyId: string): Promise<void> {
    await this.cache.delete(this.cacheKey(companyId));
  }
}
