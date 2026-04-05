import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TENANT_CLS_COMPANY_ID } from '../constants/tenant.constants.js';

@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  getCompanyId(): string | undefined {
    return this.cls.get(TENANT_CLS_COMPANY_ID);
  }

  setCompanyId(companyId: string): void {
    this.cls.set(TENANT_CLS_COMPANY_ID, companyId);
  }

  /**
   * RPC/异步场景下须用 `cls.run(async () => await cb())`，否则 Promise 在 CLS 外 resolve 会导致上下文丢失。
   */
  runWithCompanyId<T>(companyId: string, cb: () => T | Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.cls.set(TENANT_CLS_COMPANY_ID, companyId);
      return await cb();
    });
  }
}
