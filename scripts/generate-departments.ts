/**
 * Codegen: 自 packages/contracts/types/departments 生成共享常量、校验与 seed 片段。
 * Run: pnpm run generate:departments
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLATFORM_DEPARTMENTS,
  buildDepartmentTokenToZhMap,
  type PlatformDepartmentDefinition,
} from '../packages/contracts/types/departments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function escSql(s: string): string {
  return s.replace(/'/g, "''");
}

function genContractsCodegen(defs: readonly PlatformDepartmentDefinition[]): string {
  const lines = defs.map((d) => `  '${d.slug}',`);
  const tokenMap = buildDepartmentTokenToZhMap([...defs]);
  const tokenEntries = Object.entries(tokenMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);

  return `/* eslint-disable */
/**
 * AUTO-GENERATED — do not edit by hand. Run: pnpm run generate:departments
 */
export const GENERATED_PLATFORM_DEPARTMENT_SLUGS = [
${lines.join('\n')}
] as const;

export type GeneratedPlatformDepartmentSlug = (typeof GENERATED_PLATFORM_DEPARTMENT_SLUGS)[number];

export function isGeneratedPlatformDepartmentSlug(s: string): s is GeneratedPlatformDepartmentSlug {
  return (GENERATED_PLATFORM_DEPARTMENT_SLUGS as readonly string[]).includes(s);
}

/** 自 PLATFORM_DEPARTMENTS 派生的 token → 中文（供 validator / 推荐服务合并） */
export const GENERATED_DEPARTMENT_TOKEN_TO_ZH: Record<string, string> = {
${tokenEntries.join('\n')}
};
`;
}

function genAdminSelectOptions(defs: readonly PlatformDepartmentDefinition[]): string {
  const rows = defs.map(
    (d) =>
      `  { value: ${JSON.stringify(d.slug)}, labelZh: ${JSON.stringify(d.labelZh)}, category: ${JSON.stringify(d.category)}, icon: ${JSON.stringify(d.icon)} },`,
  );
  return `/* eslint-disable */
/**
 * AUTO-GENERATED — do not edit by hand. Run: pnpm run generate:departments
 */
export const DEPARTMENT_SELECT_OPTIONS = [
${rows.join('\n')}
] as const;
`;
}

function genSeedSql(defs: readonly PlatformDepartmentDefinition[]): string {
  const stmts = defs.map((d, i) => {
    const skills = JSON.stringify([...d.defaultSkills]);
    const tags = JSON.stringify([...d.taskTypeTags]);
    const excludes = JSON.stringify([...(d.excludesTaskTypeTags ?? [])]);
    const summary = escSql(d.responsibilitySummary);
    return `UPDATE platform_departments SET display_name = '${escSql(d.labelZh)}', sort_order = ${i}, category = '${escSql(
      d.category,
    )}', icon = '${escSql(d.icon)}', recommended_head_token = '${escSql(
      d.recommendedHeadToken,
    )}', default_skills = '${escSql(skills)}'::jsonb, responsibility_summary = '${summary}', task_type_tags = '${escSql(
      tags,
    )}'::jsonb, excludes_task_type_tags = '${escSql(excludes)}'::jsonb, updated_at = now() WHERE slug = '${escSql(d.slug)}';`;
  });
  return `-- AUTO-GENERATED — 仅更新已存在行的模板元数据（不插入、不修改 director / 默认开关）。
-- 平台部门须先在 Admin 创建；本 seed 不会插入新行。
-- is_default_for_new_company 仅由 Admin「Default for new company」管理。
-- Run: pnpm run generate:departments
${stmts.join('\n')}
`;
}

function main(): void {
  const defs = PLATFORM_DEPARTMENTS as readonly PlatformDepartmentDefinition[];
  const outCodegen = join(root, 'contracts/types/generated/departments.codegen.ts');
  const outAdmin = join(root, 'admin-system/src/generated/departmentSelectOptions.ts');
  const outSeed = join(root, 'infrastructure/postgres/seeds/generated/platform_departments_seed.sql');

  mkdirSync(dirname(outCodegen), { recursive: true });
  mkdirSync(dirname(outAdmin), { recursive: true });
  mkdirSync(dirname(outSeed), { recursive: true });

  writeFileSync(outCodegen, genContractsCodegen(defs), 'utf8');
  writeFileSync(outAdmin, genAdminSelectOptions(defs), 'utf8');
  writeFileSync(outSeed, genSeedSql(defs), 'utf8');

  console.log('generate:departments ok', { outCodegen, outAdmin, outSeed });
}

main();
