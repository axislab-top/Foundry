import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { ConfigService } from '../../../common/config/config.service.js';

/** Redis 镜像载荷：字段名统一使用 executionTokenId（与 DTO / Span / 日志一致） */
export interface ExecutionTokenMirrorPayload {
  executionTokenId: string;
  companyId: string;
  approvalRequestId: string;
  action: string;
  skillSlug?: string | null;
  used: boolean;
  expiresAtIso: string;
}

/**
 * 执行令牌 Redis 镜像：签发时 SETEX，消费成功后 DEL；用于快速拒绝错误租户/动作/skill 绑定。
 * 权威消费仍在 PostgreSQL；Redis 缺失时回退仅走 PG。
 */
@Injectable()
export class ApprovalRedisMirrorService implements OnModuleDestroy {
  private readonly logger = new Logger(ApprovalRedisMirrorService.name);
  private client: RedisClientType | null = null;

  constructor(private readonly config: ConfigService) {}

  private key(executionTokenId: string): string {
    return `m4:executionTokenId:${executionTokenId}`;
  }

  /** 兼容历史键（仅 assert / onConsumed 读取或删除） */
  private legacyKey(executionTokenId: string): string {
    return `m4:exec:${executionTokenId}`;
  }

  private usedKey(executionTokenId: string): string {
    return `m4:executionTokenId:used:${executionTokenId}`;
  }

  private legacyUsedKey(executionTokenId: string): string {
    return `m4:exec:used:${executionTokenId}`;
  }

  isEnabled(): boolean {
    if (process.env.M4_EXECUTION_TOKEN_REDIS_MIRROR === 'false') return false;
    const rc = this.config.getRedisConfig();
    return !!(rc.url || rc.host);
  }

  private async ensureClient(): Promise<RedisClientType | null> {
    if (!this.isEnabled()) return null;
    if (this.client) return this.client;
    const rc = this.config.getRedisConfig();
    const url = rc.url?.trim();
    this.client = createClient(
      url
        ? { url }
        : {
            socket: {
              host: rc.host ?? '127.0.0.1',
              port: rc.port ?? 6379,
            },
            password: rc.password,
            database: rc.db ?? 0,
          },
    ) as RedisClientType;
    this.client.on('error', (err: Error) => {
      this.logger.warn(`Redis mirror: ${err.message}`);
    });
    await this.client.connect();
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        /* ignore */
      }
      this.client = null;
    }
  }

  /** 审批签发令牌后写入镜像（TTL 与 PG expires_at 对齐，单位秒） */
  async setMirror(
    executionTokenId: string,
    payload: ExecutionTokenMirrorPayload,
    ttlSec: number,
  ): Promise<void> {
    const c = await this.ensureClient();
    if (!c) return;
    try {
      await c.set(this.key(executionTokenId), JSON.stringify(payload), {
        EX: Math.max(30, ttlSec),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`setMirror failed: ${msg}`);
    }
  }

  /**
   * 消费前快速校验：镜像存在且租户/动作/skill 不一致则拒绝（不碰 PG）。
   * 镜像不存在则返回 true（走 PG 主路径）。
   */
  async assertMirrorMatchesOrAbsent(
    executionTokenId: string,
    companyId: string,
    action: string,
    skillSlug?: string | null,
  ): Promise<void> {
    const c = await this.ensureClient();
    if (!c) return;
    try {
      let raw = await c.get(this.key(executionTokenId));
      if (!raw) {
        raw = await c.get(this.legacyKey(executionTokenId));
      }
      if (!raw) return;
      const p = JSON.parse(raw) as ExecutionTokenMirrorPayload & {
        approvalRequestId?: string;
        action?: string;
      };
      const pid = p.executionTokenId ?? executionTokenId;
      if (pid !== executionTokenId) {
        throw Object.assign(new Error('execution token id mismatch (redis)'), { status: 403 });
      }
      if (p.companyId !== companyId || p.action !== action) {
        throw Object.assign(new Error('execution token tenant or action mismatch (redis)'), {
          status: 403,
        });
      }
      const bound = p.skillSlug != null && String(p.skillSlug).trim() !== '';
      if (bound) {
        const expect = skillSlug?.trim() ?? '';
        if (!expect || expect !== String(p.skillSlug).trim()) {
          throw Object.assign(new Error('execution token skillSlug mismatch (redis)'), {
            status: 403,
          });
        }
      }
      if (p.used === true) {
        throw Object.assign(new Error('execution token already used (redis)'), { status: 403 });
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'status' in e) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`assertMirrorMatchesOrAbsent: ${msg}`);
    }
  }

  /** PG 消费成功后删除镜像并写入短期「已用」键（防短时间重放探测） */
  async onConsumed(executionTokenId: string): Promise<void> {
    const c = await this.ensureClient();
    if (!c) return;
    try {
      await c.del(this.key(executionTokenId));
      await c.del(this.legacyKey(executionTokenId));
      await c.set(this.usedKey(executionTokenId), '1', { EX: 86_400 });
      await c.set(this.legacyUsedKey(executionTokenId), '1', { EX: 86_400 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`onConsumed redis: ${msg}`);
    }
  }
}
