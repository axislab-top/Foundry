"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalFlowExecutor = void 0;
const common_1 = require("@nestjs/common");
const approval_contract_js_1 = require("../../contracts/approval.contract.js");
const runtime_context_js_1 = require("../../runtime/runtime-context.js");
const types_js_1 = require("./types.js");
/**
 * Executes a multi-level approval flow using an underlying "requestAndWait" port.
 * This is designed to be wired by host apps without breaking Phase 3 single-level gate.
 */
let ApprovalFlowExecutor = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ApprovalFlowExecutor = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ApprovalFlowExecutor = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        flowService;
        approvalPort;
        constructor(flowService, approvalPort) {
            this.flowService = flowService;
            this.approvalPort = approvalPort;
        }
        /**
         * Ensure the step has a stable underlying approval id persisted onto the flow.
         * This MUST be called before waiting so the flow can be resumed after restarts.
         */
        async prepareStep(flow, index) {
            const step = flow.levels[index];
            if (!step) {
                throw new Error('step missing');
            }
            if (step.status !== 'pending') {
                if (!step.approvalId) {
                    throw new Error('step already resolved but approvalId missing');
                }
                return { approvalId: step.approvalId };
            }
            if (step.timeoutAt && Date.now() > step.timeoutAt) {
                throw new Error('step timeout');
            }
            const approvalRequest = approval_contract_js_1.ApprovalRequestSchema.parse({
                traceId: flow.traceId,
                riskLevel: flow.riskLevel,
                requestedAction: flow.originalAction,
                policyRef: `policy:v${flow.policyVersion}:multi-level`,
                approver: step.approver === 'human' ? 'human' : String(step.approver),
                expiresAt: flow.expiresAt,
                payload: {
                    approvalFlowId: flow.approvalFlowId,
                    approvalLevel: step.level,
                    stepIndex: index,
                    companyId: flow.companyId,
                    ...flow.metadata,
                },
            });
            if (!step.approvalId) {
                const created = await this.approvalPort.createApprovalRequest(approvalRequest);
                step.approvalId = created.approvalId;
            }
            return { approvalId: step.approvalId };
        }
        async waitForStepDecision(flow, index, approvalId) {
            const step = flow.levels[index];
            const timeoutMs = Math.max(0, (step?.timeoutAt ?? flow.expiresAt) - Date.now());
            return await this.approvalPort.waitForApprovalResult(approvalId, timeoutMs);
        }
        async executeStep(flow, index) {
            try {
                const { approvalId } = await this.prepareStep(flow, index);
                const ok = await this.waitForStepDecision(flow, index, approvalId);
                return ok
                    ? { index, status: 'approved', approvalId }
                    : { index, status: 'rejected', reason: 'approval rejected', approvalId };
            }
            catch (e) {
                const msg = e?.message ?? String(e);
                if (msg.includes('timeout'))
                    return { index, status: 'timeout', reason: msg };
                return { index, status: 'rejected', reason: msg };
            }
        }
        async executeWithMultiLevelGate(params) {
            const context = runtime_context_js_1.RuntimeContext.current();
            if (!context) {
                throw new Error('Runtime context missing in multi-level approval executor');
            }
            const riskLevel = params.riskLevel ?? approval_contract_js_1.RiskLevel.HIGH;
            const flow = this.flowService.startFlow({
                originalAction: params.action,
                riskLevel,
                context,
                policyVersion: params.policyVersion,
                expiresAt: Date.now() + (params.expiresInMs ?? 48 * 3600_000),
                metadata: params.metadata,
            });
            // AUTO: no approvals needed.
            if (flow.currentLevel === types_js_1.ApprovalLevel.AUTO || flow.levels.length === 0) {
                return await params.execute();
            }
            // Phase 5 MVP: each step maps to one ApprovalRequest; the host app decides how to route approvers.
            for (let i = 0; i < flow.levels.length; i++) {
                const r = await this.executeStep(flow, i);
                if (r.status !== 'approved') {
                    throw new Error(`Approval rejected at level=${flow.levels[i]?.level} flow=${flow.approvalFlowId}`);
                }
            }
            return await params.execute();
        }
    };
    return ApprovalFlowExecutor = _classThis;
})();
exports.ApprovalFlowExecutor = ApprovalFlowExecutor;
