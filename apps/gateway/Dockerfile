# Gateway Service Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# 复制工作区和源码（不包含 node_modules），确保所有 workspace 包可用
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infrastructure ./infrastructure
COPY contracts ./contracts
COPY tooling ./tooling

# 安装 pnpm
RUN npm install -g pnpm@10.27.0

# 安装依赖并构建（workspace 包须在镜像内 tsc，避免 tenant 等 dist 缺失）
RUN pnpm install --no-frozen-lockfile \
    && pnpm --filter @service/tenant build \
    && pnpm --filter @service/gateway build

# 生产镜像
FROM node:20-alpine

WORKDIR /app

# 安装构建原生模块所需的系统依赖（用于 bcrypt 等）
RUN apk add --no-cache python3 make g++

# 复制 workspace 结构，使 pnpm 能将内部包作为 workspace 解析
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infrastructure ./infrastructure
COPY contracts ./contracts
COPY tooling ./tooling

# 安装 pnpm
RUN npm install -g pnpm@10.27.0

# 只安装生产依赖
RUN pnpm install --no-frozen-lockfile --prod

# 重新构建 bcrypt 等需要编译的原生模块（如果未安装则忽略错误）
RUN pnpm rebuild bcrypt || true

# 从构建阶段复制应用和日志库的构建产物（覆盖可能存在的旧 dist）
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=builder /app/infrastructure/logging/dist ./infrastructure/logging/dist
COPY --from=builder /app/infrastructure/tenant/dist ./infrastructure/tenant/dist

WORKDIR /app/apps/gateway

# 暴露端口
EXPOSE 3002

# 启动服务
CMD ["node", "dist/main.js"]















