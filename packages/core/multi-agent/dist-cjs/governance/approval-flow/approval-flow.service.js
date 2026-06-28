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
exports.ApprovalFlowService = void 0;
const common_1 = require("@nestjs/common");
const multi_level_approval_schema_js_1 = require("./multi-level-approval.schema.js");
const types_js_1 = require("./types.js");
const approval_contract_js_1 = require("../../contracts/approval.contract.js");
/**
 * Phase 5: multi-level approval orchestration model (in-memory schema).
 *
 * Note: persistence/locking is delegated to existing Phase 3 AtomicBinding in host apps.
 */
let ApprovalFlowService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ApprovalFlowService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ApprovalFlowService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        logger = new common_1.Logger(ApprovalFlowService.name);
        startFlow(params) {
            const levels = this.buildApprovalLevels(params.riskLevel);
            const currentLevel = this.determineStartLevel(params.riskLevel);
            const flow = multi_level_approval_schema_js_1.MultiLevelApprovalSchema.parse({
                traceId: params.context.traceId,
                companyId: params.context.companyId,
                originalAction: params.originalAction,
                riskLevel: params.riskLevel,
                currentLevel,
                levels,
                policyVersion: params.policyVersion,
                expiresAt: params.expiresAt,
                metadata: params.metadata ?? {},
            });
            params.context.emitTrace?.({
                type: 'approval.flow.started',
                flowId: flow.approvalFlowId,
                riskLevel: flow.riskLevel,
                currentLevel: flow.currentLevel,
                policyVersion: flow.policyVersion,
            });
            this.logger.log(`Approval flow started`, {
                flowId: flow.approvalFlowId,
                traceId: flow.traceId,
                companyId: flow.companyId,
                riskLevel: flow.riskLevel,
                currentLevel: flow.currentLevel,
                policyVersion: flow.policyVersion,
            });
            return flow;
        }
        determineStartLevel(risk) {
            if (risk === approval_contract_js_1.RiskLevel.LOW)
                return types_js_1.ApprovalLevel.AUTO;
            if (risk === approval_contract_js_1.RiskLevel.MEDIUM)
                return types_js_1.ApprovalLevel.DEPT_SUPERVISOR;
            if (risk === approval_contract_js_1.RiskLevel.HIGH)
                return types_js_1.ApprovalLevel.CEO;
            return types_js_1.ApprovalLevel.BOARD;
        }
        buildApprovalLevels(risk) {
            const levels = [];
            // LOW: auto, no human steps.
            if (risk === approval_contract_js_1.RiskLevel.LOW)
                return levels;
            // MEDIUM+: dept supervisor
            if (risk === approval_contract_js_1.RiskLevel.MEDIUM || risk === approval_contract_js_1.RiskLevel.HIGH || risk === approval_contract_js_1.RiskLevel.CRITICAL) {
                levels.push({
                    level: types_js_1.ApprovalLevel.DEPT_SUPERVISOR,
                    approver: 'dept_supervisor',
                    status: 'pending',
                });
            }
            // HIGH+: CEO
            if (risk === approval_contract_js_1.RiskLevel.HIGH || risk === approval_contract_js_1.RiskLevel.CRITICAL) {
                levels.push({
                    level: types_js_1.ApprovalLevel.CEO,
                    approver: 'ceo',
                    status: 'pending',
                });
            }
            // CRITICAL: board / human
            if (risk === approval_contract_js_1.RiskLevel.CRITICAL) {
                levels.push({
                    level: types_js_1.ApprovalLevel.BOARD,
                    approver: 'human',
                    status: 'pending',
                });
            }
            return levels;
        }
    };
    return ApprovalFlowService = _classThis;
})();
exports.ApprovalFlowService = ApprovalFlowService;
