import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin actors live in `admin_users`, not `users`.
 *
 * Governance/audit columns created_by/updated_by on skills/tools/mcp_tools currently reference `users(id)`.
 * For admin-managed CRUD we add parallel columns that reference `admin_users(id)` so we can persist
 * "who changed it" without violating FK constraints.
 *
 * No legacy backfill (Plan A: no compatibility required).
 */
export class AddAdminActorAuditColumns20260427180000 implements MigrationInterface {
  name = 'AddAdminActorAuditColumns20260427180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const add = async (table: string) => {
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS created_by_admin UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL
      `);
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS updated_by_admin UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_created_by_admin ON ${table}(created_by_admin)
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_updated_by_admin ON ${table}(updated_by_admin)
      `);
    };

    await add('skills');
    await add('tools');
    await add('mcp_tools');

    await queryRunner.query(`
      ALTER TABLE skill_versions
        ADD COLUMN IF NOT EXISTS created_by_admin UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_versions_created_by_admin ON skill_versions(created_by_admin)
    `);

    await queryRunner.query(`
      ALTER TABLE tool_versions
        ADD COLUMN IF NOT EXISTS created_by_admin UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tool_versions_created_by_admin ON tool_versions(created_by_admin)
    `);

    await queryRunner.query(`
      ALTER TABLE mcp_tool_versions
        ADD COLUMN IF NOT EXISTS created_by_admin UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_tool_versions_created_by_admin ON mcp_tool_versions(created_by_admin)
    `);

    await queryRunner.query(`
      ALTER TABLE skill_tool_bindings
        ADD COLUMN IF NOT EXISTS created_by_admin UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_tool_bindings_created_by_admin ON skill_tool_bindings(created_by_admin)
    `);

    await queryRunner.query(`
      ALTER TABLE skill_mcp_tool_bindings
        ADD COLUMN IF NOT EXISTS created_by_admin UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_mcp_tool_bindings_created_by_admin ON skill_mcp_tool_bindings(created_by_admin)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indices first
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skill_mcp_tool_bindings_created_by_admin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skill_tool_bindings_created_by_admin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_mcp_tool_versions_created_by_admin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tool_versions_created_by_admin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skill_versions_created_by_admin`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_created_by_admin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_updated_by_admin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tools_created_by_admin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tools_updated_by_admin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_mcp_tools_created_by_admin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_mcp_tools_updated_by_admin`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE skill_mcp_tool_bindings DROP COLUMN IF EXISTS created_by_admin`);
    await queryRunner.query(`ALTER TABLE skill_tool_bindings DROP COLUMN IF EXISTS created_by_admin`);
    await queryRunner.query(`ALTER TABLE mcp_tool_versions DROP COLUMN IF EXISTS created_by_admin`);
    await queryRunner.query(`ALTER TABLE tool_versions DROP COLUMN IF EXISTS created_by_admin`);
    await queryRunner.query(`ALTER TABLE skill_versions DROP COLUMN IF EXISTS created_by_admin`);

    await queryRunner.query(`ALTER TABLE mcp_tools DROP COLUMN IF EXISTS updated_by_admin`);
    await queryRunner.query(`ALTER TABLE mcp_tools DROP COLUMN IF EXISTS created_by_admin`);
    await queryRunner.query(`ALTER TABLE tools DROP COLUMN IF EXISTS updated_by_admin`);
    await queryRunner.query(`ALTER TABLE tools DROP COLUMN IF EXISTS created_by_admin`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS updated_by_admin`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS created_by_admin`);
  }
}

