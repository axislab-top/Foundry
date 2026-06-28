"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecapSchema = exports.RecapErrorCategorySchema = exports.RecapOutcomeSchema = void 0;
exports.createRecapFromDiscussion = createRecapFromDiscussion;
const zod_1 = require("zod");
const crypto_1 = require("crypto");
exports.RecapOutcomeSchema = zod_1.z.enum([
    'success',
    'partial_success',
    'failure',
    'timeout',
]);
exports.RecapErrorCategorySchema = zod_1.z.enum([
    'hallucination',
    'tool_misuse',
    'approval_loop',
    'budget_exceed',
    'context_loss',
    'other',
]);
exports.RecapSchema = zod_1.z.object({
    recapId: zod_1.z.string().default(() => (0, crypto_1.randomUUID)()),
    traceId: zod_1.z.string().min(1),
    discussionId: zod_1.z.string().min(1),
    companyId: zod_1.z.string().min(1),
    goal: zod_1.z.string().default(''),
    outcome: exports.RecapOutcomeSchema,
    errorPattern: zod_1.z
        .array(zod_1.z.object({
        category: exports.RecapErrorCategorySchema,
        description: zod_1.z.string(),
        frequency: zod_1.z.number().int().min(1).default(1),
        rootCause: zod_1.z.string().optional(),
    }))
        .default([]),
    decisionSummary: zod_1.z.string().default(''),
    lessonsLearned: zod_1.z.array(zod_1.z.string()).default([]),
    policySuggestions: zod_1.z
        .array(zod_1.z.object({
        policyKey: zod_1.z.string().min(1),
        suggestedValue: zod_1.z.any(),
        reason: zod_1.z.string(),
        confidence: zod_1.z.number().min(0).max(1),
    }))
        .default([]),
    nextActions: zod_1.z.array(zod_1.z.string()).optional(),
    timestamp: zod_1.z.number().default(() => Date.now()),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).default({}),
});
function createRecapFromDiscussion(discussionEvent, analysis) {
    const traceId = (analysis?.traceId && String(analysis.traceId).trim()) ||
        (discussionEvent?.metadata?.traceId && String(discussionEvent.metadata.traceId).trim()) ||
        (discussionEvent?.eventId && String(discussionEvent.eventId).trim()) ||
        (0, crypto_1.randomUUID)();
    const discussionId = (discussionEvent?.data?.threadId && String(discussionEvent.data.threadId).trim()) ||
        discussionEvent?.discussionId ||
        '';
    const companyId = (discussionEvent?.companyId && String(discussionEvent.companyId).trim()) ||
        discussionEvent?.context?.companyId ||
        '';
    const goal = (analysis?.goal && String(analysis.goal)) ||
        (discussionEvent?.data?.summary && String(discussionEvent.data.summary)) ||
        '';
    return exports.RecapSchema.parse({
        traceId,
        discussionId,
        companyId,
        goal,
        outcome: analysis.outcome,
        errorPattern: analysis.errorPatterns || [],
        decisionSummary: analysis.summary ?? '',
        lessonsLearned: analysis.lessons || [],
        policySuggestions: analysis.suggestions || [],
        nextActions: analysis.nextActions,
        metadata: { ...discussionEvent?.metadata, ...(analysis?.metadata ?? {}) },
    });
}
