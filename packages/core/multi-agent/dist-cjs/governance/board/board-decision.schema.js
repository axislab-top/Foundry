"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoardDecisionSchema = void 0;
const zod_1 = require("zod");
const crypto_1 = require("crypto");
exports.BoardDecisionSchema = zod_1.z.object({
    boardDecisionId: zod_1.z.string().default(() => (0, crypto_1.randomUUID)()),
    companyId: zod_1.z.string().min(1),
    traceId: zod_1.z.string().min(1),
    approvalFlowId: zod_1.z.string().min(1),
    decision: zod_1.z.enum(['approved', 'rejected', 'needs_changes']),
    decidedBy: zod_1.z.union([zod_1.z.string().min(1), zod_1.z.literal('human')]),
    reason: zod_1.z.string().optional(),
    policyVersion: zod_1.z.number().int(),
    decidedAt: zod_1.z.number().int().default(() => Date.now()),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
});
