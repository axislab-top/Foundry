#!/usr/bin/env bash
# 腾讯云服务器 — 重建/导入镜像前清理 Docker 构建残留（不删数据卷）
# 用法:
#   ./scripts/cloud-deploy/cleanup-server-before-rebuild.sh           # 通用清理
#   ./scripts/cloud-deploy/cleanup-server-before-rebuild.sh gateway   # 重建前额外删除旧 gateway 镜像
set -eu

FOUNDRY_ROOT="${FOUNDRY_ROOT:-/opt/foundry}"
TARGET="${1:-}"

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
fi

echo "==> Disk before cleanup"
df -h / | tail -1
"${DOCKER[@]}" system df 2>/dev/null || true

echo ""
echo "==> Truncate large container logs (>10MB)"
find /var/lib/docker/containers -name '*-json.log' -size +10M 2>/dev/null | while read -r f; do
  echo "  truncate $f"
  truncate -s 0 "$f" 2>/dev/null || sudo truncate -s 0 "$f"
done

echo ""
echo "==> Remove stale image tarballs"
rm -f /tmp/foundry-*.tar /tmp/gateway-flat.tar /tmp/gateway.tar 2>/dev/null || true
rm -f "$FOUNDRY_ROOT/images/"*.tar 2>/dev/null || true
find /tmp -maxdepth 1 -name '*.tar' -size +100M -print -delete 2>/dev/null || true

echo ""
echo "==> Docker build cache & dangling layers"
"${DOCKER[@]}" builder prune -a -f 2>/dev/null || true
"${DOCKER[@]}" buildx prune -a -f 2>/dev/null || true
"${DOCKER[@]}" image prune -f 2>/dev/null || true

echo ""
echo "==> Remove <none> dangling images"
"${DOCKER[@]}" images -f "dangling=true" -q 2>/dev/null | sort -u | while read -r id; do
  [ -z "$id" ] && continue
  echo "  rmi dangling $id"
  "${DOCKER[@]}" rmi "$id" 2>/dev/null || true
done

if [ -n "$TARGET" ]; then
  case "$TARGET" in
    gateway|api|worker|webhooks|nginx)
      IMG="foundry/${TARGET}:latest"
      echo ""
      echo "==> Pre-rebuild: stop & remove old image $IMG (keep volumes)"
      cd "$FOUNDRY_ROOT"
      sudo docker compose -f deployment/cloud/tencent-lighthouse/compose.standalone.yml \
        stop "${TARGET}-service" 2>/dev/null || \
      sudo docker compose -f deployment/cloud/tencent-lighthouse/compose.standalone.yml \
        stop "$TARGET" 2>/dev/null || true
      "${DOCKER[@]}" rmi -f "$IMG" 2>/dev/null || true
      ;;
    *)
      echo "WARN: unknown target '$TARGET', skip image removal"
      ;;
  esac
fi

echo ""
echo "==> Prune stopped containers & unused networks (NOT volumes)"
"${DOCKER[@]}" container prune -f 2>/dev/null || true
"${DOCKER[@]}" network prune -f 2>/dev/null || true

echo ""
echo "==> Apt / journal cache"
sudo apt-get clean -y 2>/dev/null || true
sudo journalctl --vacuum-size=50M 2>/dev/null || true

echo ""
echo "==> Disk after cleanup"
df -h / | tail -1
"${DOCKER[@]}" system df 2>/dev/null || true
echo "Done."
