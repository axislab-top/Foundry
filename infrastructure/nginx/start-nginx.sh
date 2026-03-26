#!/bin/bash
# Nginx 负载均衡器启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查环境
ENV=${1:-dev}

echo "🚀 Starting Nginx Load Balancer (${ENV} environment)..."

# 检查配置文件
if [ ! -f "nginx.conf" ]; then
    echo "❌ Error: nginx.conf not found!"
    exit 1
fi

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: docker-compose not found!"
    exit 1
fi

# 根据环境启动
case "$ENV" in
    dev|development)
        echo "📦 Starting in development mode..."
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
        ;;
    prod|production)
        echo "📦 Starting in production mode..."
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
        ;;
    *)
        echo "❌ Error: Invalid environment '$ENV'"
        echo "Usage: $0 [dev|prod]"
        exit 1
        ;;
esac

# 等待服务启动
echo "⏳ Waiting for Nginx to start..."
sleep 3

# 检查健康状态
if docker-compose ps | grep -q "Up"; then
    echo "✅ Nginx started successfully!"
    echo ""
    echo "📊 Service status:"
    docker-compose ps
    echo ""
    echo "🔍 Health check:"
    curl -s http://localhost/health || echo "⚠️  Health check endpoint not responding"
    echo ""
    echo "📝 View logs: docker-compose logs -f nginx"
else
    echo "❌ Error: Nginx failed to start"
    docker-compose logs nginx
    exit 1
fi































