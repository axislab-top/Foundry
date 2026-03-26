-- 创建审计日志表
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
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_service ON audit_logs(service);
CREATE INDEX IF NOT EXISTS idx_audit_logs_method_path ON audit_logs(method, path);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status_code ON audit_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 创建复合索引（用于常见查询）
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_service_created ON audit_logs(service, created_at DESC);

-- 添加注释
COMMENT ON TABLE audit_logs IS '审计日志表';
COMMENT ON COLUMN audit_logs.id IS '主键ID';
COMMENT ON COLUMN audit_logs.request_id IS '请求ID';
COMMENT ON COLUMN audit_logs.user_id IS '用户ID（如果有）';
COMMENT ON COLUMN audit_logs.api_key_id IS 'API密钥ID（如果有）';
COMMENT ON COLUMN audit_logs.service IS '服务名称（api, webhooks, worker等）';
COMMENT ON COLUMN audit_logs.method IS 'HTTP方法';
COMMENT ON COLUMN audit_logs.path IS '请求路径';
COMMENT ON COLUMN audit_logs.status_code IS '状态码';
COMMENT ON COLUMN audit_logs.request_headers IS '请求头（JSON，已脱敏）';
COMMENT ON COLUMN audit_logs.request_body IS '请求体（JSON，已脱敏）';
COMMENT ON COLUMN audit_logs.response_body IS '响应体（JSON，已脱敏，仅记录错误）';
COMMENT ON COLUMN audit_logs.client_ip IS '客户端IP';
COMMENT ON COLUMN audit_logs.user_agent IS 'User-Agent';
COMMENT ON COLUMN audit_logs.duration_ms IS '请求持续时间（毫秒）';
COMMENT ON COLUMN audit_logs.error_message IS '错误信息（如果有）';
COMMENT ON COLUMN audit_logs.created_at IS '创建时间';


































