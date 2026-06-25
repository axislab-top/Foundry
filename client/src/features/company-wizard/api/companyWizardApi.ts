import { apiClient } from "@/shared/api/client";
import { unwrapGatewayResponse } from "@/shared/api/unwrapGatewayResponse";
import type {
  CompanyTemplateOption,
  DepartmentPlacement,
  OrgPreviewNode,
  WizardBasicInfo,
} from "@/features/company-wizard/types/organizationDraft";
import type { Company } from "@/features/auth/api/companiesApi";

export type TemplateRecommendationResponse = {
  templates: CompanyTemplateOption[];
  recommendSource?: "llm" | "catalog";
  recommendConfidence?: number;
  fallbackReason?: string;
  cached?: boolean;
};

export type PatchOrganizationDraftResponse = {
  departmentPlacements: DepartmentPlacement[];
  previewGraph: OrgPreviewNode[];
  stats: {
    depth: number;
    deptCount: number;
    agentCount: number;
    estMonthlyCost: number;
  };
};

export async function createCompanyDraft(): Promise<Company> {
  const res = await apiClient.post("/api/v1/companies/draft");
  return unwrapGatewayResponse<Company>(res.data);
}

export async function fetchTemplateRecommendations(
  basic: WizardBasicInfo,
  draftCompanyId: string,
  options?: { refresh?: boolean },
): Promise<TemplateRecommendationResponse> {
  const res = await apiClient.post(
    "/api/v1/companies/wizard/template-recommendations",
    {
      industryCode: basic.industryCode,
      scale: basic.scale,
      goal: basic.goal || undefined,
      companyName: basic.name || undefined,
      refresh: options?.refresh ?? false,
    },
    {
      headers: { "x-company-id": draftCompanyId },
    },
  );
  return unwrapGatewayResponse<TemplateRecommendationResponse>(res.data);
}

export async function patchOrganizationDraft(params: {
  prompt: string;
  departmentPlacements: DepartmentPlacement[];
  scale?: WizardBasicInfo["scale"];
  draftCompanyId?: string;
}): Promise<PatchOrganizationDraftResponse> {
  const res = await apiClient.post(
    "/api/v1/companies/wizard/patch-organization-draft",
    {
      prompt: params.prompt,
      departmentPlacements: params.departmentPlacements,
      scale: params.scale,
    },
    params.draftCompanyId
      ? { headers: { "x-company-id": params.draftCompanyId } }
      : undefined,
  );
  return unwrapGatewayResponse<PatchOrganizationDraftResponse>(res.data);
}

export type CompleteCompanyWizardRequest = WizardBasicInfo & {
  departmentPlacements: DepartmentPlacement[];
};

export async function completeCompanyWizard(
  draftCompanyId: string,
  payload: CompleteCompanyWizardRequest,
): Promise<Company> {
  const res = await apiClient.post(
    `/api/v1/companies/${draftCompanyId}/complete`,
    {
      name: payload.name,
      industryCode: payload.industryCode,
      scale: payload.scale,
      goal: payload.goal || undefined,
      departmentPlacements: payload.departmentPlacements,
    },
    {
      headers: { "x-company-id": draftCompanyId },
    },
  );
  return unwrapGatewayResponse<Company>(res.data);
}
