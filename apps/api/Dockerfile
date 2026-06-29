# API Service Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# 为构建原生模块（如可选依赖 argon2）安装依赖
RUN apk add --no-cache python3 make g++ linux-headers

# 生成 pnpm 安装时需要的 .npmrc，为原生模块开启 unsafe 权限
RUN printf "python=/usr/bin/python3\npython3=/usr/bin/python3\n" > /root/.npmrc \
  && printf "build_from_source=true\nunsafe-perm=true\n" >> /root/.npmrc

# 确保原生依赖可以从源码编译（如果存在）
ENV npm_config_build_from_source=true \
    npm_config_unsafe_perm=true \
    npm_config_user=root

# 确保 node-gyp 能找到 python
RUN ln -sf python3 /usr/bin/python
ENV PYTHON=/usr/bin/python3 npm_config_python=/usr/bin/python3

# 复制工作区和源码（不包含 node_modules），确保所有 workspace 包可用
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infrastructure ./infrastructure
COPY contracts ./contracts

# 安装 pnpm
RUN npm install -g pnpm@10.27.0

# 安装依赖并构建（先清理旧构建，再构建依赖模块，最后构建 API）
RUN pnpm install --frozen-lockfile \
    && rm -rf infrastructure/config/dist infrastructure/config/build \
    && pnpm --filter @contracts/types build \
    && pnpm --filter @contracts/events build \
    && pnpm --filter @service/config build \
    && pnpm --filter @service/cache build \
    && pnpm --filter @service/logging build \
    && pnpm --filter @service/monitoring build \
    && pnpm --filter @service/security build \
    && pnpm --filter @service/messaging build \
    && pnpm --filter @service/tenant build \
    && pnpm --filter @service/ai build \
    && pnpm --filter @foundry/contracts build \
    && pnpm --filter @foundry/skill-md build \
    && pnpm --filter @foundry/collaboration-core build \
    && pnpm --filter @foundry/task-core build \
    && pnpm --filter @foundry/supervisor-core build \
    && pnpm --filter @foundry/multi-agent-core build \
    && pnpm --filter @foundry/observability-core build \
    && pnpm --filter @foundry/skills build \
    && pnpm --filter @service/api build

# 生产镜像
FROM node:20-alpine

WORKDIR /app

# 为运行时可能需要的原生模块安装依赖
RUN apk add --no-cache python3 make g++ linux-headers libc6-compat

# 同步 .npmrc 到运行时镜像
COPY --from=builder /root/.npmrc /root/.npmrc

# 确保原生依赖可以从源码编译（如果存在）
ENV npm_config_build_from_source=true \
    npm_config_unsafe_perm=true \
    npm_config_user=root

# 确保 node-gyp 能找到 python
RUN ln -sf python3 /usr/bin/python
ENV PYTHON=/usr/bin/python3 npm_config_python=/usr/bin/python3

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
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/contracts/types/dist ./contracts/types/dist
COPY --from=builder /app/contracts/events/dist ./contracts/events/dist
COPY --from=builder /app/infrastructure/config/dist ./infrastructure/config/dist
COPY --from=builder /app/infrastructure/cache/dist ./infrastructure/cache/dist
COPY --from=builder /app/infrastructure/logging/dist ./infrastructure/logging/dist
COPY --from=builder /app/infrastructure/monitoring/dist ./infrastructure/monitoring/dist
COPY --from=builder /app/infrastructure/security/dist ./infrastructure/security/dist
COPY --from=builder /app/infrastructure/messaging/dist ./infrastructure/messaging/dist
COPY --from=builder /app/infrastructure/tenant/dist ./infrastructure/tenant/dist
COPY --from=builder /app/infrastructure/ai/dist ./infrastructure/ai/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/core/collaboration/dist ./packages/core/collaboration/dist
COPY --from=builder /app/packages/core/task/dist ./packages/core/task/dist
COPY --from=builder /app/packages/core/supervisor/dist ./packages/core/supervisor/dist
COPY --from=builder /app/packages/core/multi-agent/dist ./packages/core/multi-agent/dist
COPY --from=builder /app/packages/core/observability/dist ./packages/core/observability/dist
COPY --from=builder /app/packages/skill-md/dist ./packages/skill-md/dist
COPY --from=builder /app/packages/skills/dist ./packages/skills/dist

WORKDIR /app/apps/api

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "dist/main.js"]















