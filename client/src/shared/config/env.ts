function resolveWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured != null && String(configured).trim() !== "") {
    return String(configured);
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  return "ws://localhost:3002/ws";
}

export const env = {
  /** Dev: leave unset so requests use same-origin `/api/*` (proxied by Vite). Prod: set gateway origin. */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  wsUrl: resolveWsUrl(),
};

/** W15：打开 Phase 3 前端桩（WS 监听、仪表盘占位卡片等）；默认关闭 */
export function isPhase3FrontendEnabled(): boolean {
  return (
    import.meta.env.VITE_PHASE3_FRONTEND_ENABLED === "true" || import.meta.env.VITE_PHASE3_FRONTEND_ENABLED === "1"
  );
}

/** 与 API `REGISTER_EMAIL_VERIFICATION_ENABLED` 对齐；默认开启 */
export function isRegisterEmailVerificationEnabled(): boolean {
  const raw = import.meta.env.VITE_REGISTER_EMAIL_VERIFICATION_ENABLED;
  if (raw == null || String(raw).trim() === "") return true;
  return !["0", "false", "no", "off"].includes(String(raw).trim().toLowerCase());
}

/** 本地 MOCK 可选：自动保持登录态与公司上下文（等同 VITE_USE_MOCK_API） */
export function isDemoRecordingEnabled(): boolean {
  const raw = import.meta.env.VITE_DEMO_RECORDING_ENABLED;
  return raw === "true" || raw === "1";
}

/** 本地无后端时使用 mockAdapter 拦截 API */
export function isMockApiEnabled(): boolean {
  if (isDemoRecordingEnabled()) return true;
  const raw = import.meta.env.VITE_USE_MOCK_API;
  return raw === "true" || raw === "1";
}

/** 新手引导；MOCK/Demo 默认关闭，可通过 VITE_ONBOARDING_ENABLED 显式开启 */
export function isOnboardingEnabled(): boolean {
  const raw = import.meta.env.VITE_ONBOARDING_ENABLED;
  if (raw != null && String(raw).trim() !== "") {
    return !["0", "false", "no", "off"].includes(String(raw).trim().toLowerCase());
  }
  if (isDemoRecordingEnabled() || isMockApiEnabled()) return false;
  return true;
}

/** 新建公司高级向导；默认开启（与 API ENABLE_ADVANCED_COMPANY_CREATION_WIZARD 对齐） */
export function isCompanyWizardEnabled(): boolean {
  const raw = import.meta.env.VITE_ENABLE_COMPANY_WIZARD;
  if (raw == null || String(raw).trim() === "") {
    return true;
  }
  return !["0", "false", "no", "off"].includes(String(raw).trim().toLowerCase());
}

