export async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 协作链路 RPC 轻量重试（固定退避，无 jitter）。
 */
export async function withCollaborationRpcRetries<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = Math.max(1, Math.floor(opts.attempts));
  const baseDelayMs = Math.max(100, opts.baseDelayMs ?? 400);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      if (i < attempts - 1) {
        await sleepMs(baseDelayMs * (i + 1));
      }
    }
  }
  throw lastErr;
}
