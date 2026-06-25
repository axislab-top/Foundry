import { apiClient } from "@/shared/api/client";

export type CompanyDashboardSummary = {
  phase3?: {
    rollout: {
      masterEnabled: boolean;
      cohortMember: boolean;
      percent: number;
      heartbeatPercentOverride?: number | null;
      whitelistConfigured: boolean;
      ffAliases: string[];
    };
    memoryGraph: { processEnabled: boolean; effectiveForCompany: boolean };
    slo: {
      targets: Record<string, number>;
      signals: Record<string, number | null | boolean>;
    };
  };
  costAwareMetrics?: {
    enabled: boolean;
    tokenSavingsRateApprox?: number | null;
  };
};

type GatewaySuccess<T> = { success: true; data: T; timestamp?: string };

export async function fetchCompanyDashboardSummary(): Promise<CompanyDashboardSummary> {
  const { data } = await apiClient.get<GatewaySuccess<CompanyDashboardSummary> | CompanyDashboardSummary>(
    "/v1/dashboard",
  );
  if (data && typeof data === "object" && "success" in data && data.success && "data" in data) {
    return (data as GatewaySuccess<CompanyDashboardSummary>).data;
  }
  return data as CompanyDashboardSummary;
}
