#!/bin/bash
# 启动日志服务脚本 (Bash)
# 用法: ./start-logging.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

echo "正在启动日志服务..."

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "错误: Docker 未运行，请先启动 Docker"
    exit 1
fi

# 检查环境变量文件
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "警告: 未找到 .env 文件，使用默认配置"
    echo "提示: 可以复制 env.example 到 .env 来自定义配置"
fi

# 创建日志目录
LOG_DIR="$SCRIPT_DIR/logs"
if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR"
    echo "已创建日志目录: $LOG_DIR"
fi

# 启动服务
echo "正在启动 Loki、Promtail 和 Grafana..."
docker-compose -f "$DOCKER_COMPOSE_FILE" --profile loki up -d

if [ $? -eq 0 ]; then
    echo ""
    echo "日志服务启动成功！"
    echo ""
    echo "服务访问地址:"
    echo "  - Loki API: http://localhost:3100"
    echo "  - Promtail: http://localhost:9080"
    echo "  - Grafana:  http://localhost:3000"
    echo ""
    echo "Grafana 默认登录信息:"
    echo "  用户名: admin"
    echo "  密码:   admin"
    echo ""
    echo "提示: 首次登录后请修改默认密码"
else
    echo ""
    echo "日志服务启动失败！"
    exit 1
fi


