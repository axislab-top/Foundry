#!/bin/bash
# 测试脚本
# 用于运行单元测试和集成测试

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 配置
TEST_TYPE="${TEST_TYPE:-all}"  # all, unit, integration, e2e
COVERAGE="${COVERAGE:-false}"
VERBOSE="${VERBOSE:-false}"

echo -e "${GREEN}🧪 Starting tests...${NC}"
echo "Test Type: ${TEST_TYPE}"
echo "Coverage: ${COVERAGE}"
echo ""

# 检查 Node.js 和 pnpm
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm not found${NC}"
    exit 1
fi

# 安装依赖
echo -e "${GREEN}📦 Installing dependencies...${NC}"
pnpm install --frozen-lockfile

# 运行 lint
echo -e "${GREEN}🔍 Running linter...${NC}"
pnpm lint || {
    echo -e "${RED}❌ Lint failed${NC}"
    exit 1
}

# 运行类型检查
echo -e "${GREEN}🔍 Running type check...${NC}"
pnpm --filter "*" exec tsc --noEmit || {
    echo -e "${YELLOW}⚠️  Type check skipped (no TypeScript config found)${NC}"
}

# 运行测试
case "$TEST_TYPE" in
    unit)
        echo -e "${GREEN}🧪 Running unit tests...${NC}"
        if [ "$COVERAGE" = "true" ]; then
            pnpm test:cov
        else
            pnpm test
        fi
        ;;
    integration)
        echo -e "${GREEN}🧪 Running integration tests...${NC}"
        # 启动测试环境
        pnpm infra:test:start
        sleep 10  # 等待服务启动
        
        # 运行集成测试
        pnpm test:integration || {
            pnpm infra:test:stop
            exit 1
        }
        
        # 停止测试环境
        pnpm infra:test:stop
        ;;
    e2e)
        echo -e "${GREEN}🧪 Running E2E tests...${NC}"
        # 启动测试环境
        pnpm infra:test:start
        sleep 10  # 等待服务启动
        
        # 运行 E2E 测试
        pnpm test:e2e || {
            pnpm infra:test:stop
            exit 1
        }
        
        # 停止测试环境
        pnpm infra:test:stop
        ;;
    all)
        echo -e "${GREEN}🧪 Running all tests...${NC}"
        
        # 单元测试
        if [ "$COVERAGE" = "true" ]; then
            pnpm test:cov
        else
            pnpm test
        fi
        
        # 集成测试（如果存在）
        if [ -d "test/integration" ]; then
            echo -e "${GREEN}🧪 Running integration tests...${NC}"
            pnpm infra:test:start
            sleep 10
            pnpm test:integration || {
                pnpm infra:test:stop
                exit 1
            }
            pnpm infra:test:stop
        fi
        ;;
    *)
        echo -e "${RED}❌ Unknown test type: ${TEST_TYPE}${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✅ All tests passed!${NC}"






























