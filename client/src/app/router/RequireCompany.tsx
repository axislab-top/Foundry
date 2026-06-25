import { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import { useCompanyStore } from "@/shared/store/companyStore";

function isUuidLike(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function RequireCompany({ children }: PropsWithChildren) {
  const hydrated = useCompanyStore((s) => s.hydrated);
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-sm text-gray-500">
        加载中…
      </div>
    );
  }

  if (!isUuidLike(companyId)) {
    return <Navigate to="/company-select" replace />;
  }

  return <>{children}</>;
}
