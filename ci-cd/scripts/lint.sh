#!/bin/bash
# 代码检查脚本
# 用于运行 Lint 和类型检查

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🔍 Starting code quality checks...${NC}"
echo ""

# 检查工具
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm not found${NC}"
    exit 1
fi

# 安装依赖
echo -e "${GREEN}📦 Installing dependencies...${NC}"
pnpm install --frozen-lockfile

# 运行 ESLint
echo -e "${GREEN}🔍 Running ESLint...${NC}"
pnpm lint || {
    echo -e "${RED}❌ Lint failed${NC}"
    exit 1
}

# 运行 Prettier 检查
echo -e "${GREEN}🔍 Running Prettier check...${NC}"
pnpm --filter "*" exec prettier --check "**/*.{ts,js,json,md}" || {
    echo -e "${YELLOW}⚠️  Prettier check failed (some files may need formatting)${NC}"
}

# 运行 TypeScript 类型检查
echo -e "${GREEN}🔍 Running TypeScript type check...${NC}"
for service_dir in apps/*/; do
    if [ -f "${service_dir}tsconfig.json" ]; then
        service_name=$(basename "$service_dir")
        echo "  Checking ${service_name}..."
        pnpm --filter "@service/${service_name}" exec tsc --noEmit || {
            echo -e "${RED}❌ Type check failed for ${service_name}${NC}"
            exit 1
        }
    fi
done

echo -e "${GREEN}✅ All code quality checks passed!${NC}"






























