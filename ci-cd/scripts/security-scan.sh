#!/bin/bash
# 安全扫描脚本
# 用于扫描依赖漏洞和 Docker 镜像安全

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
SCAN_TYPE="${SCAN_TYPE:-all}"  # all, dependencies, docker
FAIL_ON_VULNERABILITIES="${FAIL_ON_VULNERABILITIES:-false}"

echo -e "${GREEN}🔒 Starting security scan...${NC}"
echo "Scan Type: ${SCAN_TYPE}"
echo ""

# 检查工具
check_tool() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${YELLOW}⚠️  $1 not found, skipping $2 scan...${NC}"
        return 1
    fi
    return 0
}

# 依赖漏洞扫描
scan_dependencies() {
    echo -e "${GREEN}🔍 Scanning dependencies for vulnerabilities...${NC}"
    
    # 使用 pnpm audit
    if check_tool "pnpm" "pnpm audit"; then
        echo "Running pnpm audit..."
        pnpm audit --audit-level=moderate || {
            if [ "$FAIL_ON_VULNERABILITIES" = "true" ]; then
                echo -e "${RED}❌ Vulnerabilities found!${NC}"
                exit 1
            else
                echo -e "${YELLOW}⚠️  Vulnerabilities found, but continuing...${NC}"
            }
        }
    fi
    
    # 使用 npm audit（如果可用）
    if check_tool "npm" "npm audit"; then
        echo "Running npm audit..."
        npm audit --audit-level=moderate || {
            if [ "$FAIL_ON_VULNERABILITIES" = "true" ]; then
                echo -e "${RED}❌ Vulnerabilities found!${NC}"
                exit 1
            else
                echo -e "${YELLOW}⚠️  Vulnerabilities found, but continuing...${NC}"
            }
        }
    fi
}

# Docker 镜像安全扫描
scan_docker() {
    echo -e "${GREEN}🔍 Scanning Docker images for vulnerabilities...${NC}"
    
    # 检查 trivy
    if check_tool "trivy" "Trivy"; then
        echo "Running Trivy scan..."
        
        # 扫描 Dockerfile
        for dockerfile in $(find . -name "Dockerfile" -not -path "./node_modules/*"); do
            echo "Scanning: $dockerfile"
            trivy fs --severity HIGH,CRITICAL "$(dirname $dockerfile)" || {
                if [ "$FAIL_ON_VULNERABILITIES" = "true" ]; then
                    echo -e "${RED}❌ Vulnerabilities found in $dockerfile!${NC}"
                    exit 1
                else
                    echo -e "${YELLOW}⚠️  Vulnerabilities found in $dockerfile${NC}"
                }
            }
        done
    fi
    
    # 检查 docker-bench-security（如果可用）
    if check_tool "docker-bench-security" "Docker Bench Security"; then
        echo "Running Docker Bench Security..."
        docker-bench-security || {
            echo -e "${YELLOW}⚠️  Docker security issues found${NC}"
        }
    fi
}

# 运行扫描
case "$SCAN_TYPE" in
    dependencies)
        scan_dependencies
        ;;
    docker)
        scan_docker
        ;;
    all)
        scan_dependencies
        scan_docker
        ;;
    *)
        echo -e "${RED}❌ Unknown scan type: ${SCAN_TYPE}${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✅ Security scan completed!${NC}"






























