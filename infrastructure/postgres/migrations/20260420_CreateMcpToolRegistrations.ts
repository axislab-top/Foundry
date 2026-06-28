import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 2 P9（调整版）：per-agent MCP Tool 注册表（强隔离）。
 *
 * 设计原则：
 * - MCP Tool 作为一种“工具类型”，仍然由「Agent 商城」按 Agent 维度配置与下发。
 * - 运行时 **绝不允许** 跨 agent_id 读取/执行（Worker 与 Runner 都会再次硬校验）。
 * - 表级 RLS：仅允许 current tenant（app.current_tenant）访问自身 company_id 数据。
 */
export class CreateMcpToolRegistrations2026042001000 implements MigrationInterface {
  name = 'CreateMcpToolRegistrations2026042001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mcp_tool_registrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        agent_id UUID NOT NULL,
        /**
         * CEO 三层隔离：classifier / light / heavy；
         * 普通 Agent 为空（NULL）即可。
         */
        layer VARCHAR(24) NULL,
        tool_name VARCHAR(180) NOT NULL,
        description TEXT NOT NULL,
        /**
         * MCP 工具 JSON Schema（OpenAI / vLLM function calling parameters）
         * 仅存对象形态；更严 Schema 校验在 API 层做。
         */
        schema JSONB NOT NULL,
        /**
         * security_profile：safe/fs-write/network/shell/dangerous 等；
         * Runner 会按策略链执行；Worker 仅做“是否存在/是否越权”的先验校验。
         */
        security_profile VARCHAR(24) NOT NULL DEFAULT 'safe',
        /**
         * transport / endpoint 提示（如 http url），保持 JSONB 以兼容未来 MCP transport 扩展。
         */
        transport JSONB NULL,
        metadata JSONB NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, agent_id, layer, tool_name)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_tool_registrations_lookup
      ON mcp_tool_registrations(company_id, agent_id, layer, is_enabled, tool_name)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_tool_registrations_company_tool
      ON mcp_tool_registrations(company_id, tool_name)
    `);

    await queryRunner.query(`ALTER TABLE mcp_tool_registrations ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE mcp_tool_registrations FORCE ROW LEVEL SECURITY`);

    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_mcp_tool_registrations ON mcp_tool_registrations`);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_mcp_tool_registrations ON mcp_tool_registrations
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS company_isolation_on_mcp_tool_registrations ON mcp_tool_registrations`,
    );
    await queryRunner.query(`ALTER TABLE mcp_tool_registrations NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE mcp_tool_registrations DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP TABLE IF EXISTS mcp_tool_registrations`);
  }
}

