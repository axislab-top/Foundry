import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { createClient } from 'redis';
import { ConfigService } from '../config/config.service.js';
import { serializeUnknownErrorForLog } from '../logging/serialize-unknown-error.js';
import { redactRedisUrlForLog, redisUrlFingerprint } from './redis-cache.service.js';

/**
 * Worker 侧协作跨进程 Redis（与 API `MainRoomDraftPatchService` 同源）。
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
      service: 'worker',
      COLLAB_REDIS_URL_configured: Boolean(process.env.COLLAB_REDIS_URL?.trim()),
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
              service: 'worker',
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

  async del(key: string): Promise<void> {
    const redis = await this.ensureClient();
    if (!redis) return;
    try {
      await redis.del(key);
    } catch (e: unknown) {
      this.logger.warn('collab_redis_cache.del_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
    }
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

  async publish(channel: string, message: string): Promise<boolean> {
    const redis = await this.ensureClient();
    if (!redis) return false;
    try {
      await redis.publish(channel, message);
      return true;
    } catch (e: unknown) {
      this.logger.warn('collab_redis_cache.publish_failed', {
        channel,
        fullError: serializeUnknownErrorForLog(e),
      });
      return false;
    }
  }

  /** SADD：原子向 SET 添加成员，返回是否为新成员。 */
  async sadd(key: string, member: string, ttlMs?: number): Promise<boolean> {
    const redis = await this.ensureClient();
    if (!redis) return false;
    try {
      const added = await redis.sAdd(key, member);
      if (ttlMs && ttlMs > 0) {
        await redis.pExpire(key, Math.max(1000, ttlMs));
      }
      return Number(added) === 1;
    } catch (e: unknown) {
      this.logger.warn('collab_redis_cache.sadd_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return false;
    }
  }

  /** SMEMBERS：获取 SET 全部成员。 */
  async smembers(key: string): Promise<string[]> {
    const redis = await this.ensureClient();
    if (!redis) return [];
    try {
      const raw = await redis.sMembers(key);
      return Array.isArray(raw) ? raw.map(String) : [...raw].map(String);
    } catch (e: unknown) {
      this.logger.warn('collab_redis_cache.smembers_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return [];
    }
  }

  /** 原子执行 Lua 脚本。 */
  async evalScript(script: string, keys: string[], args: string[]): Promise<unknown> {
    const redis = await this.ensureClient();
    if (!redis) return null;
    try {
      return await redis.eval(script, { keys, arguments: args });
    } catch (e: unknown) {
      this.logger.warn('collab_redis_cache.eval_script_failed', {
        keys,
        fullError: serializeUnknownErrorForLog(e),
      });
      return null;
    }
  }
}
