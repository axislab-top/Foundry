import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1767855312397 implements MigrationInterface {
  name = 'CreateUsersTable1767855312397';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建 users 表
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "username" character varying(100) NOT NULL,
        "email" character varying(255) NOT NULL,
        "passwordHash" character varying(255) NOT NULL,
        "roles" jsonb NOT NULL DEFAULT '[]',
        "permissions" jsonb NOT NULL DEFAULT '[]',
        "enabled" boolean NOT NULL DEFAULT true,
        "lastLoginAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "deletedAt" timestamp,
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // 创建唯一索引
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email") WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_username" ON "users" ("username") WHERE "deletedAt" IS NULL
    `);

    // 添加表注释
    await queryRunner.query(`
      COMMENT ON TABLE "users" IS '用户表'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."username" IS '用户名'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."email" IS '邮箱'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."passwordHash" IS '密码哈希'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."roles" IS '角色列表'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."permissions" IS '权限列表'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."enabled" IS '是否启用'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."lastLoginAt" IS '最后登录时间'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."createdAt" IS '创建时间'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."updatedAt" IS '更新时间'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."deletedAt" IS '删除时间'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_username"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email"`);
    
    // 删除表
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
















