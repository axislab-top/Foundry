import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export type MemoryScope = 'company' | 'department' | 'agent';

export interface RuntimeContextParams {
  traceId?: string;
  companyId: string;
  currentAgentId: string;
  budgetSnapshot?: { remaining: number; currency: string };
  memoryScope?: MemoryScope;
  policySnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * RuntimeContext is the immutable identity + mutable runtime snapshot
 * passed across orchestrator/supervisor/collaborator components.
 */
export class RuntimeContext {
  private static readonly storage = new AsyncLocalStorage<RuntimeContext>();

  public readonly traceId: string;

  public readonly companyId: string;

  public readonly currentAgentId: string;

  public budgetSnapshot: { remaining: number; currency: string };

  public memoryScope: MemoryScope;

  public policySnapshot: Record<string, unknown>;

  public metadata: Record<string, unknown>;

  private readonly traceCollector: Array<Record<string, unknown>> = [];

  constructor(params: RuntimeContextParams) {
    this.traceId = params.traceId || randomUUID();
    this.companyId = params.companyId;
    this.currentAgentId = params.currentAgentId;
    this.budgetSnapshot = params.budgetSnapshot || { remaining: Number.POSITIVE_INFINITY, currency: 'USD' };
    this.memoryScope = params.memoryScope || 'agent';
    this.policySnapshot = params.policySnapshot ?? {};
    this.metadata = params.metadata ?? {};
  }

  public withBudget(remaining: number, currency?: string): RuntimeContext {
    this.budgetSnapshot.remaining = remaining;
    if (currency) this.budgetSnapshot.currency = currency;
    return this;
  }

  public emitTrace(event: Record<string, unknown>): void {
    this.traceCollector.push(event);
  }

  public getTraceEvents(): Array<Record<string, unknown>> {
    return [...this.traceCollector];
  }

  public static current(): RuntimeContext | undefined {
    return RuntimeContext.storage.getStore();
  }

  public static run<T>(context: RuntimeContext, fn: () => T): T {
    return RuntimeContext.storage.run(context, fn);
  }
}
