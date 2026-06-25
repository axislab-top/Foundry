import type { DepartmentNode } from "../types";
import type { OrgTreeNode, PlatformDepartmentApiRow } from "../types/api";
import { flattenOrgTree } from "./orgTree";

export const DEPARTMENT_RELATED_MIN_SCORE = 50;

export type DepartmentMatchContext = {
  platformSlug: string;
  displayName: string;
  aliases: string[];
};

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value.trim());
}

function pickMetaString(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const raw = meta[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

function addAlias(set: Set<string>, value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  set.add(trimmed);
  set.add(trimmed.toLowerCase());
  if (trimmed.endsWith("部")) {
    set.add(trimmed.slice(0, -1));
    set.add(trimmed.slice(0, -1).toLowerCase());
  }
}

/** 平台 slug → 中文领域标签（与商城 viewModel 保持一致） */
const SLUG_CATEGORY_LABELS: Record<string, string> = {
  marketing: "市场营销",
  sales: "市场营销",
  finance: "财务",
  operations: "运营",
  product: "运营",
  engineering: "技术",
  "research-intelligence": "技术",
  "customer-success": "客服",
  people: "人力资源",
  legal: "法务",
  strategy: "战略",
};

function addSlugAliases(set: Set<string>, slug: string) {
  const normalized = slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!normalized) return;
  set.add(normalized);
  set.add(slug.trim());
  const label = SLUG_CATEGORY_LABELS[normalized];
  if (label) {
    addAlias(set, label);
  }
}

function matchPlatformDepartmentByName(
  name: string,
  platformDepartments: PlatformDepartmentApiRow[],
): PlatformDepartmentApiRow | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const stem = trimmed.replace(/部$/u, "");

  return (
    platformDepartments.find((row) => {
      const display = row.displayName.trim();
      if (!display) return false;
      if (display === trimmed || display.toLowerCase() === lower) return true;
      if (stem && display.replace(/部$/u, "") === stem) return true;
      if (display.includes(trimmed) || trimmed.includes(display)) return true;
      return false;
    }) ?? null
  );
}

/**
 * 汇总部门 slug、中文名与别名，供商城 Agent 相关性打分。
 * 依次从组织树 metadata、DepartmentNode、平台部门目录反查 slug。
 */
export function buildDepartmentMatchContext(
  tree: OrgTreeNode[],
  departmentId: string,
  department?: DepartmentNode,
  platformDepartments?: PlatformDepartmentApiRow[],
): DepartmentMatchContext | null {
  const treeDept = flattenOrgTree(tree).find((n) => n.id === departmentId && n.type === "department");
  const meta =
    treeDept?.metadata && typeof treeDept.metadata === "object"
      ? (treeDept.metadata as Record<string, unknown>)
      : {};

  let platformSlug = pickMetaString(
    meta,
    "platformDepartmentSlug",
    "platform_department_slug",
    "departmentSlug",
    "department_slug",
  );

  const displayName = (department?.name ?? treeDept?.name ?? "").trim();

  if (!platformSlug && department?.slug && !looksLikeUuid(department.slug)) {
    platformSlug = department.slug.trim();
  }

  if (!platformSlug && displayName && platformDepartments?.length) {
    const matched = matchPlatformDepartmentByName(displayName, platformDepartments);
    if (matched) platformSlug = matched.slug;
  }

  const aliases = new Set<string>();
  if (platformSlug) addSlugAliases(aliases, platformSlug);
  if (displayName) addAlias(aliases, displayName);

  if (!platformSlug && aliases.size === 0) return null;

  return {
    platformSlug,
    displayName,
    aliases: [...aliases],
  };
}
