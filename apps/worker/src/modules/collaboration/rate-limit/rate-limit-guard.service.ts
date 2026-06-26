import { Injectable, Logger } from '@nestjs/common';
import { createClient } from 'redis';
import { ConfigService } from '../../../common/config/config.service.js';
import { COLLAB_LLM_TRACE } from '../../../common/logging/collab-llm-trace.util.js';

export class RateLimitExceededException extends Error {
  constructor(
    public readonly cooldownMs: number,
    public readonly companyId: string,
    public readonly reason: 'bucket_exhausted' | 'provider_429' | 'cooldown_active',
  ) {
    super(`rate limit exceeded (${reason}), retry after ${cooldownMs}ms`);
    this.name = 'RateLimitExceededException';
  }
}

@Injectable()
export class RateLimitGuardService {
  private readonly logger = new Logger(RateLimitGuardService.name);
  private redis: ReturnType<typeof createClient> | null = null;
  private connecting: Promise<void> | null = null;
  private static readonly TOKEN_BUCKET_LUA = `
local tokens_key = KEYS[1]
local ts_key = KEYS[2]
local rate = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local request_tokens = tonumber(ARGV[4])
local ttl_ms = tonumber(ARGV[5])

local tokens = tonumber(redis.call('GET', tokens_key))
if tokens == nil then
  tokens = burst
end

local ts = tonumber(redis.call('GET', ts_key))
if ts == nil then
  ts = now_ms
end

local delta_ms = math.max(0, now_ms - ts)
local refill = (delta_ms / 1000.0) * rate
tokens = math.min(burst, tokens + refill)

local allowed = 0
if tokens >= request_tokens then
  allowed = 1
  tokens = tokens - request_tokens
end

redis.call('SET', tokens_key, tostring(tokens), 'PX', ttl_ms)
redis.call('SET', ts_key, tostring(now_ms), 'PX', ttl_ms)
return { allowed, tokens }
  `;

  constructor(private readonly config: ConfigService) {}

  private bucketKey(companyId: string): string {
    return `rl:company:${companyId}:llm`;
  }

  private cooldownKey(companyId: string): string {
    return `${this.bucketKey(companyId)}:cooldown_until`;
  }

  private ratePerSecond(): number {
    const raw = this.config.get<number | string>('LLM_RATE_LIMIT_TPS_PER_COMPANY', 10);
    const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 10;
    return n;
  }

  private burstTokens(): number {
    const raw = this.config.get<number | string>('LLM_RATE_LIMIT_BURST', 20);
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 20;
    return Math.max(1, Math.floor(n));
  }

  private async ensureRedis(): Promise<ReturnType<typeof createClient> | null> {
    const url = this.config.getRedisUrl();
    if (!url) return null;
    if (this.redis) return this.redis;
    if (!this.connecting) {
      this.connecting = (async () => {
        const client = createClient({ url });
        client.on('error', (e) => {
          this.logger.warn(`${COLLAB_LLM_TRACE} | llm.rate_limit_redis_error`, {
            message: String((e as { message?: string })?.message ?? e),
          });
        });
        await client.connect();
        this.redis = client;
      })().catch((e) => {
        this.logger.warn(`${COLLAB_LLM_TRACE} | llm.rate_limit_redis_connect_failed`, {
          message: e instanceof Error ? e.message : String(e),
        });
      }) as Promise<void>;
    }
    await this.connecting;
    return this.redis;
  }

  private isSafeRedisInteger(raw: string | Buffer | null): number | null {
    if (!raw) return null;
    const n = Number.parseInt(typeof raw === 'string' ? raw : raw.toString('utf8'), 10);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  async assertWithinLimit(params: {
    companyId: string;
    phase: 'createModel' | 'invoke';
    messageId?: string | null;
    callsite?: string | null;
  }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    if (!companyId) return;

    const redis = await this.ensureRedis();
    if (!redis) return;

    const now = Date.now();
    const cooldownUntilRaw = await redis.get(this.cooldownKey(companyId));
    const cooldownUntil = this.isSafeRedisInteger(cooldownUntilRaw);
    if (cooldownUntil && cooldownUntil > now) {
      const cooldownMs = cooldownUntil - now;
      this.logger.warn(`${COLLAB_LLM_TRACE} | llm.rate_limit_cooldown`, {
        event: 'llm.rate_limit_cooldown',
        companyId,
        phase: params.phase,
        cooldownMs,
        messageId: params.messageId ?? null,
        callsite: params.callsite ?? null,
      });
      throw new RateLimitExceededException(cooldownMs, companyId, 'cooldown_active');
    }

    const rate = this.ratePerSecond();
    const burst = this.burstTokens();
    const bucketKey = this.bucketKey(companyId);
    const tsKey = `${bucketKey}:ts`;
    const refillWindowMs = Math.ceil((burst / rate) * 2000);
    const ttlMs = Math.max(30_000, refillWindowMs);

    const result = (await redis.eval(
      RateLimitGuardService.TOKEN_BUCKET_LUA,
      {
        keys: [bucketKey, tsKey],
        arguments: [String(rate), String(burst), String(now), '1', String(ttlMs)],
      },
    )) as [number, number];

    const allowed = Number(result?.[0] ?? 0) === 1;
    const remaining = Number(result?.[1] ?? 0);
    if (!allowed) {
      const cooldownMs = Math.max(200, Math.ceil((1 / Math.max(0.0001, rate)) * 1000));
      const cooldownUntilAt = now + cooldownMs;
      await redis.set(this.cooldownKey(companyId), String(cooldownUntilAt), { PX: cooldownMs });
      this.logger.warn(`${COLLAB_LLM_TRACE} | llm.rate_limit_hit`, {
        event: 'llm.rate_limit_hit',
        companyId,
        phase: params.phase,
        cooldownMs,
        remainingTokens: Number.isFinite(remaining) ? remaining : 0,
        messageId: params.messageId ?? null,
        callsite: params.callsite ?? null,
      });
      throw new RateLimitExceededException(cooldownMs, companyId, 'bucket_exhausted');
    }
  }

  async registerProvider429(params: {
    companyId: string;
    cooldownMs: number;
    messageId?: string | null;
    callsite?: string | null;
  }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    if (!companyId) return;
    const redis = await this.ensureRedis();
    if (!redis) return;
    const cooldownMs = Math.max(500, Math.floor(params.cooldownMs));
    const cooldownUntil = Date.now() + cooldownMs;
    await redis.set(this.cooldownKey(companyId), String(cooldownUntil), { PX: cooldownMs });
    this.logger.warn(`${COLLAB_LLM_TRACE} | llm.rate_limit_cooldown`, {
      event: 'llm.rate_limit_cooldown',
      companyId,
      phase: 'invoke',
      reason: 'provider_429',
      cooldownMs,
      messageId: params.messageId ?? null,
      callsite: params.callsite ?? null,
    });
  }
}
