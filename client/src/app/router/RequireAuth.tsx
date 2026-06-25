import { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { hasClientSession, reconcileStaleClientSession } from "@/shared/auth/clientSession";
import { useAuthStore } from "@/shared/store/authStore";

export default function RequireAuth({ children }: PropsWithChildren) {
  const location = useLocation();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const accessTokenExpiresAt = useAuthStore((s) => s.accessTokenExpiresAt);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-sm text-gray-500">
        加载中…
      </div>
    );
  }

  reconcileStaleClientSession();

  const session = { accessToken, refreshToken, accessTokenExpiresAt };
  if (!hasClientSession(session)) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <>{children}</>;
}
