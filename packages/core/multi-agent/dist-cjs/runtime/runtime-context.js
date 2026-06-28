"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeContext = void 0;
const crypto_1 = require("crypto");
const node_async_hooks_1 = require("node:async_hooks");
/**
 * RuntimeContext is the immutable identity + mutable runtime snapshot
 * passed across orchestrator/supervisor/collaborator components.
 */
class RuntimeContext {
    static storage = new node_async_hooks_1.AsyncLocalStorage();
    traceId;
    companyId;
    currentAgentId;
    budgetSnapshot;
    memoryScope;
    policySnapshot;
    metadata;
    traceCollector = [];
    constructor(params) {
        this.traceId = params.traceId || (0, crypto_1.randomUUID)();
        this.companyId = params.companyId;
        this.currentAgentId = params.currentAgentId;
        this.budgetSnapshot = params.budgetSnapshot || { remaining: Number.POSITIVE_INFINITY, currency: 'USD' };
        this.memoryScope = params.memoryScope || 'agent';
        this.policySnapshot = params.policySnapshot ?? {};
        this.metadata = params.metadata ?? {};
    }
    withBudget(remaining, currency) {
        this.budgetSnapshot.remaining = remaining;
        if (currency)
            this.budgetSnapshot.currency = currency;
        return this;
    }
    emitTrace(event) {
        this.traceCollector.push(event);
    }
    getTraceEvents() {
        return [...this.traceCollector];
    }
    static current() {
        return RuntimeContext.storage.getStore();
    }
    static run(context, fn) {
        return RuntimeContext.storage.run(context, fn);
    }
}
exports.RuntimeContext = RuntimeContext;
