export class BudgetExhaustedError extends Error {
  readonly code = 'budget_exhausted' as const;

  constructor(message = 'budget_exhausted') {
    super(message);
    this.name = 'BudgetExhaustedError';
  }
}
