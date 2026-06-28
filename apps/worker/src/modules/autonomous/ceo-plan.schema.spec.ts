import { ceoPlanIntentSchema, ceoPlanSchema, ceoPlanTaskSchema } from './ceo-plan.schema.js';

describe('ceo-plan.schema (JSON-Schema-friendly)', () => {
  it('accepts null on optional string / uuid fields (LLM + OpenAI JSON)', () => {
    const task = ceoPlanTaskSchema.safeParse({
      title: 'T1',
      description: null,
      organizationNodeId: null,
      assigneeAgentId: null,
    });
    expect(task.success).toBe(true);
  });

  it('parses intent with null approvalReason and null neededSkills', () => {
    const intent = ceoPlanIntentSchema.safeParse({
      summary: '一二三四五六七八九十说明本轮规划摘要足够长',
      nextStep: 'summary_only',
      requiresHumanApproval: false,
      approvalReason: null,
      neededSkills: null,
    });
    expect(intent.success).toBe(true);
  });

  it('full plan schema accepts defaults and empty tasks', () => {
    const plan = ceoPlanSchema.safeParse({
      tasks: [],
      requiresHumanApproval: false,
      approvalReason: null,
      neededSkills: null,
    });
    expect(plan.success).toBe(true);
    if (plan.success) {
      expect(plan.data.summary.length).toBeGreaterThanOrEqual(10);
    }
  });
});
