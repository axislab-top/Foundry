# Build from repository root (requires full workspace for workspace:* deps):
#   docker build -f apps/runner/Dockerfile .
FROM node:20-bookworm AS build
WORKDIR /repo
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infrastructure ./infrastructure
COPY contracts ./contracts
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @service/runner run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/runner/dist ./dist
COPY --from=build /repo/apps/runner/package.json ./
COPY --from=build /repo/node_modules ./node_modules
EXPOSE 3010
CMD ["node", "dist/main.js"]
