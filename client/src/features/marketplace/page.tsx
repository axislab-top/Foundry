import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Search, X, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { getMyActiveCompanyMembership } from "@/shared/api/companyMembershipApi";
import { useCompanyStore } from "@/shared/store/companyStore";
import {
  extractApiErrorMessage,
  fetchAgents,
  fetchMarketplaceAgentById,
  fetchMarketplaceAgentPresets,
  fetchOrganizationTree,
  hireMarketplaceAgent,
} from "@/features/organization/api/organizationApi";
import { organizationKeys } from "@/features/organization/api/queryKeys";
import type { MarketplaceAgentPreset, OrgTreeNode } from "@/features/organization/types/api";
import {
  buildNodeIdToDepartmentIdMap,
  findDepartments,
  flattenOrgTree,
  resolveDirectorHireTarget,
  resolveEmployeeHireTarget,
} from "@/features/organization/utils/orgTree";
import { marketplaceKeys } from "./api/queryKeys";
import AgentDetailDrawer from "./components/AgentDetailDrawer";
import MarketplaceAgentCard from "./components/MarketplaceAgentCard";
import RecruitConfirmModal from "./components/RecruitConfirmModal";
import RecruitedAgentsPanel from "./components/RecruitedAgentsPanel";
import {
  extractMarketplaceAgentId,
  matchesCategoryFilter,
  matchesSearch,
  type MarketplaceCategoryFilter,
} from "./utils/viewModel";

const CATEGORY_FILTERS: MarketplaceCategoryFilter[] = ["全部", "执行岗", "主管岗", "CEO"];

export default function RecruitmentMarketPage() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<MarketplaceCategoryFilter>("全部");
  const [confirmAgent, setConfirmAgent] = useState<MarketplaceAgentPreset | null>(null);
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setSearch("");
    setCategory("全部");
    setConfirmAgent(null);
    setDetailAgentId(null);
    setToast(null);
    setActionError(null);
  }, [companyId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const marketplaceQuery = useQuery({
    queryKey: marketplaceKeys.agents(companyId, search),
    queryFn: () => fetchMarketplaceAgentPresets({ search }),
    staleTime: 60_000,
  });

  const treeQuery = useQuery({
    queryKey: organizationKeys.tree(companyId),
    queryFn: fetchOrganizationTree,
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const agentsQuery = useQuery({
    queryKey: organizationKeys.agents(companyId),
    queryFn: fetchAgents,
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const membershipQuery = useQuery({
    queryKey: organizationKeys.membership(companyId),
    queryFn: () => getMyActiveCompanyMembership(companyId!),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const detailQuery = useQuery({
    queryKey: marketplaceKeys.agentDetail(detailAgentId ?? undefined),
    queryFn: () => fetchMarketplaceAgentById(detailAgentId!),
    enabled: Boolean(detailAgentId),
    staleTime: 120_000,
  });

  const recruitedMarketplaceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const agent of agentsQuery.data ?? []) {
      const mpId = extractMarketplaceAgentId(agent.metadata ?? null);
      if (mpId) ids.add(mpId);
    }
    return ids;
  }, [agentsQuery.data]);

  const filteredTemplates = useMemo(() => {
    const items = marketplaceQuery.data?.items ?? [];
    return items.filter(
      (p) => matchesCategoryFilter(p, category) && matchesSearch(p, search),
    );
  }, [marketplaceQuery.data, category, search]);

  const recruitedList = useMemo(() => {
    const presets = marketplaceQuery.data?.items ?? [];
    const presetById = new Map(presets.map((p) => [p.id, p]));
    const tree = treeQuery.data ?? [];
    const flat = flattenOrgTree(tree);
    const deptMap = buildNodeIdToDepartmentIdMap(
      flat.map((n) => ({ id: n.id, parentId: n.parentId, type: n.type })),
    );
    const deptById = new Map(findDepartments(tree).map((d) => [d.id, d]));

    return (agentsQuery.data ?? [])
      .map((agent) => {
        const mpId = extractMarketplaceAgentId(agent.metadata ?? null);
        if (!mpId) return null;
        const preset = presetById.get(mpId);
        const deptId = agent.organizationNodeId ? deptMap.get(agent.organizationNodeId) : null;
        const dept = deptId ? deptById.get(deptId) : null;
        return {
          marketplaceId: mpId,
          agentId: agent.id,
          name: agent.name,
          departmentName: dept?.name ?? "未分配",
          preset: preset ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [agentsQuery.data, marketplaceQuery.data, treeQuery.data]);

  const hireMutation = useMutation({
    mutationFn: async ({
      preset,
      departmentId,
      reason,
    }: {
      preset: MarketplaceAgentPreset;
      departmentId: string;
      reason?: string;
    }) => {
      if (!companyId) throw new Error("请先选择公司");
      const tree = queryClient.getQueryData<OrgTreeNode[]>(organizationKeys.tree(companyId)) ?? treeQuery.data ?? [];
      const isDirector = preset.agentCategory === "department_head";
      const orgNodeId = isDirector
        ? resolveDirectorHireTarget(tree, departmentId)
        : resolveEmployeeHireTarget(tree, departmentId);
      if (!orgNodeId) {
        throw new Error(
          isDirector ? "该部门已有主管或无法任命，请选择其他部门" : "无法解析组织安装节点，请刷新后重试",
        );
      }
      const canApprove =
        membershipQuery.data?.role === "owner" || membershipQuery.data?.role === "admin";
      return hireMarketplaceAgent(
        companyId,
        {
          marketplaceAgentId: preset.id,
          organizationNodeId: orgNodeId,
          requestedReason: reason,
        },
        { canApprove: Boolean(canApprove) },
      );
    },
    onSuccess: (result, vars) => {
      setConfirmAgent(null);
      setActionError(null);
      if (result.pendingApproval) {
        setToast(`已提交「${vars.preset.name}」招聘申请，等待管理员审批`);
      } else if (result.materializePending) {
        setToast(`「${vars.preset.name}」安装事件已发出，请稍后刷新组织树`);
      } else {
        setToast(`已成功招募 ${vars.preset.name}`);
      }
      void queryClient.invalidateQueries({ queryKey: organizationKeys.all });
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
    onError: (e: unknown) => {
      setActionError(extractApiErrorMessage(e));
    },
  });

  const detailAgent =
    detailQuery.data ??
    (detailAgentId
      ? (marketplaceQuery.data?.items ?? []).find((p) => p.id === detailAgentId) ?? null
      : null);

  const totalCount = marketplaceQuery.data?.total ?? filteredTemplates.length;

  return (
    <section className="h-full space-y-6 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">招聘市场</h1>
          <p className="mt-1 text-sm text-gray-500">从平台商品库招募 Agent 加入团队</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>
            <span className="font-medium text-gray-800">{recruitedMarketplaceIds.size}</span> 已招募
          </p>
          {marketplaceQuery.isSuccess ? (
            <p className="mt-0.5">
              <span className="font-medium text-gray-800">{totalCount}</span> 在售商品
            </p>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div className="rounded-lg border border-gray-200 bg-[#f8f9fa] px-4 py-2.5 text-xs text-gray-700">
          {toast}
        </div>
      ) : null}

      {actionError ? (
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-xs text-gray-500 hover:text-gray-700">
            关闭
          </button>
        </div>
      ) : null}

      {!companyId ? (
        <div className="rounded-lg border border-gray-200 bg-[#f8f9fa] px-4 py-3 text-sm text-gray-600">
          请先在顶部选择或创建公司，再进行招募操作。
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称、能力、技能…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-800 outline-none focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f]/20"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {marketplaceQuery.isSuccess && search.trim() ? (
        <p className="text-xs text-gray-400">当前筛选 {filteredTemplates.length} 个结果</p>
      ) : null}

      <div>
        {marketplaceQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Loader2 className="mb-2 h-6 w-6 animate-spin" />
            <p className="text-sm">加载商品…</p>
          </div>
        ) : marketplaceQuery.isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
            <AlertCircle className="h-7 w-7 text-gray-400" />
            <p className="text-sm">商品列表加载失败</p>
            <button
              type="button"
              onClick={() => void marketplaceQuery.refetch()}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-14 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-800">暂无匹配的商品</p>
            <p className="mt-1 text-xs text-gray-500">尝试调整搜索或分类筛选</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredTemplates.map((template) => (
              <MarketplaceAgentCard
                key={template.id}
                preset={template}
                recruited={recruitedMarketplaceIds.has(template.id)}
                disabled={!companyId}
                onOpen={() => setDetailAgentId(template.id)}
                onRecruit={() => setConfirmAgent(template)}
              />
            ))}
          </div>
        )}
      </div>

      <RecruitedAgentsPanel items={recruitedList} />

      <AnimatePresence>
        {confirmAgent ? (
          <RecruitConfirmModal
            agent={confirmAgent}
            departments={findDepartments(treeQuery.data ?? [])}
            submitting={hireMutation.isPending}
            onConfirm={(departmentId, reason) => {
              hireMutation.mutate({ preset: confirmAgent, departmentId, reason });
            }}
            onCancel={() => setConfirmAgent(null)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {detailAgentId && detailAgent ? (
          <AgentDetailDrawer
            agent={detailAgent}
            loadingDetail={detailQuery.isFetching && !detailQuery.data}
            isRecruited={recruitedMarketplaceIds.has(detailAgent.id)}
            onClose={() => setDetailAgentId(null)}
            onRecruit={(agent) => {
              setDetailAgentId(null);
              setConfirmAgent(agent);
            }}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
