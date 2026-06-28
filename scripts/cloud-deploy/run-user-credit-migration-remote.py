#!/usr/bin/env python3
"""在服务器上执行 UserCreditAccounts20260622130000 迁移（幂等）并写入 migrations 表。"""
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."

SQL = """
-- UserCreditAccounts20260622130000 (idempotent)
CREATE TABLE IF NOT EXISTS user_credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_amount NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  used_amount NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (used_amount >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'CREDIT',
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_credit_accounts_updated
ON user_credit_accounts(updated_at DESC);

INSERT INTO user_credit_accounts (user_id, total_amount, used_amount, currency)
SELECT
  u.id,
  1000000,
  COALESCE((
    SELECT SUM(b.used_amount::numeric)
    FROM budgets b
    INNER JOIN companies c ON c.id = b.company_id
    WHERE b.scope = 'company' AND c.created_by = u.id
  ), 0),
  'CREDIT'
FROM users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO migrations (timestamp, name)
SELECT 20260622130000, 'UserCreditAccounts20260622130000'
WHERE NOT EXISTS (
  SELECT 1 FROM migrations WHERE name = 'UserCreditAccounts20260622130000'
);

SELECT
  (SELECT COUNT(*) FROM user_credit_accounts) AS credit_accounts,
  (SELECT name FROM migrations WHERE name = 'UserCreditAccounts20260622130000') AS migration_record;
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

remote_sql = "/tmp/user-credit-migration.sql"
sftp = c.open_sftp()
with sftp.file(remote_sql, "w") as f:
    f.write(SQL)
sftp.close()

_, o, e = c.exec_command(
    f"sudo docker cp {remote_sql} service-postgres-prod:/tmp/user-credit-migration.sql && "
    f"sudo docker exec service-postgres-prod psql -U postgres -d service_db -f /tmp/user-credit-migration.sql",
    timeout=120,
)
print(o.read().decode(errors="replace"))
err = e.read().decode(errors="replace")
if err.strip():
    print(err)
c.close()
