#!/bin/bash
# ============================================================================
# 数据库引导脚本 — 给新用户首次安装使用
# 使用 baseline SQL 一次性创建所有表，跳过增量迁移
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DB_USER="${DB_USERNAME:-postgres}"
DB_NAME="${DB_DATABASE:-service_db}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASELINE_SQL="$PROJECT_ROOT/infrastructure/postgres/migrations/baseline-schema.sql"

echo -e "${YELLOW}=== Foundry 数据库引导 ===${NC}"
echo ""

# Step 1: 检查 baseline SQL 是否存在
if [ ! -f "$BASELINE_SQL" ]; then
  echo -e "${RED}❌ 找不到 baseline-schema.sql${NC}"
  exit 1
fi

# Step 2: 等待 PostgreSQL 就绪
echo -e "${YELLOW}等待 PostgreSQL 就绪...${NC}"
for i in $(seq 1 30); do
  if docker exec service-postgres pg_isready -U "$DB_USER" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL 已就绪${NC}"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo -e "${RED}❌ PostgreSQL 未就绪，请先运行 pnpm infra:start${NC}"
    exit 1
  fi
  sleep 1
done

# Step 3: 执行 baseline SQL
echo -e "${YELLOW}创建数据库表...${NC}"
grep -v "COMMENT ON" "$BASELINE_SQL" | grep -v "^\\" | grep -v "set_config" | \
  docker exec -i service-postgres psql -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1
TABLE_COUNT=$(docker exec service-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
echo -e "${GREEN}✅ 已创建 $TABLE_COUNT 张表${NC}"

# Step 4: 标记所有迁移为已执行
echo -e "${YELLOW}标记迁移记录...${NC}"
docker exec service-postgres psql -U "$DB_USER" -d "$DB_NAME" -c \
  "CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, timestamp BIGINT NOT NULL, name VARCHAR(255) NOT NULL);" > /dev/null 2>&1

MARKED=0
for f in "$PROJECT_ROOT"/infrastructure/postgres/migrations/*.ts; do
  [ -f "$f" ] || continue
  name=$(grep "name = '" "$f" | head -1 | sed "s/.*name = '//;s/'.*//")
  ts=$(echo "$name" | grep -o '[0-9]*$')
  if [ -n "$name" ] && [ -n "$ts" ]; then
    docker exec service-postgres psql -U "$DB_USER" -d "$DB_NAME" -c \
      "INSERT INTO migrations (timestamp, name) VALUES ($ts, '$name') ON CONFLICT DO NOTHING;" > /dev/null 2>&1
    MARKED=$((MARKED + 1))
  fi
done
echo -e "${GREEN}✅ 已标记 $MARKED 个迁移${NC}"

echo ""
echo -e "${GREEN}=== 数据库引导完成 ===${NC}"
echo -e "表数量: $TABLE_COUNT"
echo -e "迁移记录: $MARKED"
echo ""
echo -e "${YELLOW}下一步: pnpm dev${NC}"
