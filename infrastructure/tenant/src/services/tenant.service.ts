import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  async userBelongsToCompany(
    userId: string | undefined,
    companyId: string,
  ): Promise<boolean> {
    if (!userId || !companyId) return false;

    // Phase-1 compatibility mode: strict membership check can be switched on later
    // after company_memberships is introduced.
    const enforced = process.env.TENANT_MEMBERSHIP_ENFORCED !== 'false';
    if (!enforced) return true;

    if (!this.dataSource) {
      this.logger.warn(
        'TENANT_MEMBERSHIP_ENFORCED=true but datasource is unavailable (compat-allow)',
      );
      // 如果 datasource 注入失败/不可用，membership 查询无法进行。
      // 为保证开发/向导流程不被错误阻断，这里先采取兼容策略放行，
      // 同时保留告警日志以便尽快修复 DI/数据库注入问题。
      return true;
    }

    const rows = await this.dataSource.query(
      `
        SELECT 1
        FROM company_memberships cm
        WHERE cm.user_id = $1
          AND cm.company_id = $2
          AND cm.is_active = true
        LIMIT 1
      `,
      [userId, companyId],
    );

    if (rows.length > 0) {
      return true;
    }

    // Company creator should also have tenant access.
    const ownerRows = await this.dataSource.query(
      `
        SELECT 1
        FROM companies c
        WHERE c.id = $1
          AND c.created_by = $2
          AND c.is_active = true
        LIMIT 1
      `,
      [companyId, userId],
    );

    return ownerRows.length > 0;
  }
}
