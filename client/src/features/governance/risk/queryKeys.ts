import type { AlertListFilters } from "./types";

export const riskKeys = {
  all: ["governance-risk"] as const,
  list: (companyId: string | undefined, filters: AlertListFilters) =>
    [...riskKeys.all, "list", companyId, filters] as const,
};
