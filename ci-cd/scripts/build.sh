#!/bin/bash
# 构建脚本
# 用于构建所有服务的 Docker 镜像

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
REGISTRY="${DOCKER_REGISTRY:-}"
IMAGE_PREFIX="${IMAGE_PREFIX:-service}"
VERSION="${VOCKER_IMAGE_VERSION:-latest}"
BUILD_ARGS="${DOCKER_BUILD_ARGS:-}"

# 服务列表
SERVICES=(
  "api:apps/api"
  "gateway:apps/gateway"
  "logging:apps/logging"
  "webhooks:apps/webhooks"
  "worker:apps/worker"
)

echo -e "${GREEN}🚀 Starting build process...${NC}"
echo "Registry: ${REGISTRY:-<none>}"
echo "Image Prefix: ${IMAGE_PREFIX}"
echo "Version: ${VERSION}"
echo ""

# 构建函数
build_service() {
  local service_name=$1
  local service_path=$2
  local dockerfile_path="${service_path}/Dockerfile"
  
  if [ ! -f "$dockerfile_path" ]; then
    echo -e "${YELLOW}⚠️  Dockerfile not found for ${service_name}, skipping...${NC}"
    return 0
  fi
  
  local image_name="${IMAGE_PREFIX}-${service_name}"
  local full_image_name="${image_name}:${VERSION}"
  
  if [ -n "$REGISTRY" ]; then
    full_image_name="${REGISTRY}/${full_image_name}"
  fi
  
  echo -e "${GREEN}📦 Building ${service_name}...${NC}"
  echo "  Image: ${full_image_name}"
  echo "  Dockerfile: ${dockerfile_path}"
  
  # 构建 Docker 镜像
  docker build \
    -f "$dockerfile_path" \
    -t "$full_image_name" \
    $BUILD_ARGS \
    "$PROJECT_ROOT"
  
  # 如果指定了 latest 标签，也打上 latest 标签
  if [ "$VERSION" != "latest" ]; then
    local latest_image_name="${image_name}:latest"
    if [ -n "$REGISTRY" ]; then
      latest_image_name="${REGISTRY}/${latest_image_name}"
    fi
    docker tag "$full_image_name" "$latest_image_name"
    echo -e "${GREEN}  ✓ Tagged as ${latest_image_name}${NC}"
  fi
  
  echo -e "${GREEN}  ✓ Build completed: ${full_image_name}${NC}"
  echo ""
}

# 构建所有服务
for service_info in "${SERVICES[@]}"; do
  IFS=':' read -r service_name service_path <<< "$service_info"
  build_service "$service_name" "$service_path"
done

echo -e "${GREEN}✅ All builds completed!${NC}"

# 列出构建的镜像
echo ""
echo -e "${GREEN}📋 Built images:${NC}"
docker images | grep "${IMAGE_PREFIX}-" || echo "No images found"






























