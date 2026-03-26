import { Injectable } from '@nestjs/common';

@Injectable()
export class IdempotencyService {
  private readonly seen = new Map<string, number>(); // key -> expireAtMs

  /**
   * 标记 key；如果此前已存在且未过期，则返回 false（重复）
   */
  markIfNew(key: string, ttlMs: number): boolean {
    const now = Date.now();
    const expireAt = this.seen.get(key);
    if (expireAt && expireAt > now) {
      return false;
    }
    this.seen.set(key, now + ttlMs);

    // 简单清理（避免无限增长）
    if (this.seen.size > 100_000) {
      for (const [k, v] of this.seen.entries()) {
        if (v <= now) this.seen.delete(k);
      }
    }
    return true;
  }
}

