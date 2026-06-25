import {
  DEFAULT_COMPANY_BUDGET_CREDIT,
  NEW_USER_REGISTRATION_CREDIT_BONUS,
  resolveNewCompanyBudgetCredit,
} from './billing-units.js';

describe('resolveNewCompanyBudgetCredit', () => {
  it('uses explicit initialBudget when set', () => {
    expect(
      resolveNewCompanyBudgetCredit({
        initialBudgetRaw: '1200000',
        isFirstOwnedCompany: true,
      }),
    ).toBe(1_200_000);
  });

  it('grants registration bonus for first owned company without initialBudget', () => {
    expect(
      resolveNewCompanyBudgetCredit({
        initialBudgetRaw: null,
        isFirstOwnedCompany: true,
      }),
    ).toBe(0);
  });

  it('uses configured registration bonus when provided', () => {
    expect(
      resolveNewCompanyBudgetCredit({
        initialBudgetRaw: null,
        isFirstOwnedCompany: true,
        registrationBonusCredit: 0,
      }),
    ).toBe(0);
  });

  it('uses zero default for non-first company without initialBudget', () => {
    expect(
      resolveNewCompanyBudgetCredit({
        initialBudgetRaw: undefined,
        isFirstOwnedCompany: false,
      }),
    ).toBe(DEFAULT_COMPANY_BUDGET_CREDIT);
  });
});
