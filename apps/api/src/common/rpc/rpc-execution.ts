import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

interface ExecuteRpcOptions<T> {
  logger: Logger;
  pattern: string;
  timeoutMs?: number;
  payload?: unknown;
  handler: () => Promise<T>;
}

function summarizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const source = payload as Record<string, unknown>;
  return {
    companyId: typeof source.companyId === 'string' ? source.companyId : undefined,
    actorId:
      source.actor && typeof source.actor === 'object'
        ? (source.actor as Record<string, unknown>).id
        : undefined,
  };
}

export async function executeRpc<T>({
  logger,
  pattern,
  timeoutMs = 15000,
  payload,
  handler,
}: ExecuteRpcOptions<T>): Promise<T> {
  const startedAt = Date.now();
  logger.debug(`RPC start: ${pattern}`, summarizePayload(payload));

  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(
        new RpcException({
          status: 504,
          message: `RPC handler timeout: ${pattern} (${timeoutMs}ms)`,
        }),
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([handler(), timeoutPromise]);
    logger.debug(`RPC done: ${pattern}`, { durationMs: Date.now() - startedAt });
    return result;
  } catch (error: unknown) {
    logger.error(`RPC failed: ${pattern}`, {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
