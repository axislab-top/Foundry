import { apiClient } from "@/shared/api/client";

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as { data?: unknown };
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

export async function syncCompanyProfile(companyId: string): Promise<{ generatedAt?: string }> {
  const resp = await apiClient.post(
    `/api/v1/companies/${encodeURIComponent(companyId)}/company-profile/sync`,
  );
  return unwrapPayload<{ generatedAt?: string }>(resp.data);
}
