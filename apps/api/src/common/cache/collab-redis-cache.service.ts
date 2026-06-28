import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { createClient } from 'redis';
import { ConfigService } from '../config/config.service.js';
import { serializeUnknownErrorForLog } from '../logging/serialize-unknown-error.js';

export function redactRedisUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    const port = u.port ? `:${u.port}` : '';
    return `${u.protocol}//redacted${port}/(db)`;
  } catch {
    return 'redis:redacted';
  }
}

export function redisUrlFingerprint(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/**
 * API 侧协作跨进程 Redis（与 Worker `MainRoomStrategyGoalSessionService` 同源）。
 * 必须使用 {@link ConfigService.getCollabRedisUrl}，勿用服务隔离的 REDIS_DB。
 */
@Injectable()
export class CollabRedisCacheService {
  private readonly logger = new Logger(CollabRedisCacheService.name);
  private client: ReturnType<typeof createClient> | null = null;
  private connecting: Promise<void> | null = null;
  private envSnapshotLogged = false;
  private connectionReadyLogged = false;

  constructor(private readonly config: ConfigService) {}

  private logEnvSnapshotOnce(): void {
    if (this.envSnapshotLogged) return;
    this.envSnapshotLogged = true;
    const url = this.config.getCollabRedisUrl();
    this.logger.log('collab_redis_cache.env_snapshot', {
      service: 'api',
      COLLAB_REDIS_URL_configured: Boolean(process.env.COLLAB_REDIS_URL?.trim()),
      REDIS_URL_configured: Boolean(this.config.getRedisUrl()?.trim()),
      collabRedisConfigured: Boolean(url?.trim()),
      redactedUrl: url ? redactRedisUrlForLog(url) : null,
      redisUrlFingerprint: url ? redisUrlFingerprint(url) : null,
    });
  }

  private async ensureClient(): Promise<ReturnType<typeof createClient> | null> {
    this.logEnvSnapshotOnce();
    const url = this.config.getCollabRedisUrl();
    if (!url) return null;
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const c = createClient({ url });
        c.on('error', (e) => {
          this.logger.warn('collab_redis_cache.client_error', {
            ...serializeUnknownErrorForLog(e),
            redactedUrl: redactRedisUrlForLog(url),
          });
        });
        try {
          await c.connect();
          let ping: string | undefined;
          try {
            const pong = await c.ping();
            ping = typeof pong === 'string' ? pong : String(pong);
          } catch (pe: unknown) {
            this.logger.warn('collab_redis_cache.ping_failed', {
              ...serializeUnknownErrorForLog(pe),
              redactedUrl: redactRedisUrlForLog(url),
            });
          }
          this.client = c;
          if (!this.connectionReadyLogged) {
            this.connectionReadyLogged = true;
            this.logger.log('collab_redis_cache.connection_ready', {
              redactedUrl: redactRedisUrlForLog(url),
              ping: ping ?? null,
            });
          }
        } catch (e: unknown) {
          this.logger.warn('collab_redis_cache.connect_failed', {
            redactedUrl: redactRedisUrlForLog(url),
            fullError: serializeUnknownErrorForLog(e),
          });
        }
      })().catch(() => undefined) as Promise<void>;
    }
    await this.connecting;
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    const redis = await this.ensureClient();
    if (!redis) return null;
    try {
      const v = await redis.get(key);
      if (v === null || v === undefined) return null;
      return String(v);
    } catch (e: unknown) {
      this.logger.warn('collab_redis_cache.get_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return null;
    }
  }

  async setPx(key: string, value: string, ttlMs: number): Promise<boolean> {
    const redis = await this.ensureClient();
    if (!redis) return false;
    try {
      await redis.set(key, value, { PX: Math.max(1000, ttlMs) });
      return true;
    } catch (e: unknown) {
      this.logger.warn('collab_redis_cache.set_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return false;
    }
  }

  /** SET NX + PX：仅首次写入成功时返回 true（与 Worker 侧幂等闸一致）。 */
  async setNxPx(key: string, value: string, ttlMs: number): Promise<boolean> {
    const redis = await this.ensureClient();
    if (!redis) return false;
    try {
      const r = await redis.set(key, value, { NX: true, PX: Math.max(1000, ttlMs) });
      return r === 'OK';
    } catch (e: unknown) {
      this.logger.warn('collab_redis_cache.set_nx_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return false;
    }
  }
}
