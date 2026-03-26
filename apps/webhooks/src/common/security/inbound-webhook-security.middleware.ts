import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

type RateState = { windowStartMs: number; count: number };

/**
 * Webhooks 入站安全中间件（最小可用版）
 * - 内存限流：按 IP + 路径做滑动窗口近似
 * - 防重放：可选要求 timestamp/nonce，并对 nonce 做短期去重
 *
 * 说明：生产建议把限流/nonce 存储迁移到 Redis，以支持多副本。
 */
@Injectable()
export class InboundWebhookSecurityMiddleware implements NestMiddleware {
  private readonly rate = new Map<string, RateState>();
  private readonly nonceSeen = new Map<string, number>(); // key -> expireAtMs

  use(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();

    // ---- rate limit (memory) ----
    const enabled = (process.env.WEBHOOKS_INBOUND_RATE_LIMIT_ENABLED ?? 'true')
      .toLowerCase()
      .trim() !== 'false';
    if (enabled) {
      const windowMs = Number(process.env.WEBHOOKS_INBOUND_RATE_LIMIT_WINDOW_MS ?? 60_000);
      const max = Number(process.env.WEBHOOKS_INBOUND_RATE_LIMIT_MAX ?? 120);
      const key = `${req.ip}:${req.path}`;
      const state = this.rate.get(key);
      if (!state || now - state.windowStartMs >= windowMs) {
        this.rate.set(key, { windowStartMs: now, count: 1 });
      } else {
        state.count += 1;
        if (state.count > max) {
          res.status(429).json({
            success: false,
            message: 'Rate limit exceeded',
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }
    }

    // ---- anti-replay (optional) ----
    const requireTsNonce = (process.env.WEBHOOKS_INBOUND_REQUIRE_TIMESTAMP_NONCE ?? 'false')
      .toLowerCase()
      .trim() === 'true';
    const signature = (req.header('x-webhook-signature') ?? '').trim();
    const ts = (req.header('x-webhook-timestamp') ?? '').trim();
    const nonce = (req.header('x-webhook-nonce') ?? '').trim();

    // 只在强制模式或“签名存在时”启用防重放检查（兼容旧调用方）
    if (requireTsNonce || signature) {
      if (!ts || !nonce) {
        res.status(400).json({
          success: false,
          message: 'Missing X-Webhook-Timestamp or X-Webhook-Nonce',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const maxSkewMs = Number(process.env.WEBHOOKS_INBOUND_MAX_CLOCK_SKEW_MS ?? 5 * 60_000);
      const tsNum = Number(ts);
      if (!Number.isFinite(tsNum)) {
        res.status(400).json({
          success: false,
          message: 'Invalid X-Webhook-Timestamp',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (Math.abs(now - tsNum) > maxSkewMs) {
        res.status(400).json({
          success: false,
          message: 'Webhook timestamp outside allowed window',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // nonce 去重：ttl 与时间窗对齐
      const nonceKey = `${req.ip}:${ts}:${nonce}`;
      const expireAt = this.nonceSeen.get(nonceKey);
      if (expireAt && expireAt > now) {
        res.status(409).json({
          success: false,
          message: 'Replay detected',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      this.nonceSeen.set(nonceKey, now + maxSkewMs);

      // 简单清理（防止 map 无限增长）
      if (this.nonceSeen.size > 50_000) {
        for (const [k, v] of this.nonceSeen.entries()) {
          if (v <= now) this.nonceSeen.delete(k);
        }
      }
    }

    next();
  }
}

