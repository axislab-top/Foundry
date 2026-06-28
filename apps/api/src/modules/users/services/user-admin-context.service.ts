import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { OAuthService } from '../../oauth/oauth.service.js';
import { RechargeOrdersService } from '../../billing/services/recharge-orders.service.js';
import { UsersService } from '../users.service.js';
import type {
  UserAdminContext,
  UserCompanyContextItem,
  UserListStats,
  UserOAuthContextItem,
  UserRechargeOrderContextItem,
} from '../interfaces/user-admin-context.interface.js';
import type { CompanyMembershipRole } from '../../companies/entities/company-membership.entity.js';

type PlatformActor = {
  id: string;
  roles?: string[];
  permissions?: string[];
};

type CompanyRow = {
  id: string;
  name: string;
  status: string;
  slug: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: Date;
};

type MembershipRow = {
  membership_id: string;
  company_id: string;
  role: CompanyMembershipRole;
  is_active: boolean;
  joined_at: Date;
  name: string;
  status: string;
  slug: string | null;
  created_by: string | null;
  company_is_active: boolean;
  company_created_at: Date;
};

type CreditRow = {
  company_id: string;
  total_amount: string;
  used_amount: string;
  currency: string | null;
};

@Injectable()
export class UserAdminContextService {
  constructor(
    private readonly usersService: UsersService,
    private readonly oauthService: OAuthService,
    private readonly rechargeOrdersService: RechargeOrdersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  requirePlatformAdmin(actor: PlatformActor | undefined): void {
    this.assertPlatformAdmin(actor);
  }

  private assertPlatformAdmin(actor: PlatformActor | undefined): void {
    const isAdmin = actor?.roles?.some((r) => r === 'admin' || r === 'superadmin');
    if (!isAdmin) {
      throw new RpcException({ status: 403, message: 'Insufficient permissions' });
    }
  }

  private async loadCreditByCompanyIds(
    companyIds: string[],
  ): Promise<Map<string, CreditRow>> {
    if (companyIds.length === 0) return new Map();

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL row_security = off');
      const rows = await manager.query<CreditRow[]>(
        `
        SELECT company_id, total_amount::text, used_amount::text, currency
        FROM budgets
        WHERE scope = 'company' AND company_id = ANY($1::uuid[])
        `,
        [companyIds],
      );
      return new Map(rows.map((row) => [row.company_id, row]));
    });
  }

  private mapCompanyItem(
    row: CompanyRow,
    relation: 'owned' | 'member',
    credit: CreditRow | undefined,
    extra?: { membershipRole?: CompanyMembershipRole; membershipId?: string; joinedAt?: string },
  ): UserCompanyContextItem {
    return {
      companyId: row.id,
      companyName: row.name,
      companyStatus: row.status,
      companySlug: row.slug,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      relation,
      membershipRole: extra?.membershipRole,
      membershipId: extra?.membershipId,
      joinedAt: extra?.joinedAt,
      creditTotal: credit?.total_amount ?? null,
      creditUsed: credit?.used_amount ?? null,
      creditCurrency: credit?.currency ?? null,
    };
  }

  async listOwnedCompanies(userId: string): Promise<UserCompanyContextItem[]> {
    const companies = await this.dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL row_security = off');
      return manager.query<CompanyRow[]>(
        `
        SELECT id, name, status, slug, created_by, is_active, created_at
        FROM companies
        WHERE created_by = $1 AND status != 'draft'
        ORDER BY created_at DESC
        `,
        [userId],
      );
    });

    const creditMap = await this.loadCreditByCompanyIds(companies.map((c) => c.id));
    return companies.map((row) =>
      this.mapCompanyItem(row, 'owned', creditMap.get(row.id)),
    );
  }

  async listMemberCompanies(userId: string): Promise<UserCompanyContextItem[]> {
    const memberships = await this.dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL row_security = off');
      return manager.query<MembershipRow[]>(
        `
        SELECT
          m.id AS membership_id,
          m.company_id,
          m.role,
          m.is_active,
          m.created_at AS joined_at,
          c.name,
          c.status,
          c.slug,
          c.created_by,
          c.is_active AS company_is_active,
          c.created_at AS company_created_at
        FROM company_memberships m
        INNER JOIN companies c ON c.id = m.company_id
        WHERE m.user_id = $1 AND m.is_active = true AND c.status != 'draft'
          AND (c.created_by IS NULL OR c.created_by != $1)
        ORDER BY m.created_at DESC
        `,
        [userId],
      );
    });

    const creditMap = await this.loadCreditByCompanyIds(memberships.map((m) => m.company_id));
    return memberships.map((row) => {
      const companyRow: CompanyRow = {
        id: row.company_id,
        name: row.name,
        status: row.status,
        slug: row.slug,
        created_by: row.created_by,
        is_active: row.company_is_active,
        created_at: row.company_created_at,
      };
      return this.mapCompanyItem(companyRow, 'member', creditMap.get(row.company_id), {
        membershipRole: row.role,
        membershipId: row.membership_id,
        joinedAt: row.joined_at.toISOString(),
      });
    });
  }

  async getStatsForUsers(userIds: string[]): Promise<Map<string, UserListStats>> {
    const result = new Map<string, UserListStats>();
    if (userIds.length === 0) return result;

    for (const id of userIds) {
      result.set(id, { ownedCompanyCount: 0, memberCompanyCount: 0, rechargeOrderCount: 0 });
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL row_security = off');

      const ownedRows = await manager.query<Array<{ user_id: string; count: string }>>(
        `
        SELECT created_by AS user_id, COUNT(*)::text AS count
        FROM companies
        WHERE created_by = ANY($1::uuid[]) AND status != 'draft'
        GROUP BY created_by
        `,
        [userIds],
      );

      const memberRows = await manager.query<Array<{ user_id: string; count: string }>>(
        `
        SELECT m.user_id, COUNT(*)::text AS count
        FROM company_memberships m
        INNER JOIN companies c ON c.id = m.company_id
        WHERE m.user_id = ANY($1::uuid[]) AND m.is_active = true AND c.status != 'draft'
        GROUP BY m.user_id
        `,
        [userIds],
      );

      const orderRows = await manager.query<Array<{ user_id: string; count: string }>>(
        `
        SELECT requested_by_user_id AS user_id, COUNT(*)::text AS count
        FROM billing_recharge_orders
        WHERE requested_by_user_id = ANY($1::uuid[])
        GROUP BY requested_by_user_id
        `,
        [userIds],
      );

      for (const row of ownedRows) {
        const stats = result.get(row.user_id);
        if (stats) stats.ownedCompanyCount = parseInt(row.count, 10);
      }
      for (const row of memberRows) {
        const stats = result.get(row.user_id);
        if (stats) stats.memberCompanyCount = parseInt(row.count, 10);
      }
      for (const row of orderRows) {
        const stats = result.get(row.user_id);
        if (stats) stats.rechargeOrderCount = parseInt(row.count, 10);
      }
    });

    return result;
  }

  async getAdminContext(userId: string, actor: PlatformActor): Promise<UserAdminContext> {
    this.assertPlatformAdmin(actor);

    let userEntity;
    try {
      userEntity = await this.usersService.findOne(userId);
    } catch (e: any) {
      if (e?.status === 404 || e instanceof NotFoundException) {
        throw new RpcException({ status: 404, message: '用户不存在' });
      }
      throw e;
    }

    const { passwordHash: _pw, ...userRest } = userEntity;

    const [ownedCompanies, memberCompanies, rechargeResult, oauthAccountsRaw] = await Promise.all([
      this.listOwnedCompanies(userId),
      this.listMemberCompanies(userId),
      this.rechargeOrdersService.listPlatform(actor, {
        requestedByUserId: userId,
        limit: 100,
        offset: 0,
      }),
      this.oauthService.getUserAccounts(userId).catch(() => []),
    ]);

    const rechargeOrders: UserRechargeOrderContextItem[] = rechargeResult.items.map((order) => ({
      id: order.id,
      companyId: order.companyId,
      companyName: order.companyName ?? null,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      applyNote: order.applyNote,
      createdAt: order.createdAt.toISOString(),
    }));

    const oauthAccounts: UserOAuthContextItem[] = oauthAccountsRaw.map((account) => ({
      id: account.id,
      provider: account.provider,
      providerUserId: account.providerUserId,
      providerUsername: account.providerUsername,
      createdAt: account.createdAt.toISOString(),
    }));

    const approvedCreditTotal = rechargeOrders
      .filter((o) => o.status === 'approved')
      .reduce((sum, o) => sum + parseFloat(o.amount || '0'), 0)
      .toFixed(2);

    return {
      user: {
        id: userRest.id,
        username: userRest.username,
        email: userRest.email,
        enabled: userRest.enabled,
        lastLoginAt: userRest.lastLoginAt?.toISOString() ?? null,
        createdAt: userRest.createdAt.toISOString(),
        updatedAt: userRest.updatedAt.toISOString(),
        deletedAt: userRest.deletedAt?.toISOString() ?? null,
      },
      ownedCompanies,
      memberCompanies,
      rechargeOrders,
      oauthAccounts,
      stats: {
        ownedCompanyCount: ownedCompanies.length,
        memberCompanyCount: memberCompanies.length,
        rechargeOrderCount: rechargeResult.total,
        approvedCreditTotal,
      },
    };
  }
}
