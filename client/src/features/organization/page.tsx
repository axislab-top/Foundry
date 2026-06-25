import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Building2, Plus, UserPlus } from "lucide-react";
import { listAllTasks } from "@/features/tasks/api/tasksApi";
import { getMyActiveCompanyMembership } from "@/shared/api/companyMembershipApi";
import { useCompanyStore } from "@/shared/store/companyStore";
import type { HireVariant, OrgChartData, PlatformDepartmentTemplate, ToastState } from "./types";
import type { OrgTreeNode } from "./types/api";
import { organizationKeys } from "./api/queryKeys";
import {
  addDepartmentFromPlatform,
  extractApiErrorMessage,
  fetchAgents,
  fetchOrganizationTree,
  fetchPlatformDepartments,
  hireMarketplaceAgent,
} from "./api/organizationApi";
import {
  buildOrgViewModel,
  getAvailablePlatformTemplates,
  getDepartmentById,
} from "./utils/orgViewModel";
import { resolveDirectorHireTarget, resolveEmployeeHireTarget } from "./utils/orgTree";
import CreateDepartmentModal from "./components/CreateDepartmentModal";
import HireAgentModal from "./components/HireAgentModal";
import OrgToast from "./components/OrgToast";
import OrgBoard from "./components/OrgBoard";
import OrgBoardSkeleton from "./components/OrgBoardSkeleton";
import {
  AgentDetailPanel,
  DeptDetailPanel,
  DirectorDetailPanel,
  EmptyOrgPanel,
  OverviewPanel,
} from "./components/DetailPanels";

const EMPTY_ORG: OrgChartData = {
  founder: { id: "founder", name: "创始人", title: "创始人 / CEO" },
  departments: [],
  directors: [],
  agents: [],
};

function MobileDetailShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
          aria-label="返回组织架构"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <span className="truncate text-sm font-medium text-gray-800">{title}</span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default function OrganizationPage() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const [hireVariant, setHireVariant] = useState<HireVariant>("employee");
  const [hireDeptId, setHireDeptId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const treeQuery = useQuery({
    queryKey: organizationKeys.tree(companyId),
    queryFn: fetchOrganizationTree,
    enabled: Boolean(companyId),
    staleTime: 15_000,
  });

  const agentsQuery = useQuery({
    queryKey: organizationKeys.agents(companyId),
    queryFn: fetchAgents,
    enabled: Boolean(companyId),
    staleTime: 15_000,
  });

  const tasksQuery = useQuery({
    queryKey: organizationKeys.tasks(companyId),
    queryFn: () => listAllTasks({ assigneeType: "agent" }),
    enabled: Boolean(companyId),
    staleTime: 10_000,
  });

  const platformQuery = useQuery({
    queryKey: organizationKeys.platformDepartments(),
    queryFn: fetchPlatformDepartments,
    staleTime: 60_000,
  });

  const membershipQuery = useQuery({
    queryKey: organizationKeys.membership(companyId),
    queryFn: () => getMyActiveCompanyMembership(companyId!),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const tree = treeQuery.data ?? [];
  const apiAgents = agentsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];

  const orgData = useMemo(
    () => (tree.length > 0 || apiAgents.length > 0 ? buildOrgViewModel(tree, apiAgents, tasks) : EMPTY_ORG),
    [tree, apiAgents, tasks],
  );

  const availableTemplates = useMemo(
    () => getAvailablePlatformTemplates(tree, platformQuery.data ?? []),
    [tree, platformQuery.data],
  );

  const { departments, directors, agents, founder } = orgData;
  const isEmpty = departments.length === 0;
  const loading = Boolean(companyId) && (treeQuery.isLoading || agentsQuery.isLoading);
  const loadError = treeQuery.isError || agentsQuery.isError;

  const refetchOrg = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: organizationKeys.all });
  }, [queryClient]);

  const selectedAgent = selectedId ? agents.find((a) => a.id === selectedId) : null;
  const selectedDept = selectedId ? departments.find((d) => d.id === selectedId) : null;
  const selectedDirector = selectedId ? directors.find((d) => d.id === selectedId) : null;

  const hasMobileDetail = Boolean(selectedAgent || selectedDirector || selectedDept);

  const mobileDetailTitle = selectedAgent
    ? selectedAgent.name
    : selectedDirector
      ? selectedDirector.name
      : selectedDept
        ? selectedDept.name
        : "";

  const openAddDepartment = useCallback(() => setDeptModalOpen(true), []);

  const openHireEmployee = useCallback((departmentId?: string) => {
    setHireVariant("employee");
    setHireDeptId(departmentId ?? null);
    setHireModalOpen(true);
  }, []);

  const openAppointDirector = useCallback((departmentId: string) => {
    setHireVariant("director");
    setHireDeptId(departmentId);
    setHireModalOpen(true);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === founder.id) {
        setSelectedId(null);
        return;
      }
      setSelectedId(id);
    },
    [founder.id],
  );

  const addDeptMutation = useMutation({
    mutationFn: (template: PlatformDepartmentTemplate) =>
      addDepartmentFromPlatform({ platformDepartmentSlug: template.slug }),
    onSuccess: (_node, template) => {
      setDeptModalOpen(false);
      setActionError(null);
      setToast({ message: `${template.displayName} 已加入组织架构，可继续任命主管与招聘员工` });
      refetchOrg();
    },
    onError: (e: unknown) => {
      setActionError(extractApiErrorMessage(e));
    },
  });

  const hireMutation = useMutation({
    mutationFn: async (payload: {
      marketplaceAgentId: string;
      departmentId: string;
      requestedReason?: string;
      variant: HireVariant;
      presetName: string;
    }) => {
      if (!companyId) throw new Error("请先选择公司");
      const currentTree = queryClient.getQueryData<OrgTreeNode[]>(organizationKeys.tree(companyId)) ?? tree;
      const orgNodeId =
        payload.variant === "director"
          ? resolveDirectorHireTarget(currentTree, payload.departmentId)
          : resolveEmployeeHireTarget(currentTree, payload.departmentId);
      if (!orgNodeId) throw new Error("无法解析组织安装节点，请刷新后重试");

      const canApprove =
        membershipQuery.data?.role === "owner" || membershipQuery.data?.role === "admin";

      const result = await hireMarketplaceAgent(
        companyId,
        {
          marketplaceAgentId: payload.marketplaceAgentId,
          organizationNodeId: orgNodeId,
          requestedReason: payload.requestedReason,
        },
        { canApprove: Boolean(canApprove) },
      );
      return { ...result, presetName: payload.presetName, variant: payload.variant };
    },
    onSuccess: (result) => {
      setHireModalOpen(false);
      setHireDeptId(null);
      setActionError(null);

      if (result.pendingApproval) {
        setToast({ message: `已提交「${result.presetName}」招聘申请，等待管理员审批` });
      } else if (result.materializePending) {
        setToast({
          message: `「${result.presetName}」安装事件已发出，Agent 记录同步中，请稍后刷新`,
        });
      } else {
        const verb = result.variant === "director" ? "任命" : "招聘";
        setToast({ message: `已${verb} ${result.presetName}，组织树将自动同步` });
      }

      if (result.resultAgentId) setSelectedId(result.resultAgentId);
      refetchOrg();
    },
    onError: (e: unknown) => {
      setActionError(extractApiErrorMessage(e));
    },
  });

  const rightPanel = (() => {
    if (selectedAgent) {
      const dept = getDepartmentById(departments, selectedAgent.departmentId)!;
      return <AgentDetailPanel agent={selectedAgent} dept={dept} onClose={() => setSelectedId(null)} />;
    }
    if (selectedDirector) {
      const dept = getDepartmentById(departments, selectedDirector.departmentId)!;
      return (
        <DirectorDetailPanel
          director={selectedDirector}
          dept={dept}
          data={orgData}
          onClose={() => setSelectedId(null)}
        />
      );
    }
    if (selectedDept) {
      return (
        <DeptDetailPanel
          dept={selectedDept}
          data={orgData}
          onClose={() => setSelectedId(null)}
          onHireEmployee={openHireEmployee}
          onAppointDirector={openAppointDirector}
        />
      );
    }
    if (isEmpty && !loading) {
      return <EmptyOrgPanel onAddDepartment={openAddDepartment} />;
    }
    return (
      <OverviewPanel
        data={orgData}
        canAddDept={availableTemplates.length > 0}
        onAddDepartment={openAddDepartment}
        onHireEmployee={openHireEmployee}
      />
    );
  })();

  if (!companyId) {
    return (
      <section className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">请先选择或创建公司</p>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-shrink-0 flex-col gap-2 border-b border-gray-100 bg-white px-3 py-3 md:border-none md:bg-transparent md:px-6 md:py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-gray-800 md:text-lg">
            <Building2 className="h-4 w-4 flex-shrink-0 text-[#1e3a5f] md:h-5 md:w-5" />
            <span className="truncate">组织架构</span>
            <span className="hidden text-xs font-normal text-gray-400 sm:inline">Organization</span>
          </h2>
          <div className="flex flex-shrink-0 items-center gap-1.5 md:gap-2">
            {availableTemplates.length > 0 ? (
              <button
                type="button"
                onClick={openAddDepartment}
                className="inline-flex items-center gap-1 rounded-lg bg-[#1e3a5f] px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#2d5a8e] md:gap-1.5 md:px-3 md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">添加部门</span>
                <span className="sm:hidden">部门</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => openHireEmployee()}
              disabled={departments.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 md:gap-1.5 md:px-3 md:text-xs"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">招聘员工</span>
              <span className="sm:hidden">招聘</span>
            </button>
          </div>
        </div>

        {actionError ? (
          <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {actionError}
          </p>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 md:p-6 md:pt-0">
        <div className="flex h-full min-h-0 gap-4 md:px-0">
          <div
            className={`relative min-h-0 flex-1 overflow-hidden md:rounded-xl md:border md:border-gray-100 md:bg-[#f8f9fa] md:shadow-sm ${
              hasMobileDetail ? "hidden md:block" : "block"
            }`}
          >
            {loading ? (
              <OrgBoardSkeleton />
            ) : loadError ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <p className="text-sm text-rose-700">组织架构数据加载失败</p>
                <button
                  type="button"
                  onClick={() => {
                    void treeQuery.refetch();
                    void agentsQuery.refetch();
                    void tasksQuery.refetch();
                  }}
                  className="mt-3 rounded-lg border border-rose-200 bg-white px-4 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  重试
                </button>
              </div>
            ) : (
              <OrgBoard
                founder={founder}
                departments={departments}
                directors={directors}
                agents={agents}
                selectedId={selectedId}
                canAddDepartment={availableTemplates.length > 0}
                onSelect={handleSelect}
                onAddDepartment={openAddDepartment}
                onAppointDirector={openAppointDirector}
                onHireEmployee={openHireEmployee}
              />
            )}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={selectedId ?? (isEmpty ? "empty" : "overview")}
              className={
                hasMobileDetail
                  ? "absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden bg-white md:static md:z-auto md:w-[280px] md:flex-shrink-0 md:rounded-xl md:border md:border-gray-100 md:shadow-sm"
                  : "hidden min-h-0 w-[280px] flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm md:flex md:flex-col"
              }
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
            >
              {hasMobileDetail ? (
                <MobileDetailShell title={mobileDetailTitle} onBack={() => setSelectedId(null)}>
                  {rightPanel}
                </MobileDetailShell>
              ) : (
                rightPanel
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <CreateDepartmentModal
        open={deptModalOpen}
        availableTemplates={availableTemplates}
        loading={platformQuery.isLoading}
        submitting={addDeptMutation.isPending}
        error={platformQuery.isError ? "部门模板加载失败" : null}
        onClose={() => setDeptModalOpen(false)}
        onSubmit={(template) => addDeptMutation.mutate(template)}
        onRetry={() => void platformQuery.refetch()}
      />

      <HireAgentModal
        open={hireModalOpen}
        variant={hireVariant}
        departments={departments}
        tree={tree}
        initialDepartmentId={hireDeptId}
        submitting={hireMutation.isPending}
        canAutoApprove={
          membershipQuery.data?.role === "owner" || membershipQuery.data?.role === "admin"
        }
        onClose={() => {
          setHireModalOpen(false);
          setHireDeptId(null);
        }}
        onSubmit={(payload) => hireMutation.mutate(payload)}
      />

      <OrgToast toast={toast} onDismiss={() => setToast(null)} />
    </section>
  );
}
