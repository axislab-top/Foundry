import { computeAccessTokenExpiresAt } from "@/shared/auth/accessTokenExpiry";
import { isDemoRecordingEnabled } from "@/shared/config/env";
import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";

const MOCK_ACCESS_TOKEN = "mock-jwt-token-for-dev";
const MOCK_REFRESH_TOKEN = "mock-refresh-token-for-dev";
const MOCK_COMPANY_ID = "a0a0a0a0-b1b1-4122-8122-a11111111111";
const DEMO_COMPANY_NAME = "星火内容工作室";

/** 演示录制：同步注入登录态与公司，避免 persist rehydrate 卡住 hydrated */
export function applyDemoRecordingSession(): void {
  if (!isDemoRecordingEnabled()) return;

  const accessTokenExpiresAt = computeAccessTokenExpiresAt(MOCK_ACCESS_TOKEN, 99999);
  useAuthStore.setState({
    accessToken: MOCK_ACCESS_TOKEN,
    refreshToken: MOCK_REFRESH_TOKEN,
    expiresIn: 99999,
    accessTokenExpiresAt,
    hydrated: true,
  });
  useCompanyStore.setState({
    activeCompany: { id: MOCK_COMPANY_ID, name: DEMO_COMPANY_NAME },
    hydrated: true,
  });
}

/** 在 React 挂载前调用；并为 persist 完成后再兜底一次 */
export function bootstrapDemoRecording(): void {
  if (!isDemoRecordingEnabled()) return;

  applyDemoRecordingSession();

  const finishAuth = () => {
    if (!useAuthStore.getState().hydrated) {
      useAuthStore.setState({ hydrated: true });
    }
    if (!useAuthStore.getState().accessToken) {
      applyDemoRecordingSession();
    }
  };
  const finishCompany = () => {
    if (!useCompanyStore.getState().hydrated) {
      useCompanyStore.setState({ hydrated: true });
    }
    if (!useCompanyStore.getState().activeCompany?.id) {
      useCompanyStore.setState({
        activeCompany: { id: MOCK_COMPANY_ID, name: DEMO_COMPANY_NAME },
      });
    }
  };

  if (useAuthStore.persist.hasHydrated()) {
    finishAuth();
  } else {
    useAuthStore.persist.onFinishHydration(finishAuth);
  }

  if (useCompanyStore.persist.hasHydrated()) {
    finishCompany();
  } else {
    useCompanyStore.persist.onFinishHydration(finishCompany);
  }
}
