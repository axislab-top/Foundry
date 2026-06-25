import { Navigate } from "react-router-dom";
import LandingPage from "@/features/landing/page";
import { getAuthenticatedEntryPath } from "@/shared/auth/postAuthRedirect";
import {
  reconcileStaleClientSession,
  shouldRedirectAuthenticatedGuest,
} from "@/shared/auth/clientSession";
import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";

export default function LandingGuard() {
  const authHydrated = useAuthStore((s) => s.hydrated);
  const companyHydrated = useCompanyStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const accessTokenExpiresAt = useAuthStore((s) => s.accessTokenExpiresAt);
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  if (!authHydrated || !companyHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020202] text-sm text-zinc-500">
        加载中…
      </div>
    );
  }

  reconcileStaleClientSession();

  const session = { accessToken, refreshToken, accessTokenExpiresAt };
  if (shouldRedirectAuthenticatedGuest(session)) {
    return <Navigate to={getAuthenticatedEntryPath(companyId)} replace />;
  }

  return <LandingPage />;
}
