import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BudgetService } from './budget.service.js';
import { Budget } from '../entities/budget.entity.js';
import { Company } from '../../companies/entities/company.entity.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { UserCreditService } from './user-credit.service.js';

const userCreditMock = {
  getAccountCreditViewForCompany: jest.fn().mockResolvedValue(null),
  applyConsumptionInTransaction: jest.fn(),
};

function companyRepoPaused(paused: boolean) {
  return {
    findOne: jest.fn().mockResolvedValue({ id: 'c1', executionPaused: paused }),
  };
}

describe('BudgetService.evaluateSpendAllowance', () => {
  it('allows when no budgets configured', async () => {
    const repo: any = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const mod = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: getRepositoryToken(Budget), useValue: repo },
        { provide: getRepositoryToken(Company), useValue: companyRepoPaused(false) },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), delete: jest.fn() } },
        { provide: UserCreditService, useValue: userCreditMock },
      ],
    }).compile();
    const svc = mod.get(BudgetService);
    const out = await svc.evaluateSpendAllowance('c1', 1, { agentId: 'a1' });
    expect(out.allowed).toBe(true);
  });

  it('soft-warns company when used + estimate exceeds total (does not block)', async () => {
    const repo: any = {
      findOne: jest.fn(async (opts: any) => {
        if (opts?.where?.scope === 'company') {
          return {
            companyId: 'c1',
            scope: 'company',
            totalAmount: '10',
            usedAmount: '9',
            warningThreshold: '0.8',
          };
        }
        return null;
      }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: getRepositoryToken(Budget), useValue: repo },
        { provide: getRepositoryToken(Company), useValue: companyRepoPaused(false) },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), delete: jest.fn() } },
        { provide: UserCreditService, useValue: userCreditMock },
      ],
    }).compile();
    const svc = mod.get(BudgetService);
    const out = await svc.evaluateSpendAllowance('c1', 2);
    expect(out.allowed).toBe(true);
    expect(out.warning).toBe('budget_exhausted_company_soft');
  });

  it('returns remainingBudgetPercent from company budget', async () => {
    const repo: any = {
      findOne: jest.fn(async (opts: any) => {
        if (opts?.where?.scope === 'company') {
          return {
            companyId: 'c1',
            scope: 'company',
            totalAmount: '100',
            usedAmount: '10',
            warningThreshold: '0.8',
          };
        }
        return null;
      }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: getRepositoryToken(Budget), useValue: repo },
        { provide: getRepositoryToken(Company), useValue: companyRepoPaused(false) },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), delete: jest.fn() } },
        { provide: UserCreditService, useValue: userCreditMock },
      ],
    }).compile();
    const svc = mod.get(BudgetService);
    const out = await svc.evaluateSpendAllowance('c1', 0);
    expect(out.allowed).toBe(true);
    expect(out.remainingBudgetPercent).toBe(90);
  });

  it('blocks when company execution is paused (kill switch)', async () => {
    const budgetRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const mod = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: getRepositoryToken(Budget), useValue: budgetRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepoPaused(true) },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), delete: jest.fn() } },
        { provide: UserCreditService, useValue: userCreditMock },
      ],
    }).compile();
    const svc = mod.get(BudgetService);
    const out = await svc.evaluateSpendAllowance('c1', 1);
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe('execution_paused');
  });
});
