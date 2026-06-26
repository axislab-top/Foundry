import type { Logger } from '@nestjs/common';

/** 非阻塞侧效应失败时记录 warn，避免 `.catch(() => undefined)` 完全吞掉错误。 */
export function logSwallowedSideEffect(
  logger: Logger,
  event: string,
  context: Record<string, unknown>,
  err: unknown,
): void {
  logger.warn(event, {
    ...context,
    err: err instanceof Error ? err.message : String(err),
  });
}
