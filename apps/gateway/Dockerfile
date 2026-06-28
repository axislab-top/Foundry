# Gateway Service Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# 使用国内 Alpine 源，避免 apk 安装 g++ 卡死
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
  && apk add --no-cache python3 make g++

# 复制工作区和源码（不包含 node_modules），确保所有 workspace 包可用
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infrastructure ./infrastructure
COPY contracts ./contracts

# 安装 pnpm；store 放在 /app 内便于下一阶段离线安装；提高拉包重试以缓解 DNS/网络抖动
RUN npm install -g pnpm@10.27.0 \
  && pnpm config set fetch-retries 10 \
  && pnpm config set fetch-retry-mintimeout 20000 \
  && pnpm config set fetch-retry-maxtimeout 120000 \
  && pnpm config set store-dir /app/.pnpm-store

# 安装依赖、编译原生模块并构建（... 含全部 workspace 上游依赖）
RUN pnpm install --frozen-lockfile \
  && pnpm rebuild bcrypt \
  && pnpm --filter @service/gateway... build

# 生产镜像
FROM node:20-alpine

WORKDIR /app

# 复制 workspace 结构，使 pnpm 能将内部包作为 workspace 解析
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infrastructure ./infrastructure
COPY contracts ./contracts

# 安装 pnpm，与构建阶段共用同一 store 路径
RUN npm install -g pnpm@10.27.0 \
  && pnpm config set store-dir /app/.pnpm-store

# 从构建阶段复制 pnpm store，离线安装生产依赖（不再访问 registry，避免 DNS 类错误）
COPY --from=builder /app/.pnpm-store ./.pnpm-store
RUN pnpm install --frozen-lockfile --prod --offline

# 从 builder 复制已编译的 bcrypt 原生 binding（避免生产阶段再装 g++）
COPY --from=builder /app/node_modules/.pnpm /tmp/builder-pnpm
RUN set -e; \
  src=$(find /tmp/builder-pnpm -path '*/bcrypt/lib/binding/bcrypt_lib.node' | head -1); \
  dest=$(find node_modules/.pnpm -path '*/bcrypt/lib/binding' -type d | head -1); \
  if [ -n "$src" ] && [ -n "$dest" ]; then cp "$src" "$dest"/; fi; \
  rm -rf /tmp/builder-pnpm

# 从构建阶段复制应用和依赖库的构建产物（覆盖可能存在的旧 dist）
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/infrastructure ./infrastructure

WORKDIR /app/apps/gateway

# 暴露端口
EXPOSE 3002

# 启动服务
CMD ["node", "dist/main.js"]
