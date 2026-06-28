# Purge user/company data for manual testing (dev)
#
# Goals:
# - Release company-bound keys by clearing company<->marketplace agent key assignment rows
# - Delete company-scoped user/company data (cascade) so manual tests can restart
# - Do NOT delete:
#   - marketplace agents
#   - llm keys
#
# Default DB: service_db (matches .env.shared)

param(
  [string]$Database = "service_db",
  [string]$PostgresContainer = "service-postgres-dev",
  [string]$PostgresUser = "postgres",
  [switch]$Help
)

if ($Help) {
  Write-Host @"
Usage:
  .\scripts\purge-user-company-for-test.ps1
  .\scripts\purge-user-company-for-test.ps1 -Database service_db_dev

What it does:
  1) TRUNCATE company_marketplace_agent_key_assignments (release bindings only)
  2) TRUNCATE company_memberships, companies, users with CASCADE (delete personal + company data)
Verifications (printed at the end):
  - llm_keys count
  - marketplace_agents count
  - marketplace_agent_key_bindings count
  - users/companies/company_memberships counts
"@
  exit 0
}

function Exec-Sql {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Sql
  )

  & docker exec $PostgresContainer psql -U $PostgresUser -d $Database -c $Sql
}

Write-Host "Purging user/company data in DB '$Database' (container '$PostgresContainer') ..." -ForegroundColor Cyan

# 1) Release company-bound key assignments only (do not touch llm_keys / marketplace_agents)
$sql1 = "TRUNCATE TABLE public.company_marketplace_agent_key_assignments RESTART IDENTITY;"
Exec-Sql -Sql $sql1 | Out-Null

# 2) Delete company & user related personal data
$sql2 = @"
TRUNCATE TABLE public.company_memberships, public.companies, public.users
RESTART IDENTITY
CASCADE;
"@
Exec-Sql -Sql $sql2 | Out-Null

# 3) Verify key tables are preserved and user/company tables are empty
$verifySql = @"
SELECT
  'company_marketplace_agent_key_assignments' AS table_name, COUNT(*)::bigint AS rows
FROM public.company_marketplace_agent_key_assignments
UNION ALL SELECT 'users', COUNT(*)::bigint FROM public.users
UNION ALL SELECT 'companies', COUNT(*)::bigint FROM public.companies
UNION ALL SELECT 'company_memberships', COUNT(*)::bigint FROM public.company_memberships
UNION ALL SELECT 'llm_keys', COUNT(*)::bigint FROM public.llm_keys
UNION ALL SELECT 'marketplace_agents', COUNT(*)::bigint FROM public.marketplace_agents
UNION ALL SELECT 'marketplace_agent_key_bindings', COUNT(*)::bigint FROM public.marketplace_agent_key_bindings
ORDER BY table_name;
"@

Write-Host "Verification:" -ForegroundColor Yellow
Exec-Sql -Sql $verifySql

Write-Host "Done." -ForegroundColor Green

