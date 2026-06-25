import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMarketplaceAgentPresets } from "@/features/organization/api/organizationApi";

export function useMarketplaceAgentNameMap() {
  const { data } = useQuery({
    queryKey: ["company-wizard", "marketplace-agent-names"],
    queryFn: () => fetchMarketplaceAgentPresets({ pageSize: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const item of data?.items ?? []) {
      map.set(item.slug, item.name);
    }
    return map;
  }, [data]);
}

export function resolveAgentDisplayName(
  node: { label: string; slug?: string; type: string },
  nameMap: Map<string, string>,
): string {
  if (node.type !== "agent") return node.label;
  if (node.slug && nameMap.has(node.slug)) return nameMap.get(node.slug)!;
  if (node.slug && node.label !== node.slug) return node.label;
  return nameMap.get(node.label) ?? node.label;
}
