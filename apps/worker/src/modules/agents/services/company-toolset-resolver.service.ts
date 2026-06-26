import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';

type CacheEntry = { expiresAt: number; toolsets: string[] };

/**
 * Resolves company-enabled toolsets: DB (RPC) when configured, else worker env fallback.
 */
@Injectable()
export class CompanyToolsetResolverService {
  private readonly logger = new Logger(CompanyToolsetResolverService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 60_000;

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
  ) {}

  async getEnabledToolsets(companyId: string): Promise<string[]> {
    const cid = String(companyId ?? '').trim();
    if (!cid) return this.config.getEnabledToolsets();

    const now = Date.now();
    const hit = this.cache.get(cid);
    if (hit && hit.expiresAt > now) return hit.toolsets;

    let fromDb: string[] = [];
    try {
      const out = await firstValueFrom(
        this.apiRpc
          .send<{ enabledToolsets?: string[] }>('company-toolset-settings.resolve', { companyId: cid })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
      fromDb = Array.isArray(out?.enabledToolsets)
        ? out.enabledToolsets.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
    } catch (e) {
      this.logger.warn('company_toolset.resolve_rpc_failed', {
        companyId: cid,
        message: e instanceof Error ? e.message : String(e),
      });
    }

    const toolsets = fromDb.length > 0 ? fromDb : this.config.getEnabledToolsets();
    this.cache.set(cid, { expiresAt: now + this.ttlMs, toolsets });
    return toolsets;
  }

  invalidate(companyId?: string): void {
    if (!companyId) {
      this.cache.clear();
      return;
    }
    this.cache.delete(String(companyId).trim());
  }
}
