#!/bin/bash
# Nginx 负载均衡器停止脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🛑 Stopping Nginx Load Balancer..."

docker-compose down

echo "✅ Nginx stopped successfully!"































