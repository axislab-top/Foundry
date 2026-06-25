const BLOCKED_REDIRECT_PREFIXES = ["/login", "/register", "/company-select", "/reset-password", "/auth"];

function isUuidLike(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** 登录/选公司后的默认落地页 */
export const DEFAULT_POST_AUTH_PATH = "/collaboration/chats";

/** 登出或会话失效后的统一入口 */
export const DEFAULT_GUEST_AUTH_PATH = "/login";

const AUTH_RETURN_TO_KEY = "foundry.auth.returnTo";
const AUTH_SESSION_EXPIRED_KEY = "foundry.auth.sessionExpired";

function isStashableReturnPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  return !BLOCKED_REDIRECT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** 会话失效跳转登录前，记住用户当前页面以便登录后回到原处 */
export function stashAuthReturnTo(path?: string): void {
  if (typeof window === "undefined") return;
  const target = (path ?? `${window.location.pathname}${window.location.search}`).trim();
  if (!isStashableReturnPath(target)) return;
  try {
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, target);
  } catch {
    // ignore quota / private mode
  }
}

export function consumeAuthReturnTo(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
    if (!raw?.trim() || !isStashableReturnPath(raw)) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

export function markSessionExpiredForLogin(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_SESSION_EXPIRED_KEY, "1");
  } catch {
    // ignore
  }
}

export function consumeSessionExpiredNotice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = sessionStorage.getItem(AUTH_SESSION_EXPIRED_KEY);
    sessionStorage.removeItem(AUTH_SESSION_EXPIRED_KEY);
    return flag === "1";
  } catch {
    return false;
  }
}

/**
 * 解析登录前用户想访问的路径（RequireAuth 写入 location.state.from）。
 * 仅允许站内相对路径，排除认证相关路由。
 */
export function resolvePostAuthDestination(from: unknown): string {
  if (typeof from !== "string") return DEFAULT_POST_AUTH_PATH;
  const path = from.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return DEFAULT_POST_AUTH_PATH;
  if (BLOCKED_REDIRECT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return DEFAULT_POST_AUTH_PATH;
  }
  return path;
}

export function getAuthenticatedEntryPath(companyId: unknown): string {
  if (!isUuidLike(companyId)) return "/company-select";
  return DEFAULT_POST_AUTH_PATH;
}
