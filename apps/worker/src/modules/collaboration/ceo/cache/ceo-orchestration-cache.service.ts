import { Injectable } from '@nestjs/common';
import { MonitoringService } from '../../../../common/monitoring/monitoring.service.js';

interface CacheRow<T> {
  exp: number;
  version: number;
  value: T;
}

@Injectable()
export class CeoOrchestrationCacheService {
  private readonly map = new Map<string, CacheRow<unknown>>();
  private readonly ttlMs = 30_000;
  private readonly versions = new Map<string, number>(); // key -> version stamp

  constructor(private readonly monitoring: MonitoringService) {}

  private key(companyId: string, roomId: string): string {
    return `ceo:ctx:${companyId}:${roomId}`;
  }

  invalidate(companyId: string, roomId: string): void {
    const k = this.key(companyId, roomId);
    this.map.delete(k);
    this.versions.set(k, (this.versions.get(k) ?? 0) + 1);
  }

  async getOrCreate<T>(params: {
    companyId: string;
    roomId: string;
    loader: () => Promise<T>;
  }): Promise<T> {
    const k = this.key(params.companyId, params.roomId);
    const now = Date.now();
    const v = this.versions.get(k) ?? 0;
    const row = this.map.get(k);
    if (row && row.exp > now && row.version === v) {
      this.monitoring.incCeoOrchestrationContext('hit');
      return row.value as T;
    }
    try {
      const value = await params.loader();
      this.map.set(k, { exp: now + this.ttlMs, version: v, value });
      this.monitoring.incCeoOrchestrationContext('miss');
      return value;
    } catch (e) {
      this.monitoring.incCeoOrchestrationContext('error');
      throw e;
    }
  }

  async preload<T>(params: {
    companyId: string;
    roomId: string;
    loader: () => Promise<T>;
  }): Promise<T> {
    this.invalidate(params.companyId, params.roomId);
    return this.getOrCreate(params);
  }
}

