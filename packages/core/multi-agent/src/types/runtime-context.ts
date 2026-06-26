export interface RuntimeContext {
  traceId: string;
  companyId: string;
  budgetSnapshot: {
    remaining: number;
    currency: string;
  };
  memoryScope: 'company' | 'department' | 'agent';
  policySnapshot: Record<string, unknown>;
  currentAgentId: string;
}
