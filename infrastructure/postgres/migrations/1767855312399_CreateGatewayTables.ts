import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGatewayTables1767855312399 implements MigrationInterface {
  name = 'CreateGatewayTables1767855312399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建 updated_at 自动更新触发器函数（如果不存在）
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // 2. 创建 API 密钥表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key_id VARCHAR(64) UNIQUE NOT NULL,
        key_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        permissions JSONB,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建 API 密钥表索引
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_key_id ON api_keys(key_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at)
    `);

    // 创建 API 密钥表触发器
    await queryRunner.query(`
      CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    // 3. 创建路由表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        path VARCHAR(255) UNIQUE NOT NULL,
        service VARCHAR(50) NOT NULL,
        rewrite_path VARCHAR(255),
        auth_required BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建路由表索引
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_routes_path ON routes(path)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_routes_is_active ON routes(is_active)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_routes_priority ON routes(priority DESC, path)
    `);

    // 创建路由表触发器
    await queryRunner.query(`
      CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    // 4. 创建审计日志表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id VARCHAR(64),
        user_id UUID,
        api_key_id VARCHAR(64),
        service VARCHAR(50) NOT NULL,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(500) NOT NULL,
        status_code INTEGER NOT NULL,
        request_headers JSONB,
        request_body TEXT,
        response_body TEXT,
        client_ip VARCHAR(45),
        user_agent VARCHAR(500),
        duration_ms INTEGER,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建审计日志表索引
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_service ON audit_logs(service)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_method_path ON audit_logs(method, path)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_status_code ON audit_logs(status_code)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_service_created ON audit_logs(service, created_at DESC)
    `);

    // 添加审计日志表注释
    await queryRunner.query(`
      COMMENT ON TABLE audit_logs IS '审计日志表'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.id IS '主键ID'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.request_id IS '请求ID'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.user_id IS '用户ID（如果有）'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.api_key_id IS 'API密钥ID（如果有）'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.service IS '服务名称（api, webhooks, worker等）'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.method IS 'HTTP方法'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.path IS '请求路径'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.status_code IS '状态码'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.request_headers IS '请求头（JSON，已脱敏）'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.request_body IS '请求体（JSON，已脱敏）'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.response_body IS '响应体（JSON，已脱敏，仅记录错误）'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.client_ip IS '客户端IP'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.user_agent IS 'User-Agent'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.duration_ms IS '请求持续时间（毫秒）'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.error_message IS '错误信息（如果有）'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.created_at IS '创建时间'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除触发器
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_routes_updated_at ON routes
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys
    `);

    // 删除表
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS routes`);
    await queryRunner.query(`DROP TABLE IF EXISTS api_keys`);

    // 删除函数（注意：如果其他表也在使用这个函数，不要删除）
    // await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column()`);
  }
}












