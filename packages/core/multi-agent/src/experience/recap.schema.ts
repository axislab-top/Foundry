import { z } from 'zod';
import { randomUUID } from 'crypto';

export const RecapOutcomeSchema = z.enum([
  'success',
  'partial_success',
  'failure',
  'timeout',
]);

export const RecapErrorCategorySchema = z.enum([
  'hallucination',
  'tool_misuse',
  'approval_loop',
  'budget_exceed',
  'context_loss',
  'other',
]);

export const RecapSchema = z.object({
  recapId: z.string().default(() => randomUUID()),
  traceId: z.string().min(1),
  discussionId: z.string().min(1),
  companyId: z.string().min(1),
  goal: z.string().default(''),
  outcome: RecapOutcomeSchema,
  errorPattern: z
    .array(
      z.object({
        category: RecapErrorCategorySchema,
        description: z.string(),
        frequency: z.number().int().min(1).default(1),
        rootCause: z.string().optional(),
      }),
    )
    .default([]),
  decisionSummary: z.string().default(''),
  lessonsLearned: z.array(z.string()).default([]),
  policySuggestions: z
    .array(
      z.object({
        policyKey: z.string().min(1),
        suggestedValue: z.any(),
        reason: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
  nextActions: z.array(z.string()).optional(),
  timestamp: z.number().default(() => Date.now()),
  metadata: z.record(z.string(), z.any()).default({}),
});

export type Recap = z.infer<typeof RecapSchema>;

export function createRecapFromDiscussion(
  discussionEvent: {
    eventId?: string;
    companyId?: string;
    metadata?: Record<string, unknown>;
    data?: { threadId?: string; summary?: string };
  },
  analysis: {
    outcome: z.infer<typeof RecapOutcomeSchema>;
    errorPatterns?: unknown[];
    summary?: string;
    lessons?: string[];
    suggestions?: unknown[];
    goal?: string;
    nextActions?: string[];
    traceId?: string;
    metadata?: Record<string, unknown>;
  },
): Recap {
  const traceId =
    (analysis?.traceId && String(analysis.traceId).trim()) ||
    (discussionEvent?.metadata?.traceId && String(discussionEvent.metadata.traceId).trim()) ||
    (discussionEvent?.eventId && String(discussionEvent.eventId).trim()) ||
    randomUUID();

  const discussionId =
    (discussionEvent?.data?.threadId && String(discussionEvent.data.threadId).trim()) ||
    (discussionEvent as any)?.discussionId ||
    '';

  const companyId =
    (discussionEvent?.companyId && String(discussionEvent.companyId).trim()) ||
    (discussionEvent as any)?.context?.companyId ||
    '';

  const goal =
    (analysis?.goal && String(analysis.goal)) ||
    (discussionEvent?.data?.summary && String(discussionEvent.data.summary)) ||
    '';

  return RecapSchema.parse({
    traceId,
    discussionId,
    companyId,
    goal,
    outcome: analysis.outcome,
    errorPattern: (analysis as any).errorPatterns || [],
    decisionSummary: analysis.summary ?? '',
    lessonsLearned: analysis.lessons || [],
    policySuggestions: (analysis as any).suggestions || [],
    nextActions: analysis.nextActions,
    metadata: { ...(discussionEvent as any)?.metadata, ...(analysis?.metadata ?? {}) },
  });
}

