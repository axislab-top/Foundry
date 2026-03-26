#!/bin/bash
# 停止 Consul 服务脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONSUL_DIR="$(dirname "$SCRIPT_DIR")"

echo "🛑 Stopping Consul service..."

cd "$CONSUL_DIR"

docker-compose down

echo "✅ Consul stopped successfully!"
