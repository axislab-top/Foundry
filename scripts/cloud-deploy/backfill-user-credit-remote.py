#!/usr/bin/env python3
"""云服务器：创建 user_credit_accounts 并回填存量用户 1,000,000 Credit。"""
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."

SQL = """
CREATE TABLE IF NOT EXISTS user_credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_amount NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  used_amount NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (used_amount >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'CREDIT',
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
ON CONFLICT (user_id) DO UPDATE SET
  total_amount = GREATEST(user_credit_accounts.total_amount, EXCLUDED.total_amount),
  used_amount = GREATEST(user_credit_accounts.used_amount, EXCLUDED.used_amount),
  updated_at = CURRENT_TIMESTAMP;

SELECT COUNT(*) AS accounts,
       COALESCE(SUM(total_amount), 0) AS total_granted,
       COALESCE(SUM(used_amount), 0) AS total_used
FROM user_credit_accounts;
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

remote_sql = "/tmp/backfill-user-credit.sql"
sftp = c.open_sftp()
with sftp.file(remote_sql, "w") as f:
    f.write(SQL)
sftp.close()

_, o, e = c.exec_command(
    f"sudo docker cp {remote_sql} service-postgres-prod:/tmp/backfill-user-credit.sql && "
    f"sudo docker exec service-postgres-prod psql -U postgres -d service_db -f /tmp/backfill-user-credit.sql",
    timeout=120,
)
print(o.read().decode(errors="replace"))
err = e.read().decode(errors="replace")
if err.strip():
    print(err)
c.close()
