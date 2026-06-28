"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupervisorRegistry = void 0;
/**
 * Registry for dynamic supervision rules.
 * Later registration for same key replaces previous rule.
 */
class SupervisorRegistry {
    rules = new Map();
    staticPolicies = new Map();
    // Keep full history for rollback. Latest entry is the active one by default.
    dynamicPolicyHistory = new Map();
    register(action, rule) {
        this.rules.set(action, rule);
    }
    unregister(action) {
        this.rules.delete(action);
    }
    has(action) {
        return this.rules.has(action);
    }
    listActions() {
        return [...this.rules.keys()];
    }
    /**
     * Set a static policy (e.g. from config/DB) in-process.
     */
    setPolicy(key, value, version = Date.now()) {
        this.staticPolicies.set(key, { key, value, version, activatedAt: Date.now() });
    }
    /**
     * Load policy suggestions produced by experience recap (latest wins per key).
     * Returns number of suggestions applied.
     */
    loadDynamicPolicies(recap) {
        const suggestions = recap?.policySuggestions ?? [];
        let applied = 0;
        for (const s of suggestions) {
            const key = String(s?.policyKey ?? '').trim();
            if (!key)
                continue;
            const next = {
                key,
                value: s.suggestedValue,
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
    rollbackPolicy(key, version) {
        const k = String(key || '').trim();
        if (!k)
            return false;
        const hist = this.dynamicPolicyHistory.get(k) ?? [];
        if (hist.length === 0)
            return false;
        const found = hist.find((p) => p.version === version);
        if (!found)
            return false;
        // Mark activation time for audit; move the chosen version to the end (active).
        const rolled = { ...found, activatedAt: Date.now() };
        const nextHist = hist.filter((p) => p.version !== version);
        nextHist.push(rolled);
        this.dynamicPolicyHistory.set(k, nextHist);
        return true;
    }
    /**
     * Resolve a policy value. Dynamic policy overrides static policy.
     */
    getPolicy(key, defaultValue) {
        const dynHist = this.dynamicPolicyHistory.get(key);
        const dyn = dynHist && dynHist.length > 0 ? dynHist[dynHist.length - 1] : undefined;
        if (dyn)
            return dyn.value;
        const st = this.staticPolicies.get(key);
        if (st)
            return st.value;
        return defaultValue;
    }
    async evaluate(action, payload, context, fallback) {
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
exports.SupervisorRegistry = SupervisorRegistry;
