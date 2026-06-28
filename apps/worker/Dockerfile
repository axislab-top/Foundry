# Worker Service Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖解析所需文件，最大化缓存命中
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 安装 pnpm；支持自定义 npm registry，并在网络抖动时自动重试
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN npm config set registry ${NPM_REGISTRY} \
  && npm config set fetch-retries 10 \
  && npm config set fetch-retry-factor 2 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && retry=0; until [ "$retry" -ge 3 ]; do \
       npm install -g pnpm@10.27.0 && break; \
       retry=$((retry + 1)); \
       echo "pnpm install failed, retry ${retry}/3"; \
       sleep 5; \
     done \
  && [ "$retry" -lt 3 ] \
  && pnpm config set fetch-retries 10 \
  && pnpm config set fetch-retry-mintimeout 20000 \
  && pnpm config set fetch-retry-maxtimeout 120000 \
  && pnpm config set store-dir /app/.pnpm-store

# 先预抓取依赖（仅依赖 lockfile，便于后续构建复用缓存）
RUN pnpm fetch --frozen-lockfile

# 再复制完整源码
COPY apps ./apps
COPY packages ./packages
COPY infrastructure ./infrastructure
COPY contracts ./contracts

# 离线安装并构建（... 含全部 workspace 上游依赖，避免热重载后 Dockerfile 漏列新包）
RUN pnpm install --frozen-lockfile --offline --reporter=append-only \
    && pnpm --filter @service/worker... build

# 生产镜像（Debian/glibc：Temporal core-bridge 不兼容 Alpine/musl）
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker ./apps/worker
COPY packages ./packages
COPY infrastructure/ai ./infrastructure/ai
COPY infrastructure/config ./infrastructure/config
COPY infrastructure/logging ./infrastructure/logging
COPY infrastructure/messaging ./infrastructure/messaging
COPY infrastructure/monitoring ./infrastructure/monitoring
COPY infrastructure/tenant ./infrastructure/tenant
COPY contracts ./contracts

# 安装 pnpm，与构建阶段共用同一 store 路径（同样增加 registry 可配置和重试）
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN npm config set registry ${NPM_REGISTRY} \
  && npm config set fetch-retries 10 \
  && npm config set fetch-retry-factor 2 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && retry=0; until [ "$retry" -ge 3 ]; do \
       npm install -g pnpm@10.27.0 && break; \
       retry=$((retry + 1)); \
       echo "pnpm install failed, retry ${retry}/3"; \
       sleep 5; \
     done \
  && [ "$retry" -lt 3 ] \
  && pnpm config set store-dir /app/.pnpm-store

# 从构建阶段复制 pnpm store，离线安装生产依赖（不再访问 registry，避免 DNS 类错误）
COPY --from=builder /app/.pnpm-store ./.pnpm-store
RUN pnpm install --frozen-lockfile --prod --offline

# 从构建阶段复制应用和依赖库的构建产物（覆盖可能存在的旧 dist）
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/infrastructure ./infrastructure

WORKDIR /app/apps/worker

# 暴露端口
EXPOSE 3004

# 启动服务
CMD ["node", "dist/main.js"]















