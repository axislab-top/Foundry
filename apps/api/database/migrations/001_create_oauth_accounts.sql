-- 创建第三方账号表
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  "providerUserId" VARCHAR(255) NOT NULL,
  "providerUsername" VARCHAR(255),
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMP,
  "profileData" JSONB,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, "providerUserId")
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts("userId");
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user_id ON oauth_accounts(provider, "providerUserId");

-- 添加注释
COMMENT ON TABLE oauth_accounts IS '第三方账号绑定表';
COMMENT ON COLUMN oauth_accounts.id IS '主键ID';
COMMENT ON COLUMN oauth_accounts."userId" IS '关联的用户ID';
COMMENT ON COLUMN oauth_accounts.provider IS '第三方平台提供商 (wechat, qq, github 等)';
COMMENT ON COLUMN oauth_accounts."providerUserId" IS '第三方平台的用户ID (openid)';
COMMENT ON COLUMN oauth_accounts."providerUsername" IS '第三方平台的用户名/昵称';
COMMENT ON COLUMN oauth_accounts."accessToken" IS '访问令牌（可选，用于后续API调用）';
COMMENT ON COLUMN oauth_accounts."refreshToken" IS '刷新令牌（可选）';
COMMENT ON COLUMN oauth_accounts."expiresAt" IS 'Token过期时间';
COMMENT ON COLUMN oauth_accounts."profileData" IS '第三方平台的用户信息（完整profile）';



































