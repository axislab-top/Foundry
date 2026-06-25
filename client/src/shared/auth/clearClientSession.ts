import { resetRefreshSessionState } from "@/shared/api/refreshSession";
import { clearRefreshLock } from "@/shared/auth/crossTabRefreshCoordinator";
import { purgePersistedClientSession } from "@/shared/auth/clientSession";
import {
  markSessionExpiredForLogin,
  stashAuthReturnTo,
} from "@/shared/auth/postAuthRedirect";
import { applyDemoRecordingSession } from "@/shared/demo/demoRecordingBootstrap";
import { isDemoRecordingEnabled } from "@/shared/config/env";

export type ClearClientSessionOptions = {
  /** 因 refresh 失败被动登出（区别于用户主动登出） */
  sessionExpired?: boolean;
};

export function clearClientSession(options?: ClearClientSessionOptions): void {
  resetRefreshSessionState();
  clearRefreshLock("client");

  // [MOCK] 演示录制：禁止登出跳转，避免 /login ↔ /home 死循环
  if (isDemoRecordingEnabled()) {
    applyDemoRecordingSession();
    return;
  }

  purgePersistedClientSession();

  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    stashAuthReturnTo();
    if (options?.sessionExpired) {
      markSessionExpiredForLogin();
    }
    window.location.assign("/login");
  }
}
