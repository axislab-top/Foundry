import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../../../common/cache/cache.service.js';
import { Budget } from '../entities/budget.entity.js';
import { UpsertBudgetDto } from '../dto/upsert-budget.dto.js';

@Injectable()
export class BudgetService {
  private readonly CACHE_PREFIX = 'billing:util:v1:';
  private readonly CACHE_TTL_SEC = 60;

  constructor(
    @InjectRepository(Budget) private readonly budgetRepo: Repository<Budget>,
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

    if (existing) {
      existing.totalAmount = String(dto.totalAmount);
      existing.period = dto.period;
      existing.warningThreshold = warning;
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
    });
    return this.budgetRepo.save(row);
  }

  async incrementCompanyUsed(companyId: string, delta: number): Promise<void> {
    await this.budgetRepo.query(
      `
      UPDATE budgets
      SET used_amount = used_amount + $1::numeric,
          updated_at = CURRENT_TIMESTAMP
      WHERE company_id = $2 AND scope = 'company'
      `,
      [delta, companyId],
    );
    await this.invalidateUtilCache(companyId);
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
