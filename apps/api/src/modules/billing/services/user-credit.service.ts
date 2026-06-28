import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NEW_USER_REGISTRATION_CREDIT_BONUS } from '@contracts/types';
import { EntityManager, Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity.js';
import { BILLING_CURRENCY } from '../billing-currency.js';
import { UserCreditAccount } from '../entities/user-credit-account.entity.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

export type AccountCreditView = {
  userId: string;
  totalAmount: string;
  usedAmount: string;
  currency: string;
};

@Injectable()
export class UserCreditService {
  private readonly logger = new Logger(UserCreditService.name);

  constructor(
    @InjectRepository(UserCreditAccount)
    private readonly accountRepo: Repository<UserCreditAccount>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async resolveRegistrationGrantAmount(): Promise<number> {
    const configured = await this.platformSettings.getRegistrationBonusCredit();
    if (configured > 0) return configured;
    return NEW_USER_REGISTRATION_CREDIT_BONUS;
  }

  /** 注册时发放一次账号额度（幂等） */
  async ensureRegistrationGrant(userId: string, grantAmount?: number): Promise<UserCreditAccount> {
    const existing = await this.accountRepo.findOne({ where: { userId } });
    if (existing) return existing;

    const total = grantAmount ?? (await this.resolveRegistrationGrantAmount());
    const row = this.accountRepo.create({
      userId,
      totalAmount: String(total),
      usedAmount: '0',
      currency: BILLING_CURRENCY,
    });
    const saved = await this.accountRepo.save(row);
    this.logger.log('user_credit_account_granted', { userId, totalCredit: total });
    return saved;
  }

  async getAccount(userId: string): Promise<UserCreditAccount | null> {
    return this.accountRepo.findOne({ where: { userId } });
  }

  async resolveCompanyOwnerUserId(companyId: string): Promise<string | null> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
      select: ['id', 'createdBy'],
    });
    if (company?.createdBy?.trim()) {
      return company.createdBy.trim();
    }

    const rows = await this.companyRepo.manager.query<Array<{ user_id: string }>>(
      `
      SELECT user_id
      FROM company_memberships
      WHERE company_id = $1 AND role = 'owner' AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1
      `,
      [companyId],
    );
    return rows[0]?.user_id ?? null;
  }

  /** 仪表盘/门控：账号池额度（多公司共用） */
  async getAccountCreditViewForCompany(companyId: string): Promise<AccountCreditView | null> {
    const ownerId = await this.resolveCompanyOwnerUserId(companyId);
    if (!ownerId) return null;

    let account = await this.getAccount(ownerId);
    if (!account) {
      account = await this.ensureRegistrationGrant(ownerId);
    }

    return {
      userId: ownerId,
      totalAmount: account.totalAmount,
      usedAmount: account.usedAmount,
      currency: account.currency,
    };
  }

  async applyConsumptionInTransaction(
    manager: EntityManager,
    companyId: string,
    cost: number,
  ): Promise<void> {
    if (!Number.isFinite(cost) || cost <= 0) return;

    const ownerId = await this.resolveCompanyOwnerUserId(companyId);
    if (!ownerId) return;

    await manager.query(
      `
      INSERT INTO user_credit_accounts (user_id, total_amount, used_amount, currency)
      VALUES ($1, 0, 0, $2)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [ownerId, BILLING_CURRENCY],
    );

    await manager.query(
      `
      UPDATE user_credit_accounts
      SET used_amount = used_amount + $1::numeric,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      `,
      [cost, ownerId],
    );
  }

  async addCreditInTransaction(
    manager: EntityManager,
    userId: string,
    amount: number,
  ): Promise<string> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('invalid_credit_amount');
    }

    await manager.query(
      `
      INSERT INTO user_credit_accounts (user_id, total_amount, used_amount, currency)
      VALUES ($1, 0, 0, $2)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId, BILLING_CURRENCY],
    );

    const rows = await manager.query<Array<{ total_amount: string }>>(
      `
      UPDATE user_credit_accounts
      SET total_amount = total_amount + $1::numeric,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      RETURNING total_amount::text AS total_amount
      `,
      [amount, userId],
    );
    return rows[0]?.total_amount ?? '0';
  }
}
