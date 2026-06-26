import type { SkillToolSnapshot } from '@contracts/events';
import { DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS } from '@contracts/types';

/** 总监管理类 Skill：用于派工/汇报，不能作为交付物执行入口。 */
const DIRECTOR_MANAGEMENT_SKILL_NAMES = new Set<string>([
  ...DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS,
  'heartbeat',
]);

/** CEO/检索类 Skill：无 prompt 交付体，不能作为部门交付执行入口。 */
const NON_DELIVERABLE_QUERY_SKILL_NAMES = new Set<string>([
  'department.knowledge.query',
  'memory.search',
  'facts.company.query',
]);

/** 需任务上下文才应自动选用的 Skill（避免分析类任务误跑代码审查）。 */
const CONTEXT_GATED_DELIVERABLE_SKILL_NAMES = new Set<string>(['code-review-assistant']);

const CODE_REVIEW_TASK_HINT_RE =
  /代码审查|code\s*review|pull\s*request|\bPR\b|diff|合并请求|reviewTarget|changedFiles/i;

function skillNameOf(s: SkillToolSnapshot): string {
  return String(s.name ?? '').trim();
}

function hasPromptBody(s: SkillToolSnapshot): boolean {
  return Boolean(String(s.promptTemplate ?? '').trim());
}

/**
 * 为部门交付任务挑选可执行 Skill：跳过总监派工类，优先带 prompt 的产出型 Skill。
 */
function skillAllowedForTaskContext(skillName: string, taskContext?: string | null): boolean {
  if (!CONTEXT_GATED_DELIVERABLE_SKILL_NAMES.has(skillName)) return true;
  const ctx = String(taskContext ?? '').trim();
  return ctx.length > 0 && CODE_REVIEW_TASK_HINT_RE.test(ctx);
}

export function pickDeliverableExecutionSkillName(
  skills: SkillToolSnapshot[],
  hints?: { preferredSkillName?: string | null; taskContext?: string | null },
): string | null {
  const preferred = String(hints?.preferredSkillName ?? '').trim();
  if (preferred) return preferred;

  const named = skills.filter((s) => skillNameOf(s));
  if (!named.length) return null;

  const deliverable = named.filter(
    (s) =>
      !DIRECTOR_MANAGEMENT_SKILL_NAMES.has(skillNameOf(s)) &&
      !NON_DELIVERABLE_QUERY_SKILL_NAMES.has(skillNameOf(s)) &&
      skillAllowedForTaskContext(skillNameOf(s), hints?.taskContext),
  );
  const pool = deliverable.length
    ? deliverable
    : named.filter(
        (s) =>
          !NON_DELIVERABLE_QUERY_SKILL_NAMES.has(skillNameOf(s)) &&
          !DIRECTOR_MANAGEMENT_SKILL_NAMES.has(skillNameOf(s)),
      );
  if (!pool.length) return null;

  const withPrompt = pool.find((s) => hasPromptBody(s));
  if (withPrompt) return skillNameOf(withPrompt);

  const echo = pool.find((s) => skillNameOf(s) === 'echo');
  if (echo) return skillNameOf(echo);

  return skillNameOf(pool[0]!);
}

export function isDirectorManagementSkillName(name: string): boolean {
  return DIRECTOR_MANAGEMENT_SKILL_NAMES.has(String(name ?? '').trim());
}

export function isNonDeliverableQuerySkillName(name: string): boolean {
  return NON_DELIVERABLE_QUERY_SKILL_NAMES.has(String(name ?? '').trim());
}
