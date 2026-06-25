import type { CompanyIndustryCode } from "@/features/company-wizard/types/industry";

export type CompanyScale = "small" | "medium" | "large";

export type DepartmentPlacement = {
  name: string;
  headAgentSlug?: string | null;
  memberAgentSlugs?: string[];
  platformDepartmentSlug?: string;
};

export type OrgPreviewNode = {
  id: string;
  type: "board" | "ceo" | "department" | "agent";
  /** 展示用名称（中文） */
  label: string;
  parentId?: string;
  roleHint?: string;
  /** Agent 节点的商城 slug，用于提交与回写 */
  slug?: string;
};

export type CompanyTemplateStats = {
  depth: number;
  deptCount: number;
  agentCount: number;
  estMonthlyCost: number;
};

export type CompanyTemplateOption = {
  id: string;
  name: string;
  matchScore: number;
  description: string;
  sourceKind: "llm_primary" | "preset" | "scale_variant";
  stats: CompanyTemplateStats;
  departmentPlacements: DepartmentPlacement[];
  previewGraph: OrgPreviewNode[];
};

export type WizardBasicInfo = {
  name: string;
  industryCode: CompanyIndustryCode;
  goal: string;
  scale: CompanyScale;
};

export type OrganizationDraft = {
  selectedTemplateId: string | null;
  departmentPlacements: DepartmentPlacement[];
  previewGraph: OrgPreviewNode[];
  stats: CompanyTemplateStats | null;
};

export type WizardPersistedState = {
  draftCompanyId: string | null;
  step: WizardStep;
  basicInfo: WizardBasicInfo | null;
  organizationDraft: OrganizationDraft | null;
};

export type WizardStep = 1 | 2 | 3;

export const WIZARD_STORAGE_KEY = "foundry:company-wizard:v2";

export function emptyOrganizationDraft(): OrganizationDraft {
  return {
    selectedTemplateId: null,
    departmentPlacements: [],
    previewGraph: [],
    stats: null,
  };
}
