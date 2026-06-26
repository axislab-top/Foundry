import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { createClient } from 'redis';
import { ConfigService } from '../../../../common/config/config.service.js';
import { MonitoringService } from '../../../../common/monitoring/monitoring.service.js';
import { COLLAB_LLM_TRACE } from '../../../../common/logging/collab-llm-trace.util.js';

export type CeoLlmPrepCacheKeyParams = {
  companyId: string;
  agentId: string;
  ceoContext: string;
  taskPriority: string;
  routerRole: string;
  fallbackModelName: string;
  agentPreferredModel?: string;
  fixedLlmKeyId?: string;
  candidateLlmKeyIds?: string[];
};

export type CeoLlmPrepCachedValue = {
  modelName: string;
  apiKey: string;
  providerKind?: string;
  requestUrl?: string;
  llmKeyId?: string;
  cachedAt: number;
};

@Injectable()
export class CeoLlmPrepCacheService {
  private readonly logger = new Logger(CeoLlmPrepCacheService.name);
  private redis: ReturnType<typeof createClient> | null = null;
  private connecting: Promise<void> | null = null;
  private readonly mem = new Map<string, { exp: number; v: CeoLlmPrepCachedValue }>();
  private readonly versions = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
  ) {}

  private enabled(): boolean {
    return this.config.getCeoLlmPrepCacheEnabled();
  }

  private ttlMs(): number {
    return this.config.getCeoLlmPrepCacheTtlMs();
  }

  private keyPrefix(): string {
    const p = this.config.getRedisKeyPrefix();
    return p ? `${p}:` : '';
  }

  private versionBaseKey(params: Pick<CeoLlmPrepCacheKeyParams, 'companyId' | 'agentId' | 'ceoContext'>): string {
    return `${this.keyPrefix()}ceo:llmprep:version:${params.companyId}:${params.agentId}:${params.ceoContext}`;
  }

  private cacheBaseKey(params: Pick<CeoLlmPrepCacheKeyParams, 'companyId' | 'agentId' | 'ceoContext'>): string {
    return `${this.keyPrefix()}ceo:llmprep:${params.companyId}:${params.agentId}:${params.ceoContext}`;
  }

  private async currentVersion(params: Pick<CeoLlmPrepCacheKeyParams, 'companyId' | 'agentId' | 'ceoContext'>): Promise<number> {
    const base = this.cacheBaseKey(params);
    const memo = this.versions.get(base);
    if (typeof memo === 'number') return memo;
    const redis = await this.ensureRedis();
    if (!redis) {
      this.versions.set(base, 0);
      return 0;
    }
    try {
      const raw = await redis.get(this.versionBaseKey(params));
      const parsed = raw ? Number.parseInt(String(raw), 10) : 0;
      const v = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      this.versions.set(base, v);
      return v;
    } catch {
      this.versions.set(base, 0);
      return 0;
    }
  }

  private async buildKey(params: CeoLlmPrepCacheKeyParams): Promise<string> {
    const version = await this.currentVersion(params);
    const h = createHash('sha256');
    h.update(
      JSON.stringify({
        p: params.taskPriority,
        r: params.routerRole,
        fb: params.fallbackModelName,
        ap: params.agentPreferredModel ?? '',
        fk: params.fixedLlmKeyId ?? '',
        pool: (params.candidateLlmKeyIds ?? []).slice(0, 40),
      }),
    );
    return `${this.cacheBaseKey(params)}:${version}:${h.digest('hex')}`;
  }

  private async ensureRedis(): Promise<ReturnType<typeof createClient> | null> {
    if (!this.enabled()) return null;
    const url = this.config.getRedisUrl();
    if (!url) return null;
    if (this.redis) return this.redis;
    if (!this.connecting) {
      this.connecting = (async () => {
        const client = createClient({ url });
        client.on('error', (e) => {
          this.logger.warn('redis error (llm_prep cache)', { message: String((e as any)?.message ?? e) });
        });
        await client.connect();
        this.redis = client;
      })().catch((e) => {
        this.logger.warn('redis connect failed (llm_prep cache disabled for now)', {
          message: e instanceof Error ? e.message : String(e),
          trace: COLLAB_LLM_TRACE,
        });
      }) as Promise<void>;
    }
    await this.connecting;
    return this.redis;
  }

  async get(params: CeoLlmPrepCacheKeyParams): Promise<CeoLlmPrepCachedValue | null> {
    if (!this.enabled()) return null;
    const startedAt = Date.now();
    const key = await this.buildKey(params);
    const now = Date.now();

    const memHit = this.mem.get(key);
    if (memHit && memHit.exp > now) {
      this.monitoring.recordCeoLlmPrepCacheLookup('hit', Date.now() - startedAt);
      return memHit.v;
    }

    const redis = await this.ensureRedis();
    if (!redis) return null;
    const started = Date.now();
    try {
      const raw = await redis.get(key);
      const elapsed = Date.now() - started;
      if (!raw) {
        this.monitoring.recordCeoLlmPrepCacheLookup('miss', elapsed);
        return null;
      }
      const parsed = JSON.parse(String(raw)) as CeoLlmPrepCachedValue;
      if (!parsed?.apiKey || !parsed?.modelName) {
        this.monitoring.recordCeoLlmPrepCacheLookup('miss', elapsed);
        return null;
      }
      this.monitoring.recordCeoLlmPrepCacheLookup('hit', elapsed);
      this.mem.set(key, { exp: now + Math.min(3000, this.ttlMs()), v: parsed });
      return parsed;
    } catch (e) {
      this.logger.warn('llm_prep cache get failed', { message: e instanceof Error ? e.message : String(e) });
      this.monitoring.recordCeoLlmPrepCacheLookup('miss', Date.now() - started);
      return null;
    }
  }

  async set(params: CeoLlmPrepCacheKeyParams, value: CeoLlmPrepCachedValue): Promise<void> {
    if (!this.enabled()) return;
    const key = await this.buildKey(params);
    const now = Date.now();
    const ttl = this.ttlMs();
    this.mem.set(key, { exp: now + Math.min(3000, ttl), v: value });
    const redis = await this.ensureRedis();
    if (!redis) return;
    try {
      await redis.set(key, JSON.stringify(value), { PX: ttl });
    } catch (e) {
      this.logger.warn('llm_prep cache set failed', { message: e instanceof Error ? e.message : String(e) });
    }
  }

  async bumpVersion(params: { companyId: string; agentId?: string; ceoContext?: string }): Promise<number> {
    const agentId = (params.agentId ?? '*').trim() || '*';
    const ceoContext = (params.ceoContext ?? '*').trim() || '*';
    const base = this.cacheBaseKey({ companyId: params.companyId, agentId, ceoContext });
    const next = (this.versions.get(base) ?? 0) + 1;
    this.versions.set(base, next);

    // clear warm local cache for the affected prefix
    const prefix = `${base}:`;
    for (const k of this.mem.keys()) {
      if (k.startsWith(prefix)) this.mem.delete(k);
    }

    const redis = await this.ensureRedis();
    if (!redis) return next;
    try {
      const v = await redis.incr(this.versionBaseKey({ companyId: params.companyId, agentId, ceoContext }));
      return Number(v);
    } catch {
      return next;
    }
  }

  async invalidateOnDlq(params: { companyId?: string; agentId?: string; ceoContext?: string }): Promise<void> {
    const companyId = (params.companyId ?? '').trim();
    if (!companyId) return;
    const version = await this.bumpVersion({
      companyId,
      agentId: params.agentId,
      ceoContext: params.ceoContext,
    });
    this.logger.warn('llm_prep cache invalidated by interactive queue failure', {
      companyId,
      agentId: params.agentId ?? '*',
      ceoContext: params.ceoContext ?? '*',
      version,
    });
  }
}

