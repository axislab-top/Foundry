# 日志服务 Dockerfile

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

# 安装依赖并构建（先构建依赖模块，再构建 Logging Service）
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @service/config build \
    && pnpm --filter @service/logging build \
    && pnpm --filter @service/logging-service build

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

# 从构建阶段复制应用和日志库的构建产物（覆盖可能存在的旧 dist）
COPY --from=builder /app/apps/logging/dist ./apps/logging/dist
COPY --from=builder /app/infrastructure/logging/dist ./infrastructure/logging/dist
COPY --from=builder /app/infrastructure/config/dist ./infrastructure/config/dist

WORKDIR /app/apps/logging

# 暴露端口
EXPOSE 3001

# 启动服务
CMD ["node", "dist/main.js"]
















