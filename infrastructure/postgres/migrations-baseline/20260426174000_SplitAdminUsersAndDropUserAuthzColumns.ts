import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitAdminUsersAndDropUserAuthzColumns20260426174000 implements MigrationInterface {
  name = 'SplitAdminUsersAndDropUserAuthzColumns20260426174000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username varchar(100) NOT NULL UNIQUE,
        email varchar(255) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        roles jsonb NOT NULL DEFAULT '["admin"]'::jsonb,
        permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
        enabled boolean NOT NULL DEFAULT true,
        last_login_at timestamp NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        deleted_at timestamp NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_admin_users_email" ON "admin_users" ("email")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_admin_users_username" ON "admin_users" ("username")`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "roles"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "permissions"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roles" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_users_username"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_users_email"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_users"`);
  }
}
