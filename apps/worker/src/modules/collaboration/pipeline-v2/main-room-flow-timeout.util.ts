const DEFAULT_MAIN_ROOM_FLOW_TIMEOUT_MS = 30 * 60 * 1000;

export function readMainRoomFlowTimeoutMs(): number {
  const raw = Number(process.env.MAIN_ROOM_FLOW_TIMEOUT_MS ?? DEFAULT_MAIN_ROOM_FLOW_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_MAIN_ROOM_FLOW_TIMEOUT_MS;
}

export class MainRoomFlowTimeoutError extends Error {
  readonly code = 'main_room_flow_timeout';

  constructor(timeoutMs: number) {
    super(`main_room_flow_timeout after ${timeoutMs}ms`);
    this.name = 'MainRoomFlowTimeoutError';
  }
}

/** 防止 Worker 在 runMainRoomFlow 内无限挂起导致 orchestration run 永驻 running。 */
export async function runWithMainRoomFlowTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = readMainRoomFlowTimeoutMs(),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new MainRoomFlowTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
