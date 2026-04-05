import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger, type INestApplication } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import type { RedisClientType } from 'redis';
import type { Server } from 'socket.io';
import type { RedisConfig } from '../config/interfaces/config.interface.js';
import {
  createGatewayRedisClient,
  wireGatewayRedisErrorHandler,
} from '../redis/gateway-redis-client.js';

function buildRedisConnectionUrl(cfg: RedisConfig): string {
  if (cfg.url?.trim()) {
    return cfg.url.trim();
  }
  const password = cfg.password;
  const auth =
    password !== undefined && password !== null && String(password).length > 0
      ? `:${encodeURIComponent(String(password))}@`
      : '';
  const db = cfg.db ?? 0;
  return `redis://${auth}${cfg.host}:${cfg.port}/${db}`;
}

/**
 * Socket.IO + Redis Adapter：多 Gateway 实例间共享房间与广播（横向扩展）。
 * @see https://socket.io/docs/v4/redis-adapter/
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterBuilder!: ReturnType<typeof createAdapter>;
  private pubClient?: RedisClientType;
  private subClient?: RedisClientType;

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(cfg: RedisConfig): Promise<void> {
    const url = buildRedisConnectionUrl(cfg);
    const pub = createGatewayRedisClient(url, this.logger, 'socket.io-pub');
    const sub = pub.duplicate();
    wireGatewayRedisErrorHandler(sub, this.logger, 'socket.io-sub');
    try {
      await Promise.all([pub.connect(), sub.connect()]);
      this.pubClient = pub;
      this.subClient = sub;
      this.adapterBuilder = createAdapter(this.pubClient, this.subClient);
    } catch (err) {
      await Promise.all([sub.quit().catch(() => undefined), pub.quit().catch(() => undefined)]);
      throw err;
    }
  }

  async disconnectRedis(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    if (this.subClient?.isOpen) {
      tasks.push(this.subClient.quit().catch(() => undefined));
    }
    if (this.pubClient?.isOpen) {
      tasks.push(this.pubClient.quit().catch(() => undefined));
    }
    await Promise.all(tasks);
    this.subClient = undefined;
    this.pubClient = undefined;
  }

  createIOServer(port: number, options?: Record<string, unknown>): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterBuilder) {
      server.adapter(this.adapterBuilder);
    }
    return server;
  }
}
