import { z } from 'zod';

/**
 * CEO 规划 JSON 的 Zod 定义。
 *
 * **禁止**使用 `z.preprocess` / 任意 `.transform()`：LangChain `withStructuredOutput(..., json_schema)`
 * 依赖 zod→JSON Schema 转换，`ZodEffects` 会触发「Transforms cannot be represented in JSON Schema」。
 * 可选字段对 `null` 使用 `z.union([..., z.null()]).optional()`，在业务层把 `null` 当「未提供」处理。
 */

/** 默认摘要（长度 ≥10，满足 schema 且无 preprocess） */
export const CEO_PLAN_DEFAULT_SUMMARY =
  '本轮 CEO 规划未返回符合格式的摘要；系统已采用安全默认说明。若你只是在询问能力或常见问题，也可直接继续对话。';

const skillSlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .describe('Skill slug，kebab-case（例如 ceo-budget-guardian）');

/** LLM 常输出 null：与 optional 组合，避免 preprocess */
const optionalString = z.union([z.string(), z.null()]).optional();
const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();

export const ceoPlanTaskSchema = z.object({
  title: z.string().min(1).max(512),
  description: optionalString,
  organizationNodeId: optionalUuid,
  assigneeAgentId: optionalUuid,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export const ceoPlanIntentSchema = z.object({
  summary: z.string().min(10).max(800).default(CEO_PLAN_DEFAULT_SUMMARY),
  nextStep: z
    .enum(['generate_tasks', 'summary_only'])
    .default('summary_only')
    .describe('是否需要继续生成详细任务列表'),
  requiresHumanApproval: z.boolean().default(false),
  approvalReason: optionalString,
  neededSkills: z
    .union([z.array(skillSlugSchema).max(5), z.null()])
    .optional()
    .describe('可选：需要额外绑定的技能列表（最多 5 个；仅在确有必要时输出）'),
});

export const ceoPlanTasksExpansionSchema = z.object({
  tasks: z.array(ceoPlanTaskSchema).max(20).default([]),
});

export const ceoPlanSchema = z.object({
  summary: z.string().min(10).max(800).default(CEO_PLAN_DEFAULT_SUMMARY),
  tasks: z.array(ceoPlanTaskSchema).max(20).default([]),
  /**
   * CEO 在本轮规划中声明「为更好执行需要临时加载/绑定的额外技能」。
   * 由 Worker 侧统一处理绑定与 ToolRegistry 热刷新（避免在图内单独引入加载路径）。
   */
  neededSkills: z
    .union([z.array(skillSlugSchema).max(5), z.null()])
    .optional()
    .describe('可选：需要额外绑定的技能列表（最多 5 个；仅在确有必要时输出）'),
  requiresHumanApproval: z.boolean().default(false),
  approvalReason: optionalString,
  /**
   * 可选：由 Router / Planner 写入，触发 hierarchicalExpand 后对应用 {@link HierarchicalHeartbeatDynamicSubGraphRegistry} 注册的子图 id。
   */
  dynamicSubGraphNodeIds: z
    .union([z.array(z.string().min(1).max(64)).max(8), z.null()])
    .optional()
    .describe('动态子图节点 id 列表（最多 8 个）'),
});

export type CeoPlanOutput = z.infer<typeof ceoPlanSchema>;
export type CeoPlanIntentOutput = z.infer<typeof ceoPlanIntentSchema>;
export type CeoPlanTasksExpansionOutput = z.infer<typeof ceoPlanTasksExpansionSchema>;
