import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { createClient } from 'redis';
import { ConfigService } from '../config/config.service.js';
import { serializeUnknownErrorForLog } from '../logging/serialize-unknown-error.js';

/** 日志用：不输出可解析主机/库路径，仅保留协议与端口级占位（排障用 `redisUrlFingerprint`）。 */
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
 * Worker 侧轻量 Redis 访问（单例连接）。供协作 planning_continuity_hint 等一次性 KV 使用。
 */
@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: ReturnType<typeof createClient> | null = null;
  private connecting: Promise<void> | null = null;
  private envSnapshotLogged = false;
  private connectionReadyLogged = false;

  constructor(private readonly config: ConfigService) {}

  private logEnvSnapshotOnce(): void {
    if (this.envSnapshotLogged) return;
    this.envSnapshotLogged = true;
    const url = this.config.getRedisUrl();
    this.logger.log('redis_cache.env_snapshot', {
      service: 'worker',
      REDIS_URL_configured: Boolean(url?.trim()),
      redactedUrl: url ? redactRedisUrlForLog(url) : null,
      redisUrlFingerprint: url ? redisUrlFingerprint(url) : null,
      hint: url ? 'will_attempt_connect_on_first_use' : 'set_REDIS_URL_to_enable_redis_cache',
    });
  }

  private async ensureClient(): Promise<ReturnType<typeof createClient> | null> {
    this.logEnvSnapshotOnce();
    const url = this.config.getRedisUrl();
    if (!url) return null;
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const c = createClient({ url });
        c.on('error', (e) => {
          this.logger.warn('redis_cache.client_error', {
            ...serializeUnknownErrorForLog(e),
            redactedUrl: redactRedisUrlForLog(url),
          });
        });
        try {
          await c.connect();
          let ping: string | undefined;
          try {
            const pong = await c.ping();
            ping = typeof pong === 'string' ? pong : Buffer.isBuffer(pong) ? pong.toString('utf8') : String(pong);
          } catch (pe: unknown) {
            this.logger.warn('redis_cache.ping_failed', {
              ...serializeUnknownErrorForLog(pe),
              redactedUrl: redactRedisUrlForLog(url),
            });
          }
          this.client = c;
          if (!this.connectionReadyLogged) {
            this.connectionReadyLogged = true;
            this.logger.log('redis_cache.connection_ready', {
              service: 'worker',
              redactedUrl: redactRedisUrlForLog(url),
              ping: ping ?? null,
            });
          }
        } catch (e: unknown) {
          this.logger.warn('redis_cache.connect_failed', {
            service: 'worker',
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
      this.logger.warn('redis_cache.set_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return false;
    }
  }

  /** SET NX + PX：仅首次写入成功时返回 true（用于派单消息等幂等闸）。 */
  async setNxPx(key: string, value: string, ttlMs: number): Promise<boolean> {
    const redis = await this.ensureClient();
    if (!redis) return false;
    try {
      const r = await redis.set(key, value, { NX: true, PX: Math.max(1000, ttlMs) });
      return r === 'OK';
    } catch (e: unknown) {
      this.logger.warn('redis_cache.set_nx_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return false;
    }
  }

  /** 普通读取（不删除）；Redis 未配置或失败时返回 null。 */
  async get(key: string): Promise<string | null> {
    const redis = await this.ensureClient();
    if (!redis) return null;
    try {
      const v = await redis.get(key);
      if (v === null || v === undefined) return null;
      return String(v);
    } catch (e: unknown) {
      this.logger.warn('redis_cache.get_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return null;
    }
  }

  /** 删除键（幂等；Redis 未配置时 no-op）。 */
  async del(key: string): Promise<void> {
    const redis = await this.ensureClient();
    if (!redis) return;
    try {
      await redis.del(key);
    } catch (e: unknown) {
      this.logger.warn('redis_cache.del_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
    }
  }

  /** 仅当当前值等于 expected 时删除（用于分布式锁安全释放）。 */
  async delIfValueMatches(key: string, expected: string): Promise<boolean> {
    const redis = await this.ensureClient();
    if (!redis) return false;
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const r = await redis.eval(script, { keys: [key], arguments: [expected] });
      return Number(r) === 1;
    } catch (e: unknown) {
      this.logger.warn('redis_cache.del_if_match_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return false;
    }
  }

  /** 读取并删除（一次性消费） */
  async getDel(key: string): Promise<string | null> {
    const redis = await this.ensureClient();
    if (!redis) return null;
    try {
      const v = await redis.get(key);
      if (v === null || v === undefined) return null;
      await redis.del(key);
      return String(v);
    } catch (e: unknown) {
      this.logger.warn('redis_cache.get_del_failed', {
        key,
        fullError: serializeUnknownErrorForLog(e),
      });
      return null;
    }
  }

  /** 原子执行 Lua 脚本。 */
  async evalScript(script: string, keys: string[], args: string[]): Promise<unknown> {
    const redis = await this.ensureClient();
    if (!redis) return null;
    try {
      return await redis.eval(script, { keys, arguments: args });
    } catch (e: unknown) {
      this.logger.warn('redis_cache.eval_script_failed', {
        keys,
        fullError: serializeUnknownErrorForLog(e),
      });
      return null;
    }
  }
}
