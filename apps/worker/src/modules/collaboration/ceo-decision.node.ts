import { z } from 'zod';
import type { CollaborationRoutedIntent } from './intent-types.js';

const CeoDecisionJsonSchema = z.object({
  decision: z.enum(['discussion', 'direct', 'execution', 'approval']),
  mentionedAgents: z.array(z.string()).optional(),
  /** 讨论轮次建议优先发言的 Agent UUID（控场，最多与 maxConcurrentDiscussionSpeakers 一起使用） */
  discussionSpeakerAllowlist: z.array(z.string()).optional(),
  /** 本轮讨论建议同时发言上限（1–6，缺省由服务端配置） */
  maxConcurrentDiscussionSpeakers: z.number().int().min(1).max(6).optional(),
  actionSummary: z.string().optional(),
  requiresHumanApproval: z.boolean().optional(),
  approvalTitle: z.string().nullable().optional(),
  nextStep: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type CeoStructuredDecision = z.infer<typeof CeoDecisionJsonSchema>;

export function stripJsonFence(raw: string): string {
  return raw.replace(/^```json\s*|\s*```$/gim, '').trim();
}

export function parseCeoDecisionJson(raw: string): CeoStructuredDecision | null {
  try {
    const cleaned = stripJsonFence(raw);
    const parsed = JSON.parse(cleaned) as unknown;
    const r = CeoDecisionJsonSchema.safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function buildCeoDecisionSystemPrompt(companyName: string): string {
  return `You are the CEO of AI company "${companyName}".
You alone decide how to handle each new message in the company group chat.
Return ONLY valid JSON (no markdown) with this shape:
{
  "decision": "discussion" | "direct" | "execution" | "approval",
  "mentionedAgents": ["uuid", ...],
  "discussionSpeakerAllowlist": ["uuid", ...],
  "maxConcurrentDiscussionSpeakers": 1-6,
  "actionSummary": "brief natural language of what you will do in the room",
  "requiresHumanApproval": boolean,
  "approvalTitle": string | null,
  "nextStep": "short string",
  "confidence": 0-1
}
Meanings:
- discussion: need team brainstorm, multiple agents, open planning — set discussionSpeakerAllowlist to up to N agent UUIDs who should speak first, and maxConcurrentDiscussionSpeakers (default 3–4)
- direct: routine work talk to one specific non-CEO agent (or narrow scope)
- execution: user wants tasks run now (ship, execute plan, go live) — only if appropriate
- approval: user is clearly responding to a budget/strategy/risk approval request
Rules: Prefer "direct" when exactly one non-CEO agent is clearly addressed. Prefer "execution" when the user clearly wants work started now. If unsure, use "discussion" with lower confidence.`;
}

export function buildCeoDecisionHumanPayload(params: {
  transcriptSummary: string;
  latestMessage: string;
  mentionedAgentIds: string[];
  ceoAgentId: string | null;
}): string {
  return [
    `mentionedAgentIds=${params.mentionedAgentIds.join(',')}`,
    `ceoAgentId=${params.ceoAgentId ?? ''}`,
    '--- recent transcript (oldest first) ---',
    params.transcriptSummary.slice(0, 12000),
    '--- latest user message ---',
    params.latestMessage.slice(0, 4000),
  ].join('\n');
}

export function structuredToRoutedMode(d: CeoStructuredDecision): CollaborationRoutedIntent {
  return d.decision as CollaborationRoutedIntent;
}
