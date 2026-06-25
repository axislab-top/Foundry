export type AuthRefreshScope = "client" | "admin";

export type CoordinatedRefreshContext = {
  role: "leader" | "follower";
};

const LOCK_TTL_MS = 45_000;
const POLL_INTERVAL_MS = 80;

type LockState =
  | { status: "in-flight"; tabId: string; startedAt: number }
  | { status: "done"; tabId: string; completedAt: number };

type RefreshDoneMessage = { type: "refresh-done"; scope: AuthRefreshScope };

function lockKey(scope: AuthRefreshScope): string {
  return `foundry:auth:refresh-lock:${scope}`;
}

function channelName(scope: AuthRefreshScope): string {
  return `foundry:auth:refresh:${scope}`;
}

let tabId: string | null = null;

function getTabId(): string {
  if (tabId) return tabId;
  tabId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return tabId;
}

function readLock(scope: AuthRefreshScope): LockState | null {
  try {
    const raw = localStorage.getItem(lockKey(scope));
    if (!raw) return null;
    return JSON.parse(raw) as LockState;
  } catch {
    return null;
  }
}

function writeLock(scope: AuthRefreshScope, state: LockState): void {
  localStorage.setItem(lockKey(scope), JSON.stringify(state));
}

function clearLock(scope: AuthRefreshScope): void {
  localStorage.removeItem(lockKey(scope));
}

/** 登出时释放跨 Tab refresh 锁，避免其他标签页继续等待无效 refresh */
export function clearRefreshLock(scope: AuthRefreshScope): void {
  if (typeof window === "undefined") return;
  clearLock(scope);
}

function tryAcquireLock(scope: AuthRefreshScope, ownerTabId: string): boolean {
  const now = Date.now();
  const current = readLock(scope);
  if (
    current?.status === "in-flight" &&
    current.tabId !== ownerTabId &&
    now - current.startedAt < LOCK_TTL_MS
  ) {
    return false;
  }
  writeLock(scope, { status: "in-flight", tabId: ownerTabId, startedAt: now });
  const verify = readLock(scope);
  return verify?.status === "in-flight" && verify.tabId === ownerTabId;
}

function getBroadcastChannel(scope: AuthRefreshScope): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(channelName(scope));
  } catch {
    return null;
  }
}

function waitForLeaderDone(scope: AuthRefreshScope): Promise<boolean> {
  return new Promise((resolve) => {
    const key = lockKey(scope);
    const bc = getBroadcastChannel(scope);
    let settled = false;

    const finish = (handled: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      window.removeEventListener("storage", onStorage);
      bc?.close();
      resolve(handled);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      const state = readLock(scope);
      if (state?.status === "done") {
        finish(true);
      }
      if (!state) {
        finish(false);
      }
    };

    const onMessage = (event: MessageEvent<RefreshDoneMessage>) => {
      if (event.data?.type === "refresh-done" && event.data.scope === scope) {
        finish(true);
      }
    };

    const timeoutId = window.setTimeout(() => finish(false), LOCK_TTL_MS);

    window.addEventListener("storage", onStorage);
    bc?.addEventListener("message", onMessage);

    const state = readLock(scope);
    if (state?.status === "done") {
      finish(true);
    }
  });
}

function publishLeaderDone(scope: AuthRefreshScope, ownerTabId: string): void {
  writeLock(scope, {
    status: "done",
    tabId: ownerTabId,
    completedAt: Date.now(),
  });
  const bc = getBroadcastChannel(scope);
  try {
    bc?.postMessage({ type: "refresh-done", scope } satisfies RefreshDoneMessage);
  } finally {
    bc?.close();
  }
  window.setTimeout(() => {
    const state = readLock(scope);
    if (state?.status === "done" && state.tabId === ownerTabId) {
      clearLock(scope);
    }
  }, 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Ensures only one browser tab calls the refresh endpoint per app scope.
 * Followers re-read tokens from storage after the leader completes.
 */
export async function runCoordinatedRefresh<T>(
  scope: AuthRefreshScope,
  run: (ctx: CoordinatedRefreshContext) => Promise<T>,
): Promise<T> {
  if (typeof window === "undefined") {
    return run({ role: "leader" });
  }

  const ownerTabId = getTabId();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (tryAcquireLock(scope, ownerTabId)) {
      try {
        const result = await run({ role: "leader" });
        publishLeaderDone(scope, ownerTabId);
        return result;
      } catch (error) {
        clearLock(scope);
        throw error;
      }
    }

    const leaderFinished = await waitForLeaderDone(scope);
    if (leaderFinished) {
      await sleep(POLL_INTERVAL_MS);
      return run({ role: "follower" });
    }
    await sleep(POLL_INTERVAL_MS);
  }

  return run({ role: "leader" });
}

/**
 * Re-sync in-memory auth state when another tab updates localStorage.
 */
export function subscribeToAuthStorageSync(
  storageKey: string,
  onSync: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    // 另一标签页登出并 clearStorage 时 newValue 为 null，需同步清空内存态
    if (event.newValue == null) {
      onSync();
      return;
    }
    onSync();
  };

  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
