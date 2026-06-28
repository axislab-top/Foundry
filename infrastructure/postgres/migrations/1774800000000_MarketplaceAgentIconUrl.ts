import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 商城 Agent 展示用图标（HTTPS 图片 URL，可为空） */
export class MarketplaceAgentIconUrl1774800000000 implements MigrationInterface {
  name = 'MarketplaceAgentIconUrl1774800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
        ADD COLUMN IF NOT EXISTS icon_url varchar(2048) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
        DROP COLUMN IF EXISTS icon_url
    `);
  }
}
