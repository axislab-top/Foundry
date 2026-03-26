#!/bin/bash

# Redis 停止脚本 (Bash)
# 停止 Redis 服务

echo "Stopping Redis service..."

docker-compose down

if [ $? -eq 0 ]; then
    echo "Redis service stopped successfully!"
else
    echo "Failed to stop Redis service!"
    exit 1
fi












































