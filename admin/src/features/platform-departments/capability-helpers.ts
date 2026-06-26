import { DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS, TASK_TYPE_KEYWORD_RULES } from '@foundry/contracts/types/department-assignment';
import { PLATFORM_DEPARTMENTS } from '@foundry/contracts/types/departments';

export { DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS };

export const TASK_TYPE_TAG_OPTIONS: string[] = [
  ...new Set(TASK_TYPE_KEYWORD_RULES.flatMap((r) => [...r.tags])),
].sort();

export function templateCapabilityForSlug(slug: string): {
  responsibilitySummary: string;
  taskTypeTags: string[];
  excludesTaskTypeTags: string[];
} | null {
  const s = String(slug ?? '').trim();
  if (!s) return null;
  const d = PLATFORM_DEPARTMENTS.find((x) => x.slug === s);
  if (!d) return null;
  return {
    responsibilitySummary: d.responsibilitySummary,
    taskTypeTags: [...d.taskTypeTags],
    excludesTaskTypeTags: [...(d.excludesTaskTypeTags ?? [])],
  };
}

export function validateSummaryClient(text: string): string | null {
  const t = String(text ?? '').trim();
  if (t.length < DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS) {
    return `职能摘要至少 ${DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS} 个字符`;
  }
  return null;
}
