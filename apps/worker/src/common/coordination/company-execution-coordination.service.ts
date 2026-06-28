import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisCacheService } from '../cache/redis-cache.service.js';
import { ConfigService } from '../config/config.service.js';
import { ResiliencePolicyService } from '../resilience/resilience-policy.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';

export type AutonomousTriggerKind = 'task_completed' | 'budget_warning';

export type HeartbeatLockHandle = {
  acquired: boolean;
  token: string;
};

/**
 * 跨 Worker 副本的公司级执行协调：心跳 in-flight、交互冷却、CEO 图锁、自治事件冷却。
 * 无 Redis 时降级为进程内 Map + ResiliencePolicyService，并记录 fallback 指标。
 */
@Injectable()
export class CompanyExecutionCoordinationService implements OnModuleInit {
  private readonly logger = new Logger(CompanyExecutionCoordinationService.name);

  private readonly memHeartbeatLocks = new Map<string, string>();
  private readonly memInteractiveAt = new Map<string, number>();
  private readonly memLastRunAt = new Map<string, number>();
  private readonly memGraphLocks = new Map<string, string>();
  private readonly memHeartbeatFingerprint = new Map<string, string>();
  private readonly memLastFullGraphAt = new Map<string, number>();

  private static readonly HEARTBEAT_TIER_STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
    private readonly resilience: ResiliencePolicyService,
    private readonly monitoring: MonitoringService,
  ) {}

  onModuleInit(): void {
    if (this.config.isWorkerMultiInstanceStrict() && !this.config.getRedisUrl()?.trim()) {
      throw new Error(
        'WORKER_MULTI_INSTANCE_STRICT=true requires REDIS_URL for company execution coordination',
      );
    }
  }

  private key(suffix: string): string {
    const p = this.config.getRedisKeyPrefix().trim();
    const prefix = p ? `${p}:` : '';
    return `${prefix}${suffix}`;
  }

  private useRedis(): boolean {
    if (!this.config.isCompanyExecutionCoordinationRedisEnabled()) return false;
    if (!this.config.getRedisUrl()?.trim()) {
      if (this.config.isWorkerMultiInstanceStrict()) return false;
      return false;
    }
    return true;
  }

  private recordRedisFallback(reason: string): void {
    this.monitoring.incCoordinationRedisFallback(reason);
    this.logger.warn('coordination.redis_unavailable_fallback_memory', { reason });
  }

  async tryAcquireHeartbeatLock(companyId: string): Promise<HeartbeatLockHandle> {
    const id = String(companyId ?? '').trim();
    if (!id) return { acquired: false, token: '' };
    const token = randomUUID();
    const ttlMs = this.config.getCeoHeartbeatLockTtlMs();

    if (this.useRedis()) {
      const ok = await this.redisCache.setNxPx(this.key(`ceo:heartbeat:lock:${id}`), token, ttlMs);
      if (ok) return { acquired: true, token };
      return { acquired: false, token: '' };
    }

    this.recordRedisFallback('heartbeat_lock');
    if (this.memHeartbeatLocks.has(id)) {
      return { acquired: false, token: '' };
    }
    this.memHeartbeatLocks.set(id, token);
    return { acquired: true, token };
  }

  async releaseHeartbeatLock(companyId: string, token: string): Promise<void> {
    const id = String(companyId ?? '').trim();
    const t = String(token ?? '').trim();
    if (!id || !t) return;

    if (this.useRedis()) {
      await this.redisCache.delIfValueMatches(this.key(`ceo:heartbeat:lock:${id}`), t);
      return;
    }

    if (this.memHeartbeatLocks.get(id) === t) {
      this.memHeartbeatLocks.delete(id);
    }
  }

  async markInteractiveActivity(companyId: string): Promise<void> {
    const id = String(companyId ?? '').trim();
    if (!id) return;
    const now = Date.now();
    const cooldownMs = this.config.getHeartbeatInteractiveCooldownMs();

    if (this.useRedis()) {
      await this.redisCache.setPx(this.key(`ceo:heartbeat:interactive_at:${id}`), String(now), cooldownMs);
      return;
    }

    this.memInteractiveAt.set(id, now);
  }

  /** 优先 Redis 读取交互时间戳。 */
  async shouldSkipHeartbeatForInteractiveCooldownAsync(companyId: string): Promise<{
    skip: boolean;
    sinceInteractiveMs?: number;
  }> {
    const id = String(companyId ?? '').trim();
    if (!id) return { skip: false };
    const cooldownMs = this.config.getHeartbeatInteractiveCooldownMs();
    const now = Date.now();
    let last = this.memInteractiveAt.get(id) ?? 0;

    if (this.useRedis()) {
      const raw = await this.redisCache.get(this.key(`ceo:heartbeat:interactive_at:${id}`));
      if (raw?.trim()) {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed)) last = Math.max(last, parsed);
      }
    }

    const sinceInteractiveMs = now - last;
    if (last > 0 && sinceInteractiveMs >= 0 && sinceInteractiveMs < cooldownMs) {
      return { skip: true, sinceInteractiveMs };
    }
    return { skip: false };
  }

  async shouldSkipHeartbeatForMinIntervalAsync(companyId: string): Promise<{
    skip: boolean;
    sinceLastRunMs?: number;
  }> {
    const id = String(companyId ?? '').trim();
    if (!id) return { skip: false };
    const minIntervalMs = this.config.getHeartbeatMinIntervalMs();
    if (minIntervalMs <= 0) return { skip: false };
    const now = Date.now();
    let last = this.memLastRunAt.get(id) ?? 0;

    if (this.useRedis()) {
      const raw = await this.redisCache.get(this.key(`ceo:heartbeat:last_run_at:${id}`));
      if (raw?.trim()) {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed)) last = Math.max(last, parsed);
      }
    }

    const sinceLastRunMs = now - last;
    if (last > 0 && sinceLastRunMs >= 0 && sinceLastRunMs < minIntervalMs) {
      return { skip: true, sinceLastRunMs };
    }
    return { skip: false };
  }

  async recordHeartbeatRunAt(companyId: string): Promise<void> {
    const id = String(companyId ?? '').trim();
    if (!id) return;
    const now = Date.now();
    this.memLastRunAt.set(id, now);
    if (this.useRedis()) {
      const ttl = Math.max(this.config.getHeartbeatMinIntervalMs() * 2, 120_000);
      await this.redisCache.setPx(this.key(`ceo:heartbeat:last_run_at:${id}`), String(now), ttl);
    }
  }

  async tryAutonomousTriggerAsync(companyId: string, kind: AutonomousTriggerKind): Promise<boolean> {
    const id = String(companyId ?? '').trim();
    if (!id) return false;
    const cooldownMs =
      kind === 'budget_warning'
        ? this.config.getAutonomousCooldownBudgetWarningMs()
        : this.config.getAutonomousCooldownTaskCompletedMs();
    if (cooldownMs <= 0) return true;

    const redisKey = this.key(`ceo:autonomous:trigger:${id}:${kind}`);
    if (this.useRedis()) {
      const ok = await this.redisCache.setNxPx(redisKey, '1', cooldownMs);
      return ok;
    }

    this.recordRedisFallback('autonomous_trigger');
    return this.tryAutonomousTriggerMemory(`${id}:${kind}`, cooldownMs, kind);
  }

  private tryAutonomousTriggerMemory(k: string, cooldownMs: number, kind: string): boolean {
    const state = this.resilience.isCoolingDown(`autonomous:trigger:${k}`);
    if (state.active) return false;
    this.resilience.openCooldown(`autonomous:trigger:${k}`, cooldownMs, kind);
    return true;
  }

  async tryAcquireCeoGraphLock(companyId: string): Promise<HeartbeatLockHandle> {
    const id = String(companyId ?? '').trim();
    if (!id) return { acquired: false, token: '' };
    const token = randomUUID();
    const ttlMs = this.config.getCeoGraphLockTtlMs();

    if (this.useRedis()) {
      const ok = await this.redisCache.setNxPx(this.key(`ceo:graph:lock:${id}`), token, ttlMs);
      if (ok) return { acquired: true, token };
      this.monitoring.incCeoGraphLockContention();
      return { acquired: false, token: '' };
    }

    this.recordRedisFallback('ceo_graph_lock');
    if (this.memGraphLocks.has(id)) {
      this.monitoring.incCeoGraphLockContention();
      return { acquired: false, token: '' };
    }
    this.memGraphLocks.set(id, token);
    return { acquired: true, token };
  }

  async releaseCeoGraphLock(companyId: string, token: string): Promise<void> {
    const id = String(companyId ?? '').trim();
    const t = String(token ?? '').trim();
    if (!id || !t) return;

    if (this.useRedis()) {
      await this.redisCache.delIfValueMatches(this.key(`ceo:graph:lock:${id}`), t);
      return;
    }

    if (this.memGraphLocks.get(id) === t) {
      this.memGraphLocks.delete(id);
    }
  }

  async withCeoGraphLock<T>(companyId: string, fn: () => Promise<T>): Promise<T | undefined> {
    const lock = await this.tryAcquireCeoGraphLock(companyId);
    if (!lock.acquired) {
      this.logger.log('ceo.graph.lock_contention_skip', { companyId });
      return undefined;
    }
    try {
      return await fn();
    } finally {
      await this.releaseCeoGraphLock(companyId, lock.token);
    }
  }

  async getHeartbeatFingerprint(companyId: string): Promise<string | null> {
    const id = String(companyId ?? '').trim();
    if (!id) return null;
    if (this.useRedis()) {
      const raw = await this.redisCache.get(this.key(`ceo:heartbeat:fingerprint:${id}`));
      return raw?.trim() || null;
    }
    return this.memHeartbeatFingerprint.get(id) ?? null;
  }

  async saveHeartbeatFingerprint(companyId: string, fingerprint: string): Promise<void> {
    const id = String(companyId ?? '').trim();
    const fp = String(fingerprint ?? '').trim();
    if (!id || !fp) return;
    const ttl = CompanyExecutionCoordinationService.HEARTBEAT_TIER_STATE_TTL_MS;
    if (this.useRedis()) {
      await this.redisCache.setPx(this.key(`ceo:heartbeat:fingerprint:${id}`), fp, ttl);
      return;
    }
    this.memHeartbeatFingerprint.set(id, fp);
  }

  async getLastFullGraphAt(companyId: string): Promise<number | null> {
    const id = String(companyId ?? '').trim();
    if (!id) return null;
    if (this.useRedis()) {
      const raw = await this.redisCache.get(this.key(`ceo:heartbeat:last_full_graph_at:${id}`));
      if (!raw?.trim()) return null;
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const v = this.memLastFullGraphAt.get(id);
    return v != null && Number.isFinite(v) ? v : null;
  }

  async recordLastFullGraphAt(companyId: string, atMs: number = Date.now()): Promise<void> {
    const id = String(companyId ?? '').trim();
    if (!id) return;
    const ttl = CompanyExecutionCoordinationService.HEARTBEAT_TIER_STATE_TTL_MS;
    if (this.useRedis()) {
      await this.redisCache.setPx(
        this.key(`ceo:heartbeat:last_full_graph_at:${id}`),
        String(atMs),
        ttl,
      );
      return;
    }
    this.memLastFullGraphAt.set(id, atMs);
  }
}
