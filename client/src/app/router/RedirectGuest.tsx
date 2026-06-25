import { PropsWithChildren, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { verifyPersistedSessionAlive } from "@/shared/api/refreshSession";
import { clearClientSession } from "@/shared/auth/clearClientSession";
import {
  hasClientSession,
  readClientSessionSnapshot,
  reconcileStaleClientSession,
} from "@/shared/auth/clientSession";
import { getAuthenticatedEntryPath } from "@/shared/auth/postAuthRedirect";
import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";

type GuestProbe = "pending" | "guest" | "authenticated";

/** 已登录用户访问 /login、/register 时重定向到应用内（须先向 Gateway 验证会话仍有效） */
export default function RedirectGuest({ children }: PropsWithChildren) {
  const authHydrated = useAuthStore((s) => s.hydrated);
  const companyHydrated = useCompanyStore((s) => s.hydrated);
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const [probe, setProbe] = useState<GuestProbe>("pending");

  useEffect(() => {
    if (!authHydrated || !companyHydrated) {
      return;
    }

    let cancelled = false;

    void (async () => {
      reconcileStaleClientSession();

      if (!hasClientSession(readClientSessionSnapshot())) {
        if (!cancelled) setProbe("guest");
        return;
      }

      const alive = await verifyPersistedSessionAlive();
      if (cancelled) return;

      if (!alive) {
        clearClientSession({ sessionExpired: true });
        if (!cancelled) setProbe("guest");
        return;
      }

      setProbe("authenticated");
    })();

    return () => {
      cancelled = true;
    };
  }, [authHydrated, companyHydrated]);

  if (!authHydrated || !companyHydrated || probe === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020202] text-sm text-zinc-500">
        加载中…
      </div>
    );
  }

  if (probe === "authenticated") {
    return <Navigate to={getAuthenticatedEntryPath(companyId)} replace />;
  }

  return <>{children}</>;
}
