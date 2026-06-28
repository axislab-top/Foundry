#!/usr/bin/env bash
# 清理云服务器冗余文件（保留所有 foundry/* 镜像）
set -euo pipefail

FOUNDRY_ROOT="${FOUNDRY_ROOT:-/opt/foundry}"
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
fi

echo "==> Disk before"
df -h /

# 镜像已 docker load 后，tar 包可删（约 11GB）
if [[ -f "$FOUNDRY_ROOT/images/foundry-images.tar" ]]; then
  echo "==> Remove foundry-images.tar"
  rm -f "$FOUNDRY_ROOT/images/foundry-images.tar"
fi

# 只清理悬空镜像，不删 foundry/* 命名镜像
echo "==> Prune dangling images only"
"${DOCKER[@]}" image prune -f

echo "==> foundry images kept"
"${DOCKER[@]}" images foundry/* 2>/dev/null || true

echo "==> Disk after"
df -h /
