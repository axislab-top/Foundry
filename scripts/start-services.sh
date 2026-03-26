#!/bin/bash
# 统一服务启动脚本 - Linux/Mac Shell
# 用于启动所有服务和基础设施

set -e

ENVIRONMENT="${1:-dev}"
INFRASTRUCTURE_ONLY=false
APPS_ONLY=false
WITH_CONSUL=false

function show_help() {
    cat << EOF
统一服务管理脚本 - Linux/Mac Shell

用法:
    ./scripts/start-services.sh [环境] [选项]

环境:
    dev      - 开发环境（默认）
    prod     - 生产环境
    test     - 测试环境
    all      - 启动所有环境

选项:
    --infra-only     仅启动基础设施服务（PostgreSQL, Redis, Consul等）
    --apps-only      仅启动应用服务（Gateway, API等）
    --with-consul    启动时包含Consul服务发现
    --help           显示此帮助信息

示例:
    ./scripts/start-services.sh                    # 启动开发环境（默认）
    ./scripts/start-services.sh dev                # 启动开发环境
    ./scripts/start-services.sh prod               # 启动生产环境
    ./scripts/start-services.sh --infra-only       # 仅启动基础设施
    ./scripts/start-services.sh --apps-only        # 仅启动应用服务
    ./scripts/start-services.sh --with-consul      # 启动开发环境并包含Consul

EOF
}

function parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --infra-only)
                INFRASTRUCTURE_ONLY=true
                shift
                ;;
            --apps-only)
                APPS_ONLY=true
                shift
                ;;
            --with-consul)
                WITH_CONSUL=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            dev|prod|test|all)
                ENVIRONMENT=$1
                shift
                ;;
            *)
                echo "未知选项: $1" >&2
                show_help
                exit 1
                ;;
        esac
    done
}

function start_infrastructure() {
    local env=$1
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$(cd "$script_dir/.." && pwd)"
    
    echo ""
    echo "🚀 启动基础设施服务 ($env 环境)..."
    
    cd "$project_root"
    
    local compose_files=("-f" "deployment/docker/docker-compose.yml")
    
    case $env in
        dev)
            compose_files+=("-f" "deployment/docker/docker-compose.dev.yml")
            ;;
        prod)
            compose_files+=("-f" "deployment/docker/docker-compose.prod.yml")
            ;;
        test)
            compose_files+=("-f" "deployment/docker/docker-compose.test.yml")
            ;;
    esac
    
    if [ "$WITH_CONSUL" = true ]; then
        compose_files+=("--profile" "consul")
        export CONSUL_ENABLED=true
    fi
    
    compose_files+=("up" "-d")
    
    if docker-compose "${compose_files[@]}"; then
        echo "✅ 基础设施服务启动成功!"
    else
        echo "❌ 基础设施服务启动失败!"
        exit 1
    fi
}

function start_apps() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$(cd "$script_dir/.." && pwd)"
    
    echo ""
    echo "🚀 启动应用服务..."
    
    cd "$project_root"
    pnpm dev
}

function show_status() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$(cd "$script_dir/.." && pwd)"
    
    echo ""
    echo "📊 服务状态:"
    cd "$project_root"
    docker-compose -f deployment/docker/docker-compose.yml ps
}

# 解析参数
parse_args "$@"

# 主逻辑
echo ""
echo "=== 服务启动管理器 ==="
echo "环境: $ENVIRONMENT"

if [ "$INFRASTRUCTURE_ONLY" = true ]; then
    start_infrastructure "$ENVIRONMENT"
    show_status
elif [ "$APPS_ONLY" = true ]; then
    start_apps
else
    start_infrastructure "$ENVIRONMENT"
    echo ""
    echo "⏳ 等待基础设施服务就绪..."
    sleep 5
    start_apps &
    APP_PID=$!
    show_status
    wait $APP_PID
fi

echo ""
echo "✨ 完成!"



































