# Temporal Worker（Foundry M1）

编排 `heartbeatFanoutWorkflow`：按 `TEMPORAL_HEARTBEAT_COMPANY_IDS` 列出的公司，依次调用 Nest Worker `POST /api/internal/temporal/company-heartbeat`。

## 环境变量

| 变量 | 说明 |
|------|------|
| `TEMPORAL_ADDRESS` | 默认 `127.0.0.1:7233` |
| `TEMPORAL_NAMESPACE` | 默认 `default` |
| `TEMPORAL_TASK_QUEUE` | 默认 `foundry-company` |
| `TEMPORAL_HEARTBEAT_COMPANY_IDS` | 逗号分隔 `companyId` |
| `WORKER_INTERNAL_BASE_URL` | 默认 `http://127.0.0.1:3004` |
| `WORKER_INTERNAL_API_SECRET` | 与 Worker `WORKER_INTERNAL_API_SECRET` 一致 |

## 运行

1. 启动 Temporal（见 `deployment/docker/docker-compose.temporal.yml` 或本机 `temporal server start-dev`）。
2. Worker 设置 `TASK_HEARTBEAT_SOURCE=temporal`、`WORKER_INTERNAL_API_SECRET=...`。
3. `pnpm --filter @service/temporal-worker run build && pnpm --filter @service/temporal-worker start`
4. 创建 Schedule：`pnpm --filter @service/temporal-worker run schedule:bootstrap`

## Docker

可与主 compose 合并：`docker compose -f deployment/docker/docker-compose.yml -f deployment/docker/docker-compose.temporal.yml --profile temporal up -d`
