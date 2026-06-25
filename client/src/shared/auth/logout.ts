import { env } from "@/shared/config/env";
import { clearClientSession } from "@/shared/auth/clearClientSession";import { clearRefreshLock } from "@/shared/auth/crossTabRefreshCoordinator";
import { resetRefreshSessionState } from "@/shared/api/refreshSession";
import { useAuthStore } from "@/shared/store/authStore";

/**
 * 调用网关登出并清除本地会话；即使接口失败也会清理本地状态。
 * 先停掉 refresh 调度并用 raw fetch 登出，避免 axios 拦截器用已失效 token 再次 refresh。
 */
export async function logoutUser(): Promise<void> {
  const refreshToken = useAuthStore.getState().refreshToken?.trim();
  const accessToken = useAuthStore.getState().accessToken?.trim();

  resetRefreshSessionState();
  clearRefreshLock("client");

  if (accessToken && refreshToken) {
    try {
      await fetch(`${env.apiBaseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // 网络或服务端失败时仍执行本地登出
    }
  }

  clearClientSession();
}
