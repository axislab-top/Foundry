import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOAuthAccountsTable1767855312398 implements MigrationInterface {
  name = 'CreateOAuthAccountsTable1767855312398';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建 oauth_accounts 表
    await queryRunner.query(`
      CREATE TABLE "oauth_accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "provider" character varying(50) NOT NULL,
        "providerUserId" character varying(255) NOT NULL,
        "providerUsername" character varying(255),
        "accessToken" text,
        "refreshToken" text,
        "expiresAt" timestamp,
        "profileData" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oauth_accounts" PRIMARY KEY ("id")
      )
    `);

    // 创建唯一索引（provider 和 providerUserId 的组合唯一）
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_oauth_accounts_provider_providerUserId" 
      ON "oauth_accounts" ("provider", "providerUserId")
    `);

    // 创建外键约束
    await queryRunner.query(`
      ALTER TABLE "oauth_accounts" 
      ADD CONSTRAINT "FK_oauth_accounts_userId" 
      FOREIGN KEY ("userId") 
      REFERENCES "users"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);

    // 添加表注释
    await queryRunner.query(`
      COMMENT ON TABLE "oauth_accounts" IS '第三方账号表'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."userId" IS '用户ID'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."provider" IS '第三方平台提供商'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."providerUserId" IS '第三方平台的用户ID'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."providerUsername" IS '第三方平台的用户名'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."accessToken" IS '访问令牌'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."refreshToken" IS '刷新令牌'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."expiresAt" IS 'Token过期时间'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."profileData" IS '第三方平台的用户信息'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."createdAt" IS '创建时间'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "oauth_accounts"."updatedAt" IS '更新时间'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除外键约束
    await queryRunner.query(`
      ALTER TABLE "oauth_accounts" 
      DROP CONSTRAINT IF EXISTS "FK_oauth_accounts_userId"
    `);

    // 删除索引
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_oauth_accounts_provider_providerUserId"
    `);

    // 删除表
    await queryRunner.query(`DROP TABLE IF EXISTS "oauth_accounts"`);
  }
}
















