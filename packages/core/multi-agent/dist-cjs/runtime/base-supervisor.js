"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseSupervisor = void 0;
const approval_contract_js_1 = require("../contracts/approval.contract.js");
/**
 * Base class for runtime supervisor behavior.
 */
class BaseSupervisor {
    context;
    constructor(context) {
        this.context = context;
    }
    async evaluate(action, payload) {
        this.context.emitTrace({ type: 'supervisor.evaluate', action });
        return this.evaluateInternal(action, payload);
    }
    async evaluateAsSupervisionResult(action, payload) {
        const decision = await this.evaluate(action, payload);
        return {
            action: decision.decision,
            reason: decision.reason,
            policyRef: decision.policyRef,
        };
    }
    async defaultAllow(reason = 'Default allow') {
        return {
            decision: 'allow',
            reason,
            riskLevel: approval_contract_js_1.RiskLevel.LOW,
        };
    }
}
exports.BaseSupervisor = BaseSupervisor;
