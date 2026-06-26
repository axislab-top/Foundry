import { z } from 'zod';

export const supervisorPostReviewSchema = z.object({
  summary: z.string().min(1).max(1200),
  findings: z
    .array(
      z.object({
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        dimension: z.enum(['completeness', 'executability', 'risk', 'cost']),
        note: z.string().min(1).max(600),
      }),
    )
    .max(10),
  // LLM occasionally omits qualityScore; default keeps post-review non-blocking.
  qualityScore: z.number().int().min(0).max(100).default(70),
  calibrationSuggestions: z.array(z.string().min(1).max(240)).max(5).default([]),
});

export type SupervisorPostReviewOutput = z.infer<typeof supervisorPostReviewSchema>;

export function buildSupervisorPostReviewSystemPrompt(): string {
  return `You are a senior operations supervisor reviewing a CEO execution plan.
Return ONLY valid JSON with keys:
- summary: concise Chinese natural-language review summary
- findings: array of findings with severity/dimension/note

Rules:
- Focus on completeness, executability, risk, and cost reasonableness.
- Keep findings actionable and concrete.
- If no major issue, still provide at least one low-severity optimization suggestion.
- Never include markdown fences.`;
}

