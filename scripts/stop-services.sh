#!/bin/bash
# 统一服务停止脚本 - Linux/Mac Shell
# 用于停止所有服务和基础设施

set -e

ENVIRONMENT="${1:-dev}"
INFRASTRUCTURE_ONLY=false
APPS_ONLY=false
REMOVE_VOLUMES=false

function show_help() {
    cat << EOF
统一服务停止脚本 - Linux/Mac Shell

用法:
    ./scripts/stop-services.sh [环境] [选项]

环境:
    dev      - 开发环境（默认）
    prod     - 生产环境
    test     - 测试环境

选项:
    --infra-only     仅停止基础设施服务
    --apps-only      仅停止应用服务（需要手动停止）
    --remove-volumes 停止时删除数据卷（危险！）
    --help           显示此帮助信息

示例:
    ./scripts/stop-services.sh                    # 停止开发环境
    ./scripts/stop-services.sh prod               # 停止生产环境
    ./scripts/stop-services.sh --infra-only       # 仅停止基础设施
    ./scripts/stop-services.sh --remove-volumes   # 停止并删除数据卷

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
            --remove-volumes)
                REMOVE_VOLUMES=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            dev|prod|test)
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

function stop_infrastructure() {
    local env=$1
    local remove_vols=$2
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$(cd "$script_dir/.." && pwd)"
    
    echo ""
    echo "🛑 停止基础设施服务 ($env 环境)..."
    
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
    
    compose_files+=("down")
    
    if [ "$remove_vols" = true ]; then
        compose_files+=("-v")
        echo "⚠️  警告: 将删除所有数据卷!"
        read -p "确认继续? (y/N): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo "已取消"
            exit 0
        fi
    fi
    
    if docker-compose "${compose_files[@]}"; then
        echo "✅ 基础设施服务已停止!"
    else
        echo "❌ 停止服务时出错!"
        exit 1
    fi
}

function stop_apps() {
    echo ""
    echo "🛑 停止应用服务..."
    echo "提示: 请使用 Ctrl+C 停止应用服务进程，或查找并终止相关进程"
    echo "查找进程: ps aux | grep 'turbo run dev'"
    echo "终止进程: pkill -f 'turbo run dev'"
}

# 解析参数
parse_args "$@"

# 主逻辑
echo ""
echo "=== 服务停止管理器 ==="
echo "环境: $ENVIRONMENT"

if [ "$INFRASTRUCTURE_ONLY" = true ]; then
    stop_infrastructure "$ENVIRONMENT" "$REMOVE_VOLUMES"
elif [ "$APPS_ONLY" = true ]; then
    stop_apps
else
    stop_apps
    sleep 2
    stop_infrastructure "$ENVIRONMENT" "$REMOVE_VOLUMES"
fi

echo ""
echo "✨ 完成!"



































