import { Logger } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

const lastRedisErrorLogMs = new Map<string, number>();
const REDIS_ERROR_LOG_THROTTLE_MS = 30_000;

function shouldForceIpv4(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost';
  } catch {
    return false;
  }
}

/**
 * node-redis：连接抖动/ECONNRESET 时会 emit error；若不监听会导致 process 因 Unhandled 'error' 退出。
 * 同类错误节流，避免 Redis 不可达时 WARN 刷屏。
 * @see https://github.com/redis/node-redis/blob/master/docs/v4/README.md#error-handling
 */
export function wireGatewayRedisErrorHandler(
  client: RedisClientType,
  logger: Logger,
  label: string,
): void {
  client.on('error', (err) => {
    const now = Date.now();
    const last = lastRedisErrorLogMs.get(label) ?? 0;
    if (now - last >= REDIS_ERROR_LOG_THROTTLE_MS) {
      lastRedisErrorLogMs.set(label, now);
      logger.warn(`Redis [${label}] ${err.message}`);
    }
  });
}

/** 与 node-redis 默认行为一致，但限制无限重试间隔上限，避免日志刷屏 */
export function createGatewayRedisClient(
  url: string,
  logger: Logger,
  label: string,
): RedisClientType {
  const forceIpv4 = shouldForceIpv4(url);
  const client = createClient({
    url,
    socket: {
      // `localhost` 在 Windows 上可能解析为 `::1`（IPv6），经 Docker 端口转发层更容易出现 ECONNRESET。
      // 这里在 url host 为 localhost 时强制走 IPv4。
      ...(forceIpv4 ? { family: 4 as const } : {}),
      // node-redis socket：keepAlive 为 number（毫秒）或 false
      keepAlive: 30_000,
      reconnectStrategy: (retries: number): number | Error => {
        if (retries > 100) {
          return new Error('Redis reconnect limit (gateway)');
        }
        return Math.min(retries * 50, 2000);
      },
    },
    // 定期 ping，避免长时间空闲连接被中间网络设备回收
    pingInterval: 15_000,
  });
  const typed = client as RedisClientType;
  wireGatewayRedisErrorHandler(typed, logger, label);
  return typed;
}
