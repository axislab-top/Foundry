/**
 * NestJS ClientRMQ / ServerRMQ 与 amqp-connection-manager 共用的连接选项。
 * 用于降低空闲断连、ECONNRESET 后尽快恢复（心跳 + TCP keep-alive + 重连间隔）。
 *
 * @see @nestjs/microservices/server/server-rmq.js createClient
 * @see @nestjs/microservices/client/client-rmq.js createClient
 */
function readPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

/**
 * 约定：
 * - 生产建议 heartbeat >= 60（Node 事件循环短暂卡顿/GC/CPU 峰值更不容易误判假死）
 * - reconnectTime 保持较小，断线后尽快恢复
 */
const heartbeatIntervalInSeconds = readPositiveIntEnv(
  'RMQ_HEARTBEAT_SECONDS',
  60,
);
const reconnectTimeInSeconds = readPositiveIntEnv('RMQ_RECONNECT_SECONDS', 5);
const keepAliveDelayMs = readPositiveIntEnv('RMQ_KEEPALIVE_DELAY_MS', 10_000);

export const RMQ_NEST_SOCKET_OPTIONS = {
  heartbeatIntervalInSeconds,
  reconnectTimeInSeconds,
  connectionOptions: {
    keepAlive: true,
    keepAliveDelay: keepAliveDelayMs,
  },
} as const;
