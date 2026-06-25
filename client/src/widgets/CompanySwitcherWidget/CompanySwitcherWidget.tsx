import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { listMyCompanies } from "@/features/auth/api/companiesApi";
import { useCompanyCreationQuota } from "@/features/auth/hooks/useCompanyCreationQuota";
import { isCompanyWizardEnabled } from "@/shared/config/env";
import { useCompanyStore } from "@/shared/store/companyStore";
import { switchActiveCompany } from "@/shared/store/switchActiveCompany";

export default function CompanySwitcherWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeCompany } = useCompanyStore();
  const companyName = activeCompany?.name ?? "未选择公司";
  const companyMeta = activeCompany ? "专业版" : "请先选择/创建公司";
  const avatarLabel = companyName.trim().charAt(0) || "F";

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const companiesQuery = useQuery({
    queryKey: ["my-companies", "sidebar-switcher"],
    queryFn: async () => await listMyCompanies({ page: 1, pageSize: 50 }),
    enabled: open,
    staleTime: 10_000,
  });

  const quotaQuery = useCompanyCreationQuota(open && isCompanyWizardEnabled());

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  const items = companiesQuery.data?.items ?? [];

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white p-1.5 text-left shadow-sm transition-all hover:border-gray-300"
      >
        <div className="flex min-w-0 items-center">
          <div className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-600 text-sm font-bold text-white shadow-inner">
            {avatarLabel}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight text-gray-900">{companyName}</p>
            <p className="truncate text-[11px] text-gray-500">{companyMeta}</p>
          </div>
        </div>
        <div className="ml-2 flex items-center text-gray-400">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <div className="max-h-[320px] overflow-auto p-1.5">
            {companiesQuery.isLoading ? (
              <div className="px-3 py-2 text-xs text-gray-500">加载公司列表中…</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">暂无公司。</div>
            ) : (
              items.map((c) => {
                const name = c.displayName ?? c.name ?? `Company ${c.id}`;
                const active = !!activeCompany?.id && activeCompany.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void switchActiveCompany(queryClient, { id: c.id, name }).then(() => {
                        setOpen(false);
                        navigate("/collaboration/chats");
                      });
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      active ? "bg-blue-50 text-blue-700" : "text-gray-800 hover:bg-gray-100"
                    }`}
                  >
                    <span className="truncate">{name}</span>
                    {active ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })
            )}
          </div>

          {isCompanyWizardEnabled() ? (
            <div className="border-t border-gray-100 p-1.5">
              {quotaQuery.data && !quotaQuery.data.canCreate ? (
                <p className="px-3 py-2 text-xs text-gray-500">
                  已达创建上限（{quotaQuery.data.maxOwned} 家）
                </p>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    navigate("/company-create");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100"
                >
                  <Plus className="h-4 w-4 text-gray-500" />
                  新建公司
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
