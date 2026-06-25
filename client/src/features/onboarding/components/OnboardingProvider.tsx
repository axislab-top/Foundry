import { PropsWithChildren, useEffect } from "react";
import { useOnboardingStore } from "@/features/onboarding/store/onboardingStore";
import { decodeJwtPayload } from "@/shared/auth/decodeJwtPayload";
import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";

export default function OnboardingProvider({ children }: PropsWithChildren) {
  const companyHydrated = useCompanyStore((s) => s.hydrated);
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  const loadForCompany = useOnboardingStore((s) => s.loadForCompany);

  useEffect(() => {
    if (!companyHydrated || !companyId) return;
    const userId = decodeJwtPayload(accessToken)?.sub?.trim();
    if (!userId) return;
    void loadForCompany({ userId, companyId });
  }, [companyHydrated, companyId, accessToken, loadForCompany]);

  return <>{children}</>;
}
