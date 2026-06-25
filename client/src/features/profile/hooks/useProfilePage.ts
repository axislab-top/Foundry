import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCompanyCreationQuota } from "@/features/auth/hooks/useCompanyCreationQuota";
import { deleteCompany, listMyCompanies, type CompanyListItem } from "@/features/auth/api/companiesApi";
import { decodeJwtPayload } from "@/shared/auth/decodeJwtPayload";
import { extractApiError } from "@/shared/api/extractApiError";
import { resolveCompanyName } from "../utils";
import { useCompanyStore } from "@/shared/store/companyStore";
import { switchActiveCompany } from "@/shared/store/switchActiveCompany";
import type { ProfileTab } from "../constants";
import {
  resolveAccountTypeLabel,
  resolveAvatarLabel,
  resolveDisplayName,
  resolveRoleLabel,
} from "../utils";

export function useProfilePage() {
  const navigate = useNavigate();
  const { accessToken, logout, requestPasswordReset } = useAuth();
  const queryClient = useQueryClient();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const clearActiveCompany = useCompanyStore((s) => s.clearActiveCompany);

  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [loggingOut, setLoggingOut] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<CompanyListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const profile = useMemo(() => decodeJwtPayload(accessToken), [accessToken]);
  const displayName = resolveDisplayName(profile);
  const avatarLabel = resolveAvatarLabel(displayName);
  const roleLabel = resolveRoleLabel(profile);
  const accountTypeLabel = resolveAccountTypeLabel(profile);

  const companiesQuery = useQuery({
    queryKey: ["my-companies", "profile"],
    queryFn: async () => await listMyCompanies({ page: 1, pageSize: 50 }),
    staleTime: 30_000,
  });

  const quotaQuery = useCompanyCreationQuota();

  const companies = companiesQuery.data?.items ?? [];
  const companyCount = companies.length;

  const deleteMutation = useMutation({
    mutationFn: async (company: CompanyListItem) => {
      await deleteCompany(company.id);
      return company;
    },
    onSuccess: async (deletedCompany) => {
      await queryClient.invalidateQueries({ queryKey: ["my-companies"] });
      await queryClient.invalidateQueries({ queryKey: ["company-creation-quota"] });

      const remaining = companies.filter((item) => item.id !== deletedCompany.id);
      const deletedWasActive = activeCompany?.id === deletedCompany.id;

      if (deletedWasActive) {
        if (remaining.length > 0) {
          const next = remaining[0]!;
          await switchActiveCompany(queryClient, {
            id: next.id,
            name: resolveCompanyName(next),
          });
        } else {
          clearActiveCompany();
          navigate("/company-select", { replace: true });
        }
      }

      setDeleteTarget(null);
      setDeleteError(undefined);
    },
    onError: (error) => {
      setDeleteError(extractApiError(error, "删除失败，请稍后重试"));
    },
  });

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, logout]);

  const handleRequestPasswordReset = useCallback(async () => {
    const email = profile?.email?.trim();
    if (!email || resetSending) return;
    setResetSending(true);
    setResetMessage(undefined);
    const result = await requestPasswordReset(email);
    setResetSending(false);
    setResetMessage(result.message);
  }, [profile?.email, requestPasswordReset, resetSending]);

  const handleSelectCompany = useCallback(
    (company: { id: string; name: string }) => {
      void switchActiveCompany(queryClient, company);
    },
    [queryClient],
  );

  const handleOpenDeleteCompany = useCallback((company: CompanyListItem) => {
    setDeleteError(undefined);
    setDeleteTarget(company);
  }, []);

  const handleCloseDeleteCompany = useCallback(() => {
    if (deleteMutation.isPending) return;
    setDeleteTarget(null);
    setDeleteError(undefined);
  }, [deleteMutation.isPending]);

  const handleConfirmDeleteCompany = useCallback(() => {
    if (!deleteTarget || deleteMutation.isPending) return;
    deleteMutation.mutate(deleteTarget);
  }, [deleteMutation, deleteTarget]);

  return {
    activeTab,
    setActiveTab,
    profile,
    displayName,
    avatarLabel,
    roleLabel,
    accountTypeLabel,
    activeCompany,
    onSelectCompany: handleSelectCompany,
    companies,
    companyCount,
    companiesLoading: companiesQuery.isLoading,
    companiesError: companiesQuery.isError,
    creationQuota: quotaQuery.data,
    loggingOut,
    resetSending,
    resetMessage,
    handleLogout,
    handleRequestPasswordReset,
    deleteTarget,
    deleteSubmitting: deleteMutation.isPending,
    deleteError,
    onOpenDeleteCompany: handleOpenDeleteCompany,
    onCloseDeleteCompany: handleCloseDeleteCompany,
    onConfirmDeleteCompany: handleConfirmDeleteCompany,
  };
}
