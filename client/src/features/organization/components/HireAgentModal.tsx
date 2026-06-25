import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, RefreshCw, Search, Sparkles, UserPlus, X } from "lucide-react";
import {
  matchesSearch,
  scoreDepartmentRelevanceWithContext,
} from "@/features/marketplace/utils/viewModel";
import type { DepartmentNode, HireVariant } from "../types";
import type { MarketplaceAgentPreset, OrgTreeNode } from "../types/api";
import {
  fetchMarketplaceAgentPresets,
  fetchPlatformDepartments,
} from "../api/organizationApi";
import { organizationKeys } from "../api/queryKeys";
import {
  buildDepartmentMatchContext,
  DEPARTMENT_RELATED_MIN_SCORE,
} from "../utils/departmentMatch";
import HireAgentPresetCard from "./HireAgentPresetCard";

type ScoredPreset = { preset: MarketplaceAgentPreset; relevance: number };

function sortScoredPresets(items: ScoredPreset[]): ScoredPreset[] {
  return [...items].sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return b.preset.usageCount - a.preset.usageCount;
  });
}

function buildScoredPresets(
  presets: MarketplaceAgentPreset[],
  categoryFilter: string,
  matchContext: ReturnType<typeof buildDepartmentMatchContext>,
): ScoredPreset[] {
  return presets
    .filter((p) => p.agentCategory === categoryFilter)
    .map((preset) => ({
      preset,
      relevance: scoreDepartmentRelevanceWithContext(preset, matchContext),
    }));
}

export default function HireAgentModal({
  open,
  variant,
  departments,
  tree,
  initialDepartmentId,
  submitting,
  canAutoApprove,
  onClose,
  onSubmit,
}: {
  open: boolean;
  variant: HireVariant;
  departments: DepartmentNode[];
  tree: OrgTreeNode[];
  initialDepartmentId?: string | null;
  submitting?: boolean;
  canAutoApprove?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    marketplaceAgentId: string;
    departmentId: string;
    requestedReason?: string;
    presetName: string;
    variant: HireVariant;
  }) => void;
}) {
  const [departmentId, setDepartmentId] = useState("");
  const [presetId, setPresetId] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [showAllCatalog, setShowAllCatalog] = useState(false);

  const isDirector = variant === "director";
  const categoryFilter = isDirector ? "department_head" : "employee";
  const roleLabel = isDirector ? "主管" : "员工";

  const marketplaceQuery = useQuery({
    queryKey: organizationKeys.marketplacePresets(search),
    queryFn: () =>
      fetchMarketplaceAgentPresets({
        pageSize: 200,
        search: search.trim() || undefined,
      }),
    enabled: open,
    staleTime: 120_000,
  });

  const platformDeptsQuery = useQuery({
    queryKey: organizationKeys.platformDepartments(),
    queryFn: fetchPlatformDepartments,
    enabled: open,
    staleTime: 120_000,
  });

  const selectedDept = departments.find((d) => d.id === departmentId) ?? null;

  const matchContext = useMemo(
    () =>
      departmentId
        ? buildDepartmentMatchContext(
            tree,
            departmentId,
            selectedDept ?? undefined,
            platformDeptsQuery.data,
          )
        : null,
    [tree, departmentId, selectedDept, platformDeptsQuery.data],
  );

  const scoredCatalog = useMemo(
    () => buildScoredPresets(marketplaceQuery.data?.items ?? [], categoryFilter, matchContext),
    [marketplaceQuery.data?.items, categoryFilter, matchContext],
  );

  const searchTrimmed = search.trim();

  const relatedPresets = useMemo(
    () =>
      sortScoredPresets(
        scoredCatalog.filter((s) => s.relevance >= DEPARTMENT_RELATED_MIN_SCORE),
      ),
    [scoredCatalog],
  );

  const otherPresets = useMemo(
    () =>
      sortScoredPresets(
        scoredCatalog.filter((s) => s.relevance < DEPARTMENT_RELATED_MIN_SCORE),
      ),
    [scoredCatalog],
  );

  const searchResults = useMemo(
    () =>
      searchTrimmed
        ? sortScoredPresets(
            scoredCatalog.filter((s) => matchesSearch(s.preset, searchTrimmed)),
          )
        : [],
    [scoredCatalog, searchTrimmed],
  );

  const displaySections = useMemo(() => {
    if (searchTrimmed) {
      return { mode: "search" as const, related: searchResults, others: [] as ScoredPreset[] };
    }
    if (showAllCatalog) {
      return { mode: "all" as const, related: relatedPresets, others: otherPresets };
    }
    return { mode: "related" as const, related: relatedPresets, others: [] as ScoredPreset[] };
  }, [searchTrimmed, showAllCatalog, relatedPresets, otherPresets, searchResults]);

  const allDisplayItems = [...displaySections.related, ...displaySections.others];
  const selectedPreset =
    allDisplayItems.find((s) => s.preset.id === presetId)?.preset ??
    scoredCatalog.find((s) => s.preset.id === presetId)?.preset ??
    null;

  const hasHiddenOthers = !searchTrimmed && otherPresets.length > 0 && !showAllCatalog;
  const totalVisible = allDisplayItems.length;

  useEffect(() => {
    if (!open) {
      setDepartmentId("");
      setPresetId("");
      setReason("");
      setSearch("");
      setShowAllCatalog(false);
      return;
    }
    if (departments.length === 0) return;
    const preferred =
      (initialDepartmentId ? departments.find((d) => d.id === initialDepartmentId) : undefined) ??
      departments[0];
    if (preferred) setDepartmentId(preferred.id);
  }, [open, departments, initialDepartmentId]);

  useEffect(() => {
    if (!open) return;
    setShowAllCatalog(false);
    setPresetId("");
  }, [open, departmentId]);

  useEffect(() => {
    if (!open) return;
    const pool = allDisplayItems.length > 0 ? allDisplayItems : scoredCatalog;
    if (!presetId || !pool.some((s) => s.preset.id === presetId)) {
      setPresetId(pool[0]?.preset.id ?? "");
    }
  }, [open, allDisplayItems, scoredCatalog, presetId]);

  if (!open) return null;

  const title = isDirector ? "任命部门主管" : "招聘员工";
  const subtitle = isDirector
    ? "从商城选择部门主管，任命后将挂载至目标部门"
    : "优先展示与本部门相关的执行岗，也可搜索或浏览全部商城 Agent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-gray-200 bg-white shadow-lg">
        <div className="flex shrink-0 items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                isDirector ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
              }`}
            >
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
              <p className="text-[11px] text-gray-400">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-300 hover:bg-gray-50 hover:text-gray-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {departments.length === 0 ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm text-gray-700">暂无部门，请先添加部门</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600"
            >
              关闭
            </button>
          </div>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedPreset || !departmentId) return;
              onSubmit({
                marketplaceAgentId: selectedPreset.id,
                departmentId,
                requestedReason: reason.trim() || undefined,
                presetName: selectedPreset.name,
                variant,
              });
            }}
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-gray-600">
                  目标部门
                  <select
                    className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    required
                    disabled={submitting}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedDept ? (
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 sm:mt-5">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: selectedDept.color }}
                    />
                    <span className="text-xs text-gray-600">
                      {isDirector ? "主管将任命至" : "员工将加入"}
                      <span className="font-medium text-gray-800"> {selectedDept.name}</span>
                    </span>
                  </div>
                ) : null}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-700">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  选择商城 {roleLabel} Agent
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索名称、描述、技能、部门标签…"
                    disabled={submitting}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-8 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-[#1e3a5f] focus:bg-white focus:ring-1 focus:ring-[#1e3a5f]"
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

                {marketplaceQuery.isSuccess ? (
                  <p className="mt-2 text-[10px] text-gray-400">
                    {searchTrimmed
                      ? `搜索到 ${searchResults.length} 个${roleLabel} Agent`
                      : displaySections.mode === "related"
                        ? relatedPresets.length > 0
                          ? `与本部门相关 ${relatedPresets.length} 个 · 商城共 ${scoredCatalog.length} 个${roleLabel}`
                          : `未找到强相关 Agent · 商城共 ${scoredCatalog.length} 个${roleLabel}可浏览`
                        : `展示全部 ${totalVisible} 个${roleLabel} Agent`}
                  </p>
                ) : null}
              </div>

              {marketplaceQuery.isLoading ? (
                <p className="py-6 text-center text-xs text-gray-400">加载商城 Agent…</p>
              ) : marketplaceQuery.isError ? (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2">
                  <p className="text-xs text-rose-600">商城列表加载失败</p>
                  <button
                    type="button"
                    onClick={() => void marketplaceQuery.refetch()}
                    className="inline-flex items-center gap-0.5 text-xs text-[#2d5a8e]"
                  >
                    <RefreshCw className="h-3 w-3" />
                    重试
                  </button>
                </div>
              ) : totalVisible === 0 && !hasHiddenOthers ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center">
                  <p className="text-sm text-gray-600">
                    {searchTrimmed
                      ? "未找到匹配的 Agent，请调整关键词"
                      : `暂无与本部门相关的${roleLabel} Agent`}
                  </p>
                  {!searchTrimmed && otherPresets.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllCatalog(true)}
                      className="mt-3 text-xs font-medium text-[#2d5a8e] hover:text-[#1e3a5f]"
                    >
                      浏览全部 {scoredCatalog.length} 个商城 {roleLabel}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  {displaySections.related.length > 0 ? (
                    <section>
                      {!searchTrimmed ? (
                        <h4 className="mb-2 text-[11px] font-medium text-gray-500">
                          与{selectedDept ? `「${selectedDept.name}」` : "本部门"}相关（
                          {displaySections.related.length}）
                        </h4>
                      ) : null}
                      <div className="space-y-2">
                        {displaySections.related.map(({ preset, relevance }) => (
                          <HireAgentPresetCard
                            key={preset.id}
                            preset={preset}
                            selected={presetId === preset.id}
                            relevanceScore={relevance}
                            isDirector={isDirector}
                            disabled={submitting}
                            onSelect={() => setPresetId(preset.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {displaySections.others.length > 0 ? (
                    <section>
                      <h4 className="mb-2 text-[11px] font-medium text-gray-500">
                        其他可选（{displaySections.others.length}）
                      </h4>
                      <div className="space-y-2">
                        {displaySections.others.map(({ preset, relevance }) => (
                          <HireAgentPresetCard
                            key={preset.id}
                            preset={preset}
                            selected={presetId === preset.id}
                            relevanceScore={relevance}
                            isDirector={isDirector}
                            disabled={submitting}
                            onSelect={() => setPresetId(preset.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {hasHiddenOthers ? (
                    <button
                      type="button"
                      onClick={() => setShowAllCatalog(true)}
                      className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-200 py-2.5 text-xs font-medium text-[#2d5a8e] hover:border-[#1e3a5f]/30 hover:bg-gray-50"
                    >
                      查看全部商城 {roleLabel}（还有 {otherPresets.length} 个）
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  ) : null}

                  {showAllCatalog && !searchTrimmed && otherPresets.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllCatalog(false)}
                      className="text-[10px] text-gray-400 hover:text-gray-600"
                    >
                      仅显示与本部门相关
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="shrink-0 space-y-3 border-t border-gray-100 bg-white px-5 py-4">
              <label className="block text-xs font-medium text-gray-600">
                申请说明（可选）
                <textarea
                  className="mt-1.5 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    isDirector
                      ? "例如：财务部新设，需任命主管统筹核算"
                      : "例如：工程部扩编，承接 Q3 交付"
                  }
                  disabled={submitting}
                />
              </label>

              <p className="text-[10px] text-gray-400">
                {canAutoApprove
                  ? "您为公司管理员，提交后将自动审批并安装商城 Agent。"
                  : "提交后进入待审批；公司 Owner/Admin 在审批通过后会完成安装。"}
              </p>

              <div className="flex items-center justify-between gap-3">
                <Link
                  to="/ai/recruitment-market"
                  className="inline-flex items-center gap-1 text-[11px] text-[#2d5a8e] hover:text-[#1e3a5f]"
                  onClick={onClose}
                >
                  前往招聘市场浏览
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-50"
                    onClick={onClose}
                    disabled={submitting}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !selectedPreset}
                    className={`rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-50 ${
                      isDirector ? "bg-amber-600 hover:bg-amber-700" : "bg-[#1e3a5f] hover:bg-[#2d5a8e]"
                    }`}
                  >
                    {submitting
                      ? "提交中…"
                      : isDirector
                        ? "确认任命"
                        : canAutoApprove
                          ? "确认招聘并安装"
                          : "提交招聘申请"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
