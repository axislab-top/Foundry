import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 账号级 Credit 池：注册赠送一次，多公司共用，不再按公司重复发放。
 */
export class UserCreditAccounts20260622130000 implements MigrationInterface {
  name = 'UserCreditAccounts20260622130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_credit_accounts (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        total_amount NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
        used_amount NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (used_amount >= 0),
        currency VARCHAR(8) NOT NULL DEFAULT 'CREDIT',
        granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_credit_accounts_updated
      ON user_credit_accounts(updated_at DESC)
    `);

    // 存量用户：每人一次 1,000,000 Credit；已消费按名下所有公司 company 预算 used 汇总
    await queryRunner.query(`
      INSERT INTO user_credit_accounts (user_id, total_amount, used_amount, currency)
      SELECT
        u.id,
        1000000,
        COALESCE((
          SELECT SUM(b.used_amount::numeric)
          FROM budgets b
          INNER JOIN companies c ON c.id = b.company_id
          WHERE b.scope = 'company'
            AND c.created_by = u.id
        ), 0),
        'CREDIT'
      FROM users u
      ON CONFLICT (user_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_credit_accounts`);
  }
}
