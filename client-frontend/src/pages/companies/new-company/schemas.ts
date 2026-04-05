import { z } from 'zod';
import { COMPANY_INDUSTRY_CODES } from '@contracts/types';

const industryEnum = z.enum([...COMPANY_INDUSTRY_CODES] as [string, ...string[]]);

export const stepBasicSchema = z.object({
  name: z.string().trim().min(1, '请输入公司名称').max(255),
  industryCode: industryEnum,
  scale: z.enum(['small', 'medium', 'large']),
  goal: z.string().max(5000).optional(),
  initialBudget: z.number().min(0),
  description: z.string().max(8000).optional(),
  timezone: z.string().min(1).max(64),
  logoUrl: z.union([z.string().url(), z.null()]).optional(),
});

export const stepOrgSchema = z.object({
  orgTemplate: z.enum(['growth', 'stable', 'innovation']),
});

export const stepCeoSchema = z.object({
  personalityTags: z.array(z.string()).max(12),
  decisionStyle: z.enum(['democratic', 'autocratic', 'consensus']),
  reportFrequency: z.enum(['daily', 'hourly', 'realtime']),
});

export type StepBasicValues = z.infer<typeof stepBasicSchema>;
export type StepCeoValues = z.infer<typeof stepCeoSchema>;
