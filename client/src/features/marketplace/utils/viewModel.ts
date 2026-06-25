import type { MarketplaceAgentPreset } from "@/features/organization/types/api";
import type { DepartmentMatchContext } from "@/features/organization/utils/departmentMatch";
import { getDeptColors } from "@/features/organization/utils/deptColors";

export type MarketplaceCategoryFilter = "全部" | "执行岗" | "主管岗" | "CEO";

const ROLE_SLUG_TO_CATEGORY: Record<string, string> = {
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

const AGENT_CATEGORY_FILTER: Record<Exclude<MarketplaceCategoryFilter, "全部">, string> = {
  执行岗: "employee",
  主管岗: "department_head",
  CEO: "ceo",
};

export function getAgentCategoryLabel(category: string): string {
  if (category === "department_head") return "主管岗";
  if (category === "ceo") return "CEO";
  if (category === "employee") return "执行岗";
  return category;
}

export function getDisplayCategory(preset: MarketplaceAgentPreset): string {
  for (const role of preset.departmentRoles) {
    const key = role.trim().toLowerCase().replace(/\s+/g, "-");
    if (ROLE_SLUG_TO_CATEGORY[key]) return ROLE_SLUG_TO_CATEGORY[key];
    if (ROLE_SLUG_TO_CATEGORY[role]) return ROLE_SLUG_TO_CATEGORY[role];
  }
  if (preset.expertise?.trim()) return preset.expertise.trim();
  return getAgentCategoryLabel(preset.agentCategory);
}

export function getPrimaryDeptSlug(preset: MarketplaceAgentPreset): string {
  return preset.departmentRoles[0]?.trim().toLowerCase().replace(/\s+/g, "-") ?? "default";
}

export function getPresetPalette(preset: MarketplaceAgentPreset) {
  return getDeptColors(getPrimaryDeptSlug(preset));
}

export function formatDailyPrice(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  if (cents === 0) return "按用量计费";
  return `约 ¥${(cents / 100).toFixed(2)}/日`;
}

export function getPriceLabel(preset: MarketplaceAgentPreset): string | null {
  return (
    preset.catalogPricing?.displayLabel ??
    formatDailyPrice(preset.catalogPricing?.dailyPriceCents ?? null)
  );
}

export function matchesCategoryFilter(
  preset: MarketplaceAgentPreset,
  filter: MarketplaceCategoryFilter,
): boolean {
  if (filter === "全部") return true;
  return preset.agentCategory === AGENT_CATEGORY_FILTER[filter];
}

export function matchesSearch(preset: MarketplaceAgentPreset, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    preset.name,
    preset.slug,
    preset.description ?? "",
    preset.expertise ?? "",
    ...preset.skillTags,
    ...preset.departmentRoles,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function presetMatchesDepartment(
  preset: MarketplaceAgentPreset,
  departmentSlug: string | undefined,
): boolean {
  if (!departmentSlug) return true;
  if (preset.departmentRoles.length === 0) return true;
  return preset.departmentRoles.some(
    (r) => r === departmentSlug || r.includes(departmentSlug) || departmentSlug.includes(r),
  );
}

/** 部门招聘场景：0 = 不相关，越高越匹配（与后端 employeeMatchesDepartment 逻辑对齐） */
export function scoreDepartmentRelevance(
  preset: MarketplaceAgentPreset,
  departmentName: string | undefined,
  platformSlug: string | undefined,
): number {
  const slug = platformSlug?.trim() ?? "";
  const displayName = departmentName?.trim() ?? "";
  const aliases = new Set<string>();
  if (slug) aliases.add(slug.toLowerCase());
  if (displayName) {
    aliases.add(displayName);
    aliases.add(displayName.toLowerCase());
    if (displayName.endsWith("部")) {
      aliases.add(displayName.slice(0, -1));
      aliases.add(displayName.slice(0, -1).toLowerCase());
    }
  }
  return scoreDepartmentRelevanceWithContext(preset, {
    platformSlug: slug,
    displayName,
    aliases: [...aliases],
  });
}

export function scoreDepartmentRelevanceWithContext(
  preset: MarketplaceAgentPreset,
  context: DepartmentMatchContext | null | undefined,
): number {
  if (!context) return 0;

  const slug = context.platformSlug.trim().toLowerCase();
  const displayName = context.displayName.trim();
  const roles = preset.departmentRoles;

  // 与后端一致：无 department_roles 的执行岗不属于任何部门
  if (!roles.length) return 0;

  let score = 0;

  for (const raw of roles) {
    const role = String(raw || "").trim();
    if (!role) continue;
    const lower = role.toLowerCase();
    const normalized = lower.replace(/\s+/g, "-");

    if (slug && (lower === slug || normalized === slug)) {
      score = Math.max(score, 100);
      continue;
    }

    if (
      slug &&
      slug.length >= 3 &&
      normalized.length >= 3 &&
      (slug.includes(normalized) || normalized.includes(slug))
    ) {
      score = Math.max(score, 80);
      continue;
    }

    for (const alias of context.aliases) {
      const aliasTrimmed = alias.trim();
      if (!aliasTrimmed) continue;
      const aliasLower = aliasTrimmed.toLowerCase();
      const aliasNormalized = aliasLower.replace(/\s+/g, "-");

      if (
        role === aliasTrimmed ||
        lower === aliasLower ||
        normalized === aliasNormalized
      ) {
        score = Math.max(score, 70);
        continue;
      }

      if (
        aliasTrimmed.length >= 2 &&
        (role.includes(aliasTrimmed) ||
          aliasTrimmed.includes(role) ||
          lower.includes(aliasLower) ||
          aliasLower.includes(lower))
      ) {
        score = Math.max(score, 50);
      }
    }
  }

  if (score === 0 && displayName) {
    const displayStem = displayName.replace(/部$/u, "").toLowerCase();
    const hay = [
      preset.name,
      preset.slug,
      preset.description ?? "",
      preset.expertise ?? "",
      ...preset.skillTags,
      ...roles,
    ]
      .join(" ")
      .toLowerCase();
    const q = displayName.toLowerCase();
    if (hay.includes(q) || (displayStem.length >= 2 && hay.includes(displayStem))) {
      score = 30;
    }
  }

  return score;
}

export function getDepartmentRelevanceLabel(score: number): string | null {
  if (score >= 80) return "高度匹配";
  if (score >= 50) return "可能相关";
  if (score > 0) return "弱相关";
  return null;
}

export function extractMarketplaceAgentId(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const raw = metadata.marketplaceAgentId ?? metadata.marketplace_agent_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
