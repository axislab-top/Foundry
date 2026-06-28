"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiLevelApprovalSchema = exports.ApprovalStepSchema = void 0;
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const approval_contract_js_1 = require("../../contracts/approval.contract.js");
const types_js_1 = require("./types.js");
exports.ApprovalStepSchema = zod_1.z.object({
    level: zod_1.z.nativeEnum(types_js_1.ApprovalLevel),
    approver: zod_1.z.union([zod_1.z.string().min(1), zod_1.z.literal('human')]),
    status: zod_1.z.enum(['pending', 'approved', 'rejected', 'skipped']),
    approvedAt: zod_1.z.number().int().optional(),
    reason: zod_1.z.string().optional(),
    /** Phase 3/4 compatibility: the underlying approval request id created for this step, if any. */
    approvalId: zod_1.z.string().min(1).optional(),
    /** Optional grouping for parallel approvals (same groupId => can run concurrently). */
    groupId: zod_1.z.string().min(1).optional(),
    /** Optional: absolute epoch millis when this step times out. */
    timeoutAt: zod_1.z.number().int().optional(),
    /** Optional: escalation target when step times out (or policy says). */
    escalateTo: zod_1.z.nativeEnum(types_js_1.ApprovalLevel).optional(),
});
exports.MultiLevelApprovalSchema = zod_1.z.object({
    approvalFlowId: zod_1.z.string().default(() => (0, crypto_1.randomUUID)()),
    traceId: zod_1.z.string().min(1),
    companyId: zod_1.z.string().min(1),
    originalAction: zod_1.z.string().min(1),
    riskLevel: zod_1.z.nativeEnum(approval_contract_js_1.RiskLevel),
    currentLevel: zod_1.z.nativeEnum(types_js_1.ApprovalLevel),
    levels: zod_1.z.array(exports.ApprovalStepSchema),
    policyVersion: zod_1.z.number().int(),
    expiresAt: zod_1.z.number().int(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
    /** Overall flow status for orchestration/state-machine. */
    status: zod_1.z.enum(['running', 'approved', 'rejected', 'expired', 'cancelled']).default('running'),
    /** Current step cursor (index in `levels`). */
    currentIndex: zod_1.z.number().int().min(0).default(0),
});
