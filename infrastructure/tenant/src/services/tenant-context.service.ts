import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TENANT_CLS_COMPANY_ID } from '../constants/tenant.constants.js';

@Injectable()
export class TenantContextService {
  private readonly logger = new Logger(TenantContextService.name);
  constructor(private readonly cls: ClsService) {}

  getCompanyId(): string | undefined {
    return this.cls.get(TENANT_CLS_COMPANY_ID);
  }

  currentCompanyId(): string | undefined {
    return this.getCompanyId();
  }

  setCompanyId(companyId: string): void {
    this.cls.set(TENANT_CLS_COMPANY_ID, companyId);
  }

  /**
   * RPC/异步场景下须用 `cls.run(async () => await cb())`，否则 Promise 在 CLS 外 resolve 会导致上下文丢失。
   */
  runWithCompanyId<T>(companyId: string, cb: () => T | Promise<T>): Promise<T> {
    const debug = String(process.env.FOUNDRY_TENANT_DEBUG ?? '').trim().toLowerCase() === 'true';
    return this.cls.run(async () => {
      const requestedCompanyId = String(companyId ?? '').trim();
      if (!requestedCompanyId) {
        const err = new Error('tenant_context.missing_company_id');
        if (debug) {
          this.logger.error('tenant_context.runWithCompanyId.missing_company_id', {
            requestedCompanyId: null,
            stack: err.stack?.split('\n').slice(0, 8).join('\n') ?? null,
          });
        }
        throw err;
      }
      this.cls.set(TENANT_CLS_COMPANY_ID, requestedCompanyId);
      if (debug) {
        this.logger.debug('tenant_context.runWithCompanyId.enter', {
          companyId: requestedCompanyId,
          stack: new Error().stack?.split('\n').slice(0, 6).join('\n') ?? null,
        });
      }
      try {
        return await cb();
      } finally {
        if (debug) {
          this.logger.debug('tenant_context.runWithCompanyId.exit', { companyId: requestedCompanyId });
        }
      }
    });
  }
}
