#!/bin/bash
# 部署脚本
# 用于部署服务到不同环境

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 配置
ENVIRONMENT="${ENVIRONMENT:-development}"  # development, test, production
REGISTRY="${DOCKER_REGISTRY:-}"
IMAGE_PREFIX="${IMAGE_PREFIX:-service}"
VERSION="${DOCKER_IMAGE_VERSION:-latest}"
DEPLOY_METHOD="${DEPLOY_METHOD:-docker-compose}"  # docker-compose, kubernetes

echo -e "${GREEN}🚀 Starting deployment...${NC}"
echo "Environment: ${ENVIRONMENT}"
echo "Registry: ${REGISTRY:-<none>}"
echo "Version: ${VERSION}"
echo "Deploy Method: ${DEPLOY_METHOD}"
echo ""

# 验证环境
if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${YELLOW}⚠️  Production deployment requires confirmation${NC}"
    read -p "Are you sure you want to deploy to production? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

# Docker Compose 部署
deploy_docker_compose() {
    echo -e "${GREEN}🐳 Deploying with Docker Compose...${NC}"
    
    local compose_file="deployment/docker/docker-compose.yml"
    local env_compose_file="deployment/docker/docker-compose.${ENVIRONMENT}.yml"
    
    if [ ! -f "$compose_file" ]; then
        echo -e "${RED}❌ Docker Compose file not found: $compose_file${NC}"
        exit 1
    fi
    
    # 拉取最新镜像（如果使用 registry）
    if [ -n "$REGISTRY" ]; then
        echo -e "${GREEN}📥 Pulling latest images...${NC}"
        docker-compose -f "$compose_file" -f "$env_compose_file" pull || true
    fi
    
    # 启动服务
    echo -e "${GREEN}🚀 Starting services...${NC}"
    docker-compose -f "$compose_file" -f "$env_compose_file" up -d
    
    # 等待服务健康
    echo -e "${GREEN}⏳ Waiting for services to be healthy...${NC}"
    sleep 10
    
    # 检查服务状态
    echo -e "${GREEN}📊 Service status:${NC}"
    docker-compose -f "$compose_file" -f "$env_compose_file" ps
    
    echo -e "${GREEN}✅ Deployment completed!${NC}"
}

# Kubernetes 部署
deploy_kubernetes() {
    echo -e "${GREEN}☸️  Deploying with Kubernetes...${NC}"
    
    local k8s_dir="deployment/kubernetes/${ENVIRONMENT}"
    
    if [ ! -d "$k8s_dir" ]; then
        echo -e "${RED}❌ Kubernetes config directory not found: $k8s_dir${NC}"
        exit 1
    fi
    
    # 应用配置
    kubectl apply -f "$k8s_dir" || {
        echo -e "${RED}❌ Kubernetes deployment failed${NC}"
        exit 1
    }
    
    # 等待部署完成
    echo -e "${GREEN}⏳ Waiting for deployment to complete...${NC}"
    kubectl rollout status deployment/service-api -n default || true
    kubectl rollout status deployment/service-gateway -n default || true
    
    echo -e "${GREEN}✅ Kubernetes deployment completed!${NC}"
}

# 运行部署
case "$DEPLOY_METHOD" in
    docker-compose)
        deploy_docker_compose
        ;;
    kubernetes|k8s)
        deploy_kubernetes
        ;;
    *)
        echo -e "${RED}❌ Unknown deploy method: ${DEPLOY_METHOD}${NC}"
        exit 1
        ;;
esac






























