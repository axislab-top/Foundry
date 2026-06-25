import { apiClient } from "@/shared/api/client";
import { unwrapGatewayResponse } from "@/shared/api/unwrapGatewayResponse";

export type CompanyListItem = {
  id: string;
  name?: string;
  displayName?: string;
  status?: string;
};

export type PaginatedResult<T> = {
  items: T[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export async function listMyCompanies(params: { page?: number; pageSize?: number } = {}) {
  const { page = 1, pageSize = 20 } = params;
  const res = await apiClient.get("/api/v1/companies", {
    params: { page, pageSize },
  });
  return unwrapGatewayResponse<PaginatedResult<CompanyListItem>>(res.data);
}

export type CreateCompanyRequest = {
  name: string;
};

export type Company = {
  id: string;
  name: string;
  slug?: string;
  status?: string;
};

export async function createCompany(req: CreateCompanyRequest) {
  const res = await apiClient.post("/api/v1/companies", req);
  return unwrapGatewayResponse<Company>(res.data);
}

export async function fetchCompanyById(companyId: string): Promise<Company> {
  const res = await apiClient.get(`/api/v1/companies/${companyId}`, {
    headers: { "x-company-id": companyId },
  });
  return unwrapGatewayResponse<Company>(res.data);
}

export type CompanyCreationQuota = {
  ownedCount: number;
  maxOwned: number;
  remaining: number;
  canCreate: boolean;
};

export async function fetchCompanyCreationQuota(): Promise<CompanyCreationQuota> {
  const res = await apiClient.get("/api/v1/companies/creation-quota");
  return unwrapGatewayResponse<CompanyCreationQuota>(res.data);
}

export async function deleteCompany(companyId: string): Promise<{ ok: true }> {
  const res = await apiClient.delete(`/api/v1/companies/${encodeURIComponent(companyId)}`, {
    headers: { "x-company-id": companyId },
  });
  return unwrapGatewayResponse<{ ok: true }>(res.data);
}
