import { z } from 'zod';

/** Single structured lesson from Supervisor / LLM output (M5). */
export const lessonSchema = z.object({
  rootCause: z.string().min(1).max(8000),
  lesson: z.string().min(1).max(8000),
  preventiveAction: z.string().min(1).max(8000),
  confidence: z.number().min(0).max(1),
  impactOnBudgetOrRoi: z.number().finite().optional(),
});

export type Lesson = z.infer<typeof lessonSchema>;

export const supervisorLlmEnvelopeSchema = z.object({
  lessons: z.array(lessonSchema).min(1).max(20),
});

export type SupervisorLlmEnvelope = z.infer<typeof supervisorLlmEnvelopeSchema>;

export function parseSupervisorLlmJson(raw: string): SupervisorLlmEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('SUPERVISOR_LLM_JSON_PARSE');
  }
  return supervisorLlmEnvelopeSchema.parse(parsed);
}

/** Default gate: only auto-ingest to RAG when model is sufficiently confident. */
export const DEFAULT_CONFIDENCE_INGEST_THRESHOLD = 0.8;
