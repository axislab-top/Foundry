import { apiClient } from "@/shared/api/client";

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as { data?: unknown };
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

export type CompanyMembershipRole = "owner" | "admin" | "member";

/** Gateway GET /api/v1/companies/:id/memberships/me */
export async function getMyActiveCompanyMembership(
  companyId: string,
): Promise<{ role: CompanyMembershipRole } | null> {
  const resp = await apiClient.get(
    `/api/v1/companies/${encodeURIComponent(companyId)}/memberships/me`,
  );
  return unwrapPayload<{ role: CompanyMembershipRole } | null>(resp.data);
}
