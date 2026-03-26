#!/bin/bash
# 停止日志服务脚本 (Bash)
# 用法: ./stop-logging.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

echo "正在停止日志服务..."

docker-compose -f "$DOCKER_COMPOSE_FILE" --profile loki down

if [ $? -eq 0 ]; then
    echo "日志服务已停止"
else
    echo "停止日志服务时出错"
    exit 1
fi


