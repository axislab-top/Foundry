# Webhooks Service Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# 复制工作区和源码（不包含 node_modules），确保所有 workspace 包可用
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infrastructure ./infrastructure
COPY contracts ./contracts

# 安装 pnpm
RUN npm install -g pnpm@10.27.0

# 安装依赖并构建
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @contracts/types build \
    && pnpm --filter @contracts/events build \
    && pnpm --filter @service/config build \
    && pnpm --filter @service/cache build \
    && pnpm --filter @service/logging build \
    && pnpm --filter @service/monitoring build \
    && pnpm --filter @service/messaging build \
    && pnpm --filter @service/webhooks build

# 生产镜像
FROM node:20-alpine

WORKDIR /app

# 复制 workspace 结构，使 pnpm 能将内部包作为 workspace 解析
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infrastructure ./infrastructure
COPY contracts ./contracts

# 安装 pnpm
RUN npm install -g pnpm@10.27.0

# 只安装生产依赖
RUN pnpm install --frozen-lockfile --prod

# 从构建阶段复制应用和依赖库的构建产物（覆盖可能存在的旧 dist）
COPY --from=builder /app/apps/webhooks/dist ./apps/webhooks/dist
COPY --from=builder /app/contracts/types/dist ./contracts/types/dist
COPY --from=builder /app/contracts/events/dist ./contracts/events/dist
COPY --from=builder /app/infrastructure/config/dist ./infrastructure/config/dist
COPY --from=builder /app/infrastructure/cache/dist ./infrastructure/cache/dist
COPY --from=builder /app/infrastructure/logging/dist ./infrastructure/logging/dist
COPY --from=builder /app/infrastructure/monitoring/dist ./infrastructure/monitoring/dist
COPY --from=builder /app/infrastructure/messaging/dist ./infrastructure/messaging/dist

WORKDIR /app/apps/webhooks

# 暴露端口
EXPOSE 3003

# 启动服务
CMD ["node", "dist/main.js"]















