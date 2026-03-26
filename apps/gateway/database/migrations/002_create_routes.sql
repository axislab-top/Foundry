-- 创建路由表
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
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_routes_path ON routes(path);
CREATE INDEX IF NOT EXISTS idx_routes_is_active ON routes(is_active);
CREATE INDEX IF NOT EXISTS idx_routes_priority ON routes(priority DESC, path);

-- 创建 updated_at 自动更新触发器
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认路由（如果需要）
-- INSERT INTO routes (path, service, auth_required, priority) VALUES
-- ('/api/v1/*', 'api', true, 100),
-- ('/webhooks/*', 'webhooks', false, 90),
-- ('/worker/*', 'worker', true, 80);


































