#!/bin/bash
# ============================================================================
# 数据库引导脚本 — 首次安装时使用
# 使用 baseline SQL 一次性创建所有表
# ============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DB_USER="${DB_USERNAME:-postgres}"
DB_NAME="${DB_DATABASE:-service_db}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASELINE_SQL="$PROJECT_ROOT/infrastructure/postgres/migrations/baseline-schema.sql"

echo -e "${YELLOW}=== Foundry 数据库初始化 ===${NC}"

# 检查 baseline SQL
if [ ! -f "$BASELINE_SQL" ]; then
  echo -e "${RED}❌ 找不到 baseline-schema.sql${NC}"
  exit 1
fi

# 等待 PostgreSQL 就绪
echo -n "等待 PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec service-postgres pg_isready -U "$DB_USER" > /dev/null 2>&1; then
    echo -e " ${GREEN}就绪${NC}"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo -e " ${RED}超时，请先运行 pnpm infra:start${NC}"
    exit 1
  fi
  sleep 1
done

# 执行 baseline SQL（过滤掉不兼容的行）
echo -n "创建数据库表..."
grep -v "COMMENT ON" "$BASELINE_SQL" | \
  grep -v "set_config" | \
  grep -v "^\\\\" | \
  docker exec -i service-postgres psql -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1

TABLE_COUNT=$(docker exec service-postgres psql -U "$DB_USER" -d "$DB_NAME" -t \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
echo -e " ${GREEN}完成 ($TABLE_COUNT 张表)${NC}"

echo ""
echo -e "${GREEN}✅ 数据库初始化完成${NC}"
