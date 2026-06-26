import { Injectable, Logger } from '@nestjs/common';

type CooldownState = { untilMs: number; reason: string };

@Injectable()
export class ResiliencePolicyService {
  private readonly logger = new Logger(ResiliencePolicyService.name);
  private readonly cooldowns = new Map<string, CooldownState>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly dedupeKeys = new Map<string, number>();

  isCoolingDown(key: string): { active: boolean; remainingMs: number; reason?: string } {
    const now = Date.now();
    const rec = this.cooldowns.get(key);
    if (!rec) return { active: false, remainingMs: 0 };
    if (rec.untilMs <= now) {
      this.cooldowns.delete(key);
      return { active: false, remainingMs: 0 };
    }
    return { active: true, remainingMs: rec.untilMs - now, reason: rec.reason };
  }

  openCooldown(key: string, ttlMs: number, reason: string): void {
    const safeTtl = Math.max(1000, Math.floor(ttlMs));
    this.cooldowns.set(key, { untilMs: Date.now() + safeTtl, reason: reason || 'unknown' });
  }

  async runSingleFlight<T>(key: string, fn: () => Promise<T>): Promise<{ value: T; shared: boolean }> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      return { value: await existing, shared: true };
    }
    const p = fn().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, p as Promise<unknown>);
    return { value: await p, shared: false };
  }

  markIfNew(key: string, ttlMs: number): boolean {
    const now = Date.now();
    const expiresAt = this.dedupeKeys.get(key);
    if (expiresAt && expiresAt > now) return false;
    this.dedupeKeys.set(key, now + Math.max(1000, Math.floor(ttlMs)));
    if (this.dedupeKeys.size > 200_000) {
      for (const [k, until] of this.dedupeKeys.entries()) {
        if (until <= now) this.dedupeKeys.delete(k);
      }
    }
    return true;
  }

  clearPrefix(prefix: string): void {
    for (const k of this.cooldowns.keys()) {
      if (k.startsWith(prefix)) this.cooldowns.delete(k);
    }
    for (const k of this.dedupeKeys.keys()) {
      if (k.startsWith(prefix)) this.dedupeKeys.delete(k);
    }
    this.logger.debug('resilience_policy.cleared_prefix', { prefix });
  }
}
