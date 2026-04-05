/**
 * NestJS ClientRMQ / ServerRMQ 与 amqp-connection-manager 共用的连接选项。
 * 用于降低空闲断连、ECONNRESET 后尽快恢复（心跳 + TCP keep-alive + 重连间隔）。
 *
 * @see @nestjs/microservices/server/server-rmq.js createClient
 * @see @nestjs/microservices/client/client-rmq.js createClient
 */
export const RMQ_NEST_SOCKET_OPTIONS = {
  heartbeatIntervalInSeconds: 30,
  reconnectTimeInSeconds: 5,
  connectionOptions: {
    keepAlive: true,
    keepAliveDelay: 10_000,
  },
} as const;
