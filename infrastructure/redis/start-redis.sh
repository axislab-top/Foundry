#!/bin/bash

# Redis 启动脚本 (Bash)
# 启动 Redis 服务

echo "Starting Redis service..."

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Using default configuration."
    echo "You can copy .env.example to .env and customize it."
fi

# 启动服务
docker-compose up -d

if [ $? -eq 0 ]; then
    echo "Redis service started successfully!"
    echo ""
    echo "To view logs: docker-compose logs -f redis"
    echo "To stop: docker-compose down"
else
    echo "Failed to start Redis service!"
    exit 1
fi












































