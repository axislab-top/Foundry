import type { RuntimeContext } from '../runtime/runtime-context.js';
import type { SupervisionResult } from './supervision-action.js';

export type SupervisionRule = (
  action: string,
  payload: unknown,
  context: RuntimeContext,
) => Promise<SupervisionResult> | SupervisionResult;

export type SupervisorPolicy = {
  key: string;
  value: unknown;
  version: number;
  activatedAt: number;
  source?: { recapId?: string; discussionId?: string };
};

/**
 * Registry for dynamic supervision rules.
 * Later registration for same key replaces previous rule.
 */
export class SupervisorRegistry {
  private readonly rules = new Map<string, SupervisionRule>();
  private readonly staticPolicies = new Map<string, SupervisorPolicy>();

  // Keep full history for rollback. Latest entry is the active one by default.
  private readonly dynamicPolicyHistory = new Map<string, SupervisorPolicy[]>();

  public register(action: string, rule: SupervisionRule): void {
    this.rules.set(action, rule);
  }

  public unregister(action: string): void {
    this.rules.delete(action);
  }

  public has(action: string): boolean {
    return this.rules.has(action);
  }

  public listActions(): string[] {
    return [...this.rules.keys()];
  }

  /**
   * Set a static policy (e.g. from config/DB) in-process.
   */
  public setPolicy(key: string, value: unknown, version = Date.now()): void {
    this.staticPolicies.set(key, { key, value, version, activatedAt: Date.now() });
  }

  /**
   * Load policy suggestions produced by experience recap (latest wins per key).
   * Returns number of suggestions applied.
   */
  public loadDynamicPolicies(recap: {
    recapId?: string;
    discussionId?: string;
    policySuggestions?: Array<{
      policyKey?: string;
      suggestedValue?: unknown;
      confidence?: number;
    }>;
  }): number {
    const suggestions = recap?.policySuggestions ?? [];
    let applied = 0;
    for (const s of suggestions) {
      const key = String(s?.policyKey ?? '').trim();
      if (!key) continue;
      const next: SupervisorPolicy = {
        key,
        value: (s as any).suggestedValue,
        version: Date.now(),
        activatedAt: Date.now(),
        source: { recapId: recap?.recapId, discussionId: recap?.discussionId },
      };
      const hist = this.dynamicPolicyHistory.get(key) ?? [];
      hist.push(next);
      this.dynamicPolicyHistory.set(key, hist);
      applied += 1;
    }
    return applied;
  }

  /**
   * Roll back an active dynamic policy to a previous version.
   * Returns true when rollback succeeded.
   */
  public rollbackPolicy(key: string, version: number): boolean {
    const k = String(key || '').trim();
    if (!k) return false;
    const hist = this.dynamicPolicyHistory.get(k) ?? [];
    if (hist.length === 0) return false;
    const found = hist.find((p) => p.version === version);
    if (!found) return false;

    // Mark activation time for audit; move the chosen version to the end (active).
    const rolled: SupervisorPolicy = { ...found, activatedAt: Date.now() };
    const nextHist = hist.filter((p) => p.version !== version);
    nextHist.push(rolled);
    this.dynamicPolicyHistory.set(k, nextHist);
    return true;
  }

  /**
   * Resolve a policy value. Dynamic policy overrides static policy.
   */
  public getPolicy<T = unknown>(key: string, defaultValue: T): T {
    const dynHist = this.dynamicPolicyHistory.get(key);
    const dyn = dynHist && dynHist.length > 0 ? dynHist[dynHist.length - 1] : undefined;
    if (dyn) return dyn.value as T;
    const st = this.staticPolicies.get(key);
    if (st) return st.value as T;
    return defaultValue;
  }

  public async evaluate(
    action: string,
    payload: unknown,
    context: RuntimeContext,
    fallback?: SupervisionRule,
  ): Promise<SupervisionResult> {
    const rule = this.rules.get(action) ?? fallback;
    if (!rule) {
      return {
        action: 'allow',
        reason: `No supervision rule registered for action "${action}"`,
      };
    }
    return await rule(action, payload, context);
  }
}
