"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalRequestSchema = exports.ApprovalDecisionSchema = exports.RiskLevel = void 0;
const zod_1 = require("zod");
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["LOW"] = "low";
    RiskLevel["MEDIUM"] = "medium";
    RiskLevel["HIGH"] = "high";
    RiskLevel["CRITICAL"] = "critical";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
exports.ApprovalDecisionSchema = zod_1.z.enum(['pending', 'approved', 'rejected', 'expired', 'cancelled']);
exports.ApprovalRequestSchema = zod_1.z.object({
    approvalRequestId: zod_1.z.string().default(() => crypto.randomUUID()),
    traceId: zod_1.z.string().min(1),
    riskLevel: zod_1.z.nativeEnum(RiskLevel),
    requestedAction: zod_1.z.string().min(1),
    policyRef: zod_1.z.string().min(1),
    approver: zod_1.z.union([zod_1.z.string().min(1), zod_1.z.literal('human')]),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    expiresAt: zod_1.z.number().int(),
    approvalToken: zod_1.z.string().optional(),
    decision: exports.ApprovalDecisionSchema.default('pending'),
});
