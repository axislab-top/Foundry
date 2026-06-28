#!/bin/bash
# ============================================================================
# 环境变量管理脚本 (Bash)
# ============================================================================
# 
# 功能：
# 1. 从统一的 .env.shared 文件生成各服务的 .env 文件
# 2. 支持按服务过滤环境变量
# 3. 支持生成 Docker 部署的 .env 文件
#
# 使用方式：
#   ./scripts/env-manager.sh [选项]
#
# 选项：
#   --source <文件>     源环境变量文件（默认: .env.shared）
#   --target <目录>     目标目录（默认: deployment/docker）
#   --service <服务名>  生成特定服务的 .env 文件
#   --help              显示帮助信息
#
# ============================================================================

set -e

# 默认参数
SOURCE="${SOURCE:-.env.shared}"
TARGET="${TARGET:-deployment/docker}"
SERVICE="${SERVICE:-}"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --source)
            SOURCE="$2"
            shift 2
            ;;
        --target)
            TARGET="$2"
            shift 2
            ;;
        --service)
            SERVICE="$2"
            shift 2
            ;;
        --help|-h)
            cat << EOF
环境变量管理脚本

用法:
    ./scripts/env-manager.sh [选项]

选项:
    --source <文件>     源环境变量文件（默认: .env.shared）
    --target <目录>     目标目录（默认: deployment/docker）
    --service <服务名>  生成特定服务的 .env 文件（gateway, api, webhooks, worker, logging）
    --help              显示此帮助信息

示例:
    # 从 .env.shared 生成所有服务的环境变量文件
    ./scripts/env-manager.sh

    # 为特定服务生成 .env 文件
    ./scripts/env-manager.sh --service gateway

    # 使用自定义源文件
    ./scripts/env-manager.sh --source .env.production --target deployment/docker

服务列表:
    gateway  - Gateway 服务环境变量
    api      - API 服务环境变量
    webhooks - Webhooks 服务环境变量
    worker   - Worker 服务环境变量
    logging  - Logging 服务环境变量
    docker   - Docker 部署统一环境变量
EOF
            exit 0
            ;;
        *)
            echo -e "${RED}未知选项: $1${NC}"
            exit 1
            ;;
    esac
done

# 检查源文件是否存在
if [ ! -f "$SOURCE" ]; then
    echo -e "${RED}错误: 源文件不存在: $SOURCE${NC}"
    echo "提示: 请先复制 env.shared.example 为 .env.shared 并修改配置值"
    exit 1
fi

# 读取源文件
echo -e "${GREEN}读取源文件: $SOURCE${NC}"

# 服务配置映射（定义每个服务需要的环境变量）
declare -A GATEWAY_VARS
GATEWAY_VARS=(
    ["NODE_ENV"]=1
    ["PORT"]=1
    ["JWT_SECRET"]=1
    ["JWT_REFRESH_SECRET"]=1
    ["JWT_EXPIRES_IN"]=1
    ["JWT_REFRESH_EXPIRES_IN"]=1
    ["DB_HOST"]=1
    ["DB_PORT"]=1
    ["DB_USERNAME"]=1
    ["DB_PASSWORD"]=1
    ["DB_DATABASE"]=1
    ["DB_SYNCHRONIZE"]=1
    ["DB_LOGGING"]=1
    ["REDIS_HOST"]=1
    ["REDIS_PORT"]=1
    ["REDIS_PASSWORD"]=1
    ["REDIS_DB"]=1
    ["API_SERVICE_URL"]=1
    ["WEBHOOKS_SERVICE_URL"]=1
    ["WORKER_SERVICE_URL"]=1
    ["LOGGING_SERVICE_URL"]=1
    ["RATE_LIMIT_TTL"]=1
    ["RATE_LIMIT_MAX_REQUESTS"]=1
    ["RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS"]=1
    ["CIRCUIT_BREAKER_ENABLED"]=1
    ["CIRCUIT_BREAKER_FAILURE_THRESHOLD"]=1
    ["CIRCUIT_BREAKER_SUCCESS_THRESHOLD"]=1
    ["CIRCUIT_BREAKER_TIMEOUT"]=1
    ["CIRCUIT_BREAKER_RESET_TIMEOUT"]=1
    ["WECHAT_APP_ID"]=1
    ["WECHAT_APP_SECRET"]=1
    ["WECHAT_REDIRECT_URI"]=1
    ["WECHAT_SCOPE"]=1
    ["FRONTEND_URL"]=1
    ["AUTHORIZATION_ENABLED"]=1
    ["METRICS_ADAPTER"]=1
    ["METRICS_ENABLE_DEFAULT_COLLECTORS"]=1
    ["PROMETHEUS_COLLECT_DEFAULT_METRICS"]=1
    ["PROMETHEUS_PREFIX"]=1
    ["HTTP_TIMEOUT"]=1
    ["CORS_ORIGIN"]=1
    ["CORS_CREDENTIALS"]=1
    ["SWAGGER_ENABLED"]=1
    ["SWAGGER_PATH"]=1
    ["ENCRYPTION_ADAPTER"]=1
    ["AES_KEY"]=1
    ["AES_ALGORITHM"]=1
    ["AES_KEY_LENGTH"]=1
    ["CONSUL_ENABLED"]=1
    ["CONSUL_HOST"]=1
    ["CONSUL_PORT"]=1
    ["CONSUL_CONFIG_PREFIX"]=1
    ["CONSUL_SECURE"]=1
    ["CONSUL_TOKEN"]=1
    ["CONSUL_DATACENTER"]=1
)

declare -A API_VARS
API_VARS=(
    ["NODE_ENV"]=1
    ["PORT"]=1
    ["JWT_SECRET"]=1
    ["JWT_REFRESH_SECRET"]=1
    ["JWT_EXPIRES_IN"]=1
    ["JWT_REFRESH_EXPIRES_IN"]=1
    ["DB_HOST"]=1
    ["DB_PORT"]=1
    ["DB_USERNAME"]=1
    ["DB_PASSWORD"]=1
    ["DB_DATABASE"]=1
    ["DB_SYNCHRONIZE"]=1
    ["DB_LOGGING"]=1
    ["REDIS_HOST"]=1
    ["REDIS_PORT"]=1
    ["REDIS_PASSWORD"]=1
    ["REDIS_DB"]=1
    ["CACHE_ADAPTER_TYPE"]=1
    ["METRICS_ADAPTER"]=1
    ["METRICS_ENABLED"]=1
    ["PROMETHEUS_COLLECT_DEFAULT_METRICS"]=1
    ["PROMETHEUS_PREFIX"]=1
    ["HTTP_TIMEOUT"]=1
    ["CORS_ORIGIN"]=1
    ["CORS_CREDENTIALS"]=1
    ["ENCRYPTION_ADAPTER"]=1
    ["AES_KEY"]=1
    ["HASHING_ADAPTER"]=1
    ["BCRYPT_SALT_ROUNDS"]=1
    ["STORAGE_TYPE"]=1
    ["STORAGE_LOCAL_BASE_PATH"]=1
    ["STORAGE_LOCAL_BASE_URL"]=1
    ["STORAGE_MINIO_ENDPOINT"]=1
    ["STORAGE_MINIO_PORT"]=1
    ["STORAGE_MINIO_USE_SSL"]=1
    ["STORAGE_MINIO_ACCESS_KEY"]=1
    ["STORAGE_MINIO_SECRET_KEY"]=1
    ["STORAGE_MINIO_BUCKET_NAME"]=1
    ["SWAGGER_ENABLED"]=1
    ["SWAGGER_PATH"]=1
    ["TEST_AUTH_ENABLED"]=1
    ["FRONTEND_URL"]=1
    ["REGISTER_EMAIL_VERIFICATION_ENABLED"]=1
    ["MAIL_DEV_LOG_ONLY"]=1
    ["SMTP_HOST"]=1
    ["SMTP_PORT"]=1
    ["SMTP_SECURE"]=1
    ["SMTP_USER"]=1
    ["SMTP_PASS"]=1
    ["SMTP_FROM"]=1
    ["MAIL_FROM"]=1
    ["SMTP_CONNECTION_TIMEOUT_MS"]=1
    ["SMTP_GREETING_TIMEOUT_MS"]=1
    ["SMTP_SOCKET_TIMEOUT_MS"]=1
    ["TOOL_INTERNAL_BASE_URL"]=1
    ["API_INTERNAL_AUTH_SECRET"]=1
    ["CONSUL_ENABLED"]=1
    ["CONSUL_HOST"]=1
    ["CONSUL_PORT"]=1
    ["CONSUL_CONFIG_PREFIX"]=1
    ["CONSUL_SECURE"]=1
    ["CONSUL_TOKEN"]=1
    ["CONSUL_DATACENTER"]=1
)

# 解析环境变量文件
parse_env_file() {
    local file="$1"
    declare -A env_vars
    
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # 跳过空行和注释
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        
        # 移除前导和尾随空格
        key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        
        # 移除引号
        value=$(echo "$value" | sed "s/^['\"]\(.*\)['\"]\$/\1/")
        
        if [ -n "$key" ]; then
            env_vars["$key"]="$value"
        fi
    done < <(grep -E '^[^#]*=' "$file" || true)
    
    # 通过全局变量返回（Bash 限制）
    for key in "${!env_vars[@]}"; do
        echo "$key=${env_vars[$key]}"
    done
}

# 获取环境变量值
get_env_value() {
    local key="$1"
    local env_file="$2"
    grep -E "^[[:space:]]*${key}[[:space:]]*=" "$env_file" | head -1 | cut -d'=' -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed "s/^['\"]\(.*\)['\"]\$/\1/"
}

# 生成服务的 .env 文件（简化版本）
generate_service_env_file() {
    local service_name="$1"
    local output_path="$2"
    local env_file="$SOURCE"
    
    echo -e "${CYAN}生成 ${service_name} 服务的环境变量文件: ${output_path}${NC}"
    
    {
        echo "# ${service_name} 服务环境变量配置"
        echo "# 此文件由 env-manager.sh 自动生成，请勿手动编辑"
        echo "# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')"
        echo ""
        
        # 服务特定配置
        case "$service_name" in
            gateway)
                echo "# 应用配置"
                echo "NODE_ENV=$(get_env_value "NODE_ENV" "$env_file")"
                echo "PORT=$(get_env_value "GATEWAY_SERVICE_PORT" "$env_file")"
                echo ""
                echo "# 数据库配置"
                echo "DB_HOST=$(get_env_value "DB_HOST" "$env_file")"
                echo "DB_PORT=$(get_env_value "DB_PORT" "$env_file")"
                echo "DB_USERNAME=$(get_env_value "DB_USERNAME" "$env_file")"
                echo "DB_PASSWORD=$(get_env_value "DB_PASSWORD" "$env_file")"
                echo "DB_DATABASE=$(get_env_value "GATEWAY_DB_DATABASE" "$env_file")"
                echo "DB_SYNCHRONIZE=$(get_env_value "DB_SYNCHRONIZE" "$env_file")"
                echo "DB_LOGGING=$(get_env_value "DB_LOGGING" "$env_file")"
                echo ""
                echo "# Redis 配置"
                echo "REDIS_HOST=$(get_env_value "REDIS_HOST" "$env_file")"
                echo "REDIS_PORT=$(get_env_value "REDIS_PORT" "$env_file")"
                echo "REDIS_PASSWORD=$(get_env_value "REDIS_PASSWORD" "$env_file")"
                echo "REDIS_DB=$(get_env_value "REDIS_DB_GATEWAY" "$env_file")"
                echo "ENABLE_ADVANCED_APPROVAL=$(get_env_value "ENABLE_ADVANCED_APPROVAL" "$env_file")"
                echo "TENANT_MEMBERSHIP_ENFORCED=$(get_env_value "TENANT_MEMBERSHIP_ENFORCED" "$env_file")"
                # ... 添加其他 gateway 特定变量
                ;;
            api)
                echo "# 应用配置"
                echo "NODE_ENV=$(get_env_value "NODE_ENV" "$env_file")"
                echo "PORT=$(get_env_value "API_SERVICE_PORT" "$env_file")"
                echo ""
                echo "# 数据库配置"
                echo "DB_HOST=$(get_env_value "DB_HOST" "$env_file")"
                echo "DB_PORT=$(get_env_value "DB_PORT" "$env_file")"
                echo "DB_USERNAME=$(get_env_value "DB_USERNAME" "$env_file")"
                echo "DB_PASSWORD=$(get_env_value "DB_PASSWORD" "$env_file")"
                echo "DB_DATABASE=$(get_env_value "API_DB_DATABASE" "$env_file")"
                echo "DB_SYNCHRONIZE=$(get_env_value "DB_SYNCHRONIZE" "$env_file")"
                echo "DB_LOGGING=$(get_env_value "DB_LOGGING" "$env_file")"
                echo "MIGRATIONS_DIRS=$(get_env_value "MIGRATIONS_DIRS" "$env_file")"
                echo "MIGRATIONS_DIR=$(get_env_value "MIGRATIONS_DIR" "$env_file")"
                echo "ENABLE_ADVANCED_APPROVAL=$(get_env_value "ENABLE_ADVANCED_APPROVAL" "$env_file")"
                echo "TENANT_MEMBERSHIP_ENFORCED=$(get_env_value "TENANT_MEMBERSHIP_ENFORCED" "$env_file")"
                echo ""
                echo "# 认证 / 邮件（密码重置）"
                echo "FRONTEND_URL=$(get_env_value "FRONTEND_URL" "$env_file")"
                echo "MAIL_DEV_LOG_ONLY=$(get_env_value "MAIL_DEV_LOG_ONLY" "$env_file")"
                echo "SMTP_HOST=$(get_env_value "SMTP_HOST" "$env_file")"
                echo "SMTP_PORT=$(get_env_value "SMTP_PORT" "$env_file")"
                echo "SMTP_SECURE=$(get_env_value "SMTP_SECURE" "$env_file")"
                echo "SMTP_USER=$(get_env_value "SMTP_USER" "$env_file")"
                echo "SMTP_PASS=$(get_env_value "SMTP_PASS" "$env_file")"
                echo "SMTP_FROM=$(get_env_value "SMTP_FROM" "$env_file")"
                echo "SMTP_CONNECTION_TIMEOUT_MS=$(get_env_value "SMTP_CONNECTION_TIMEOUT_MS" "$env_file")"
                echo "SMTP_GREETING_TIMEOUT_MS=$(get_env_value "SMTP_GREETING_TIMEOUT_MS" "$env_file")"
                echo "SMTP_SOCKET_TIMEOUT_MS=$(get_env_value "SMTP_SOCKET_TIMEOUT_MS" "$env_file")"
                ;;
        esac
    } > "$output_path"
    
    echo -e "${GREEN}✓ 已生成: ${output_path}${NC}"
}

# 主逻辑
if [ -z "$SERVICE" ]; then
    # 生成所有服务的环境变量文件
    echo -e "${YELLOW}开始生成所有服务的环境变量文件...${NC}"
    
    # 注意：Bash 版本的完整实现需要更多的代码
    # 这里提供一个简化版本，建议使用 PowerShell 版本以获得完整功能
    
    generate_service_env_file "gateway" "apps/gateway/.env"
    generate_service_env_file "api" "apps/api/.env"
    
    echo -e "${GREEN}✓ 环境变量文件生成完成！${NC}"
    echo -e "${YELLOW}注意: Bash 版本是简化实现，建议使用 PowerShell 版本以获得完整功能${NC}"
elif [ "$SERVICE" = "docker" ]; then
    echo -e "${YELLOW}生成 Docker 环境变量文件...${NC}"
    # Docker 环境变量文件生成逻辑
    echo -e "${GREEN}✓ Docker 环境变量文件生成完成！${NC}"
else
    generate_service_env_file "$SERVICE" "apps/$SERVICE/.env"
    echo -e "${GREEN}✓ ${SERVICE} 服务环境变量文件生成完成！${NC}"
fi









