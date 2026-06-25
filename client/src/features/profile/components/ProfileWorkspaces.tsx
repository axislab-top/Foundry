import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Building2, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { isCompanyWizardEnabled } from "@/shared/config/env";
import type { CompanyListItem, CompanyCreationQuota } from "@/features/auth/api/companiesApi";
import {
  getMyActiveCompanyMembership,
  type CompanyMembershipRole,
} from "@/shared/api/companyMembershipApi";
import DeleteCompanyConfirmModal from "./DeleteCompanyConfirmModal";
import { resolveCompanyName } from "../utils";

type ProfileWorkspacesProps = {
  companies: CompanyListItem[];
  loading: boolean;
  hasError: boolean;
  activeCompanyId?: string;
  creationQuota?: CompanyCreationQuota;
  deleteTarget?: CompanyListItem | null;
  deleteSubmitting?: boolean;
  deleteError?: string;
  onSelectCompany: (company: { id: string; name: string }) => void;
  onOpenDeleteCompany: (company: CompanyListItem) => void;
  onCloseDeleteCompany: () => void;
  onConfirmDeleteCompany: () => void;
};

function canManageCompany(role?: CompanyMembershipRole | null): boolean {
  return role === "owner" || role === "admin";
}

export default function ProfileWorkspaces({
  companies,
  loading,
  hasError,
  activeCompanyId,
  creationQuota,
  deleteTarget,
  deleteSubmitting,
  deleteError,
  onSelectCompany,
  onOpenDeleteCompany,
  onCloseDeleteCompany,
  onConfirmDeleteCompany,
}: ProfileWorkspacesProps) {
  const navigate = useNavigate();
  const canCreate = creationQuota ? creationQuota.canCreate : true;

  const membershipQueries = useQueries({
    queries: companies.map((company) => ({
      queryKey: ["company-membership", "profile", company.id],
      queryFn: () => getMyActiveCompanyMembership(company.id),
      staleTime: 60_000,
      enabled: companies.length > 0,
    })),
  });

  const manageByCompanyId = useMemo(() => {
    const map = new Map<string, boolean>();
    companies.forEach((company, index) => {
      const query = membershipQueries[index];
      map.set(company.id, canManageCompany(query?.data?.role));
    });
    return map;
  }, [companies, membershipQueries]);

  const deleteTargetName = deleteTarget ? resolveCompanyName(deleteTarget) : "";

  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">我的工作空间</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Workspaces — 管理已加入的公司、切换或删除工作空间
            </p>
          </div>
          {isCompanyWizardEnabled() && canCreate ? (
            <button
              type="button"
              onClick={() => navigate("/company-create")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" />
              新建公司
            </button>
          ) : null}
          {isCompanyWizardEnabled() && creationQuota && !creationQuota.canCreate ? (
            <span className="shrink-0 text-xs text-gray-500">
              已达上限 {creationQuota.ownedCount}/{creationQuota.maxOwned}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载工作空间列表…
          </div>
        ) : hasError ? (
          <p className="py-8 text-center text-sm text-red-600">工作空间列表加载失败，请稍后刷新重试。</p>
        ) : companies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-600">尚未加入任何工作空间</p>
            <button
              type="button"
              onClick={() => navigate("/company-select")}
              className="mt-3 text-sm font-medium text-[#2d5a8e] hover:underline"
            >
              前往选择或创建公司
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {companies.map((company) => {
              const name = resolveCompanyName(company);
              const active = activeCompanyId === company.id;
              const canManage = manageByCompanyId.get(company.id) ?? false;
              const statusLabel =
                company.status?.trim().toUpperCase() === "DRAFT"
                  ? "草稿"
                  : company.status?.trim().toUpperCase() === "SUSPENDED"
                    ? "已暂停"
                    : undefined;

              return (
                <div
                  key={company.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                    active ? "border-blue-200 bg-blue-50/50" : "border-gray-100 bg-white"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${
                        active ? "bg-[#1e3a5f]" : "bg-gray-400"
                      }`}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{name}</p>
                      <p className="text-xs text-gray-500">
                        {active ? "当前工作空间" : "点击切换"}
                        {statusLabel ? ` · ${statusLabel}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => onOpenDeleteCompany(company)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                        aria-label={`删除 ${name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    ) : null}
                    {active ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                        <Check className="h-3.5 w-3.5" />
                        使用中
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectCompany({ id: company.id, name })}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        切换
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 rounded-lg border border-red-100 bg-red-50/40 px-4 py-3">
          <p className="text-xs font-medium text-red-800">危险操作</p>
          <p className="mt-1 text-xs text-red-700/80">
            删除公司将永久清除该工作空间内的全部数据。仅 Owner / Admin 可见删除入口。
          </p>
        </div>
      </section>

      <AnimatePresence>
        {deleteTarget ? (
          <DeleteCompanyConfirmModal
            companyName={deleteTargetName}
            isActive={activeCompanyId === deleteTarget.id}
            submitting={deleteSubmitting}
            errorMessage={deleteError}
            onConfirm={onConfirmDeleteCompany}
            onCancel={onCloseDeleteCompany}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
