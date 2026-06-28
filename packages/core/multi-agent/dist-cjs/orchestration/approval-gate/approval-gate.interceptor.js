"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalGateInterceptor = void 0;
const approval_contract_js_1 = require("../../contracts/approval.contract.js");
const runtime_context_js_1 = require("../../runtime/runtime-context.js");
const compensation_event_js_1 = require("./compensation-event.js");
class ApprovalGateInterceptor {
    approvalService;
    compensationPublisher;
    constructor(approvalService, compensationPublisher) {
        this.approvalService = approvalService;
        this.compensationPublisher = compensationPublisher;
    }
    async executeWithGate(params) {
        const context = runtime_context_js_1.RuntimeContext.current();
        if (!context) {
            throw new Error('Runtime context missing in approval gate');
        }
        const riskLevel = params.riskLevel ?? this.calculateRisk(params.action);
        if (riskLevel === approval_contract_js_1.RiskLevel.HIGH || riskLevel === approval_contract_js_1.RiskLevel.CRITICAL) {
            const approvalRequest = approval_contract_js_1.ApprovalRequestSchema.parse({
                traceId: context.traceId,
                riskLevel,
                requestedAction: params.action,
                policyRef: 'policy:high-risk-execution',
                approver: 'human',
                expiresAt: Date.now() + 3600_000,
            });
            const approved = await this.approvalService.requestAndWait(approvalRequest);
            if (!approved) {
                await this.compensationPublisher.publish((0, compensation_event_js_1.createCompensationEvent)({
                    traceId: context.traceId,
                    action: params.action,
                    reason: 'approval rejected',
                }));
                throw new Error('Execution blocked by approval gate');
            }
        }
        try {
            const out = await params.execute();
            context.emitTrace({ type: 'approval.gate.success', action: params.action, riskLevel });
            return out;
        }
        catch (error) {
            await this.compensationPublisher.publish((0, compensation_event_js_1.createCompensationEvent)({
                traceId: context.traceId,
                action: params.action,
                reason: 'execution failed after gate',
            }));
            throw error;
        }
    }
    calculateRisk(action) {
        if (/delete|terminate|payment|billing/i.test(action))
            return approval_contract_js_1.RiskLevel.CRITICAL;
        if (/deploy|approve|assign|delegate/i.test(action))
            return approval_contract_js_1.RiskLevel.HIGH;
        if (/update|execute/i.test(action))
            return approval_contract_js_1.RiskLevel.MEDIUM;
        return approval_contract_js_1.RiskLevel.LOW;
    }
}
exports.ApprovalGateInterceptor = ApprovalGateInterceptor;
