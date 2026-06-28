import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { ConfigService } from '../../../common/config/config.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';

export type CompanyCreationQuota = {
  ownedCount: number;
  maxOwned: number;
  remaining: number;
  canCreate: boolean;
};

type QuotaActor = {
  id: string;
  roles?: string[];
};

const OWNED_COMPANY_STATUSES = ['active', 'suspended', 'draft'] as const;

@Injectable()
export class CompanyCreationQuotaService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  getMaxOwnedCompaniesPerUser(): number {
    return this.config.getMaxOwnedCompaniesPerUser();
  }

  actorIsPlatformAdmin(actor: QuotaActor): boolean {
    return Boolean(actor?.roles?.some((role) => role === 'admin' || role === 'superadmin'));
  }

  async countOwnedCompanies(userId: string): Promise<number> {
    const rows = await this.dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL row_security = off');
      return manager.query<Array<{ count: string }>>(
        `
          SELECT COUNT(*)::text AS count
          FROM companies
          WHERE created_by = $1
            AND status = ANY($2::text[])
        `,
        [userId, [...OWNED_COMPANY_STATUSES]],
      );
    });

    return parseInt(rows?.[0]?.count ?? '0', 10);
  }

  async getQuota(actor: QuotaActor): Promise<CompanyCreationQuota> {
    const maxOwned = this.getMaxOwnedCompaniesPerUser();
    if (this.actorIsPlatformAdmin(actor)) {
      return {
        ownedCount: 0,
        maxOwned,
        remaining: maxOwned,
        canCreate: true,
      };
    }

    const ownedCount = await this.countOwnedCompanies(actor.id);
    const remaining = Math.max(0, maxOwned - ownedCount);
    return {
      ownedCount,
      maxOwned,
      remaining,
      canCreate: remaining > 0,
    };
  }

  async assertCanCreateCompany(actor: QuotaActor): Promise<void> {
    if (this.actorIsPlatformAdmin(actor)) {
      return;
    }

    const maxOwned = this.getMaxOwnedCompaniesPerUser();
    const ownedCount = await this.countOwnedCompanies(actor.id);
    if (ownedCount >= maxOwned) {
      throw new UnprocessableEntityException({
        code: ErrorCode.OPERATION_NOT_ALLOWED,
        message: `您最多只能创建 ${maxOwned} 家公司，当前已有 ${ownedCount} 家`,
        ownedCount,
        maxOwned,
      });
    }
  }

  async assertCanCreateCompanyInTransaction(
    scope: EntityManager | QueryRunner,
    actor: QuotaActor,
  ): Promise<void> {
    if (this.actorIsPlatformAdmin(actor)) {
      return;
    }

    const query = async <T>(sql: string, params?: unknown[]): Promise<T> => {
      if ('manager' in scope) {
        return scope.manager.query(sql, params) as Promise<T>;
      }
      return scope.query(sql, params) as Promise<T>;
    };

    const maxOwned = this.getMaxOwnedCompaniesPerUser();
    await query('SET LOCAL row_security = off');
    await query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [actor.id]);

    const rows = await query<Array<{ count: string }>>(
      `
        SELECT COUNT(*)::text AS count
        FROM companies
        WHERE created_by = $1
          AND status = ANY($2::text[])
      `,
      [actor.id, [...OWNED_COMPANY_STATUSES]],
    );
    const ownedCount = parseInt(rows?.[0]?.count ?? '0', 10);
    if (ownedCount >= maxOwned) {
      throw new UnprocessableEntityException({
        code: ErrorCode.OPERATION_NOT_ALLOWED,
        message: `您最多只能创建 ${maxOwned} 家公司，当前已有 ${ownedCount} 家`,
        ownedCount,
        maxOwned,
      });
    }
  }
}
