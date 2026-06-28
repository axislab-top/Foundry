import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    /**
     * Inject TypeORM DataSource from the host app.
     *
     * NOTE: We intentionally inject by `DataSource` token instead of `@nestjs/typeorm` helpers,
     * to avoid token mismatches in monorepo/workspace scenarios where multiple copies of
     * `@nestjs/typeorm` may be present (which would make `@InjectDataSource()` resolve undefined).
     */
    @Optional()
    @Inject(getDataSourceToken())
    private readonly dataSource?: DataSource,
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

    if (!this.dataSource?.isInitialized) {
      const nodeEnv = String(process.env.NODE_ENV ?? 'development').toLowerCase();
      const allowInDev = nodeEnv !== 'production';
      this.logger.error(
        'Tenant membership validation backend unavailable; ' +
          (allowInDev ? 'allowing access in non-production (fail-open)' : 'rejecting access (fail-closed)'),
      );
      return allowInDev;
    }

    try {
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
          LIMIT 1
        `,
        [companyId, userId],
      );

      return ownerRows.length > 0;
    } catch (error: unknown) {
      this.logger.error(
        'Tenant membership validation query failed; rejecting access (fail-closed)',
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  isMembershipBackendHealthy(): boolean {
    return Boolean(this.dataSource?.isInitialized);
  }
}
