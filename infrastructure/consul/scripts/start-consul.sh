#!/bin/bash
# 启动 Consul 服务脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONSUL_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Starting Consul service..."

cd "$CONSUL_DIR"

# 检查 .env 文件
if [ ! -f .env ]; then
  echo "⚠️  .env file not found, copying from env.example..."
  cp env.example .env
  echo "✅ Created .env file, please review and update if needed"
fi

# 根据环境变量选择配置文件
ENV=${NODE_ENV:-development}

case "$ENV" in
  production)
    echo "📦 Starting Consul in PRODUCTION mode..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    ;;
  test)
    echo "🧪 Starting Consul in TEST mode..."
    docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d
    ;;
  *)
    echo "🔧 Starting Consul in DEVELOPMENT mode..."
    docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    ;;
esac

echo "⏳ Waiting for Consul to be healthy..."
sleep 5

# 检查 Consul 健康状态
if docker-compose ps consul | grep -q "Up"; then
  echo "✅ Consul started successfully!"
  echo "🌐 Consul UI: http://localhost:8500"
  echo "📊 Check status: docker-compose ps consul"
  echo "📝 View logs: docker-compose logs -f consul"
else
  echo "❌ Consul failed to start. Check logs: docker-compose logs consul"
  exit 1
fi
