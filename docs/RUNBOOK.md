# Foundry 项目运行手册

> 本地开发参考文档，最后更新：2026-06-24

---

## 环境要求

| 工具 | 版本要求 | 当前版本 |
|------|----------|----------|
| Node.js | >= 20 | v20.16.0 ✅ |
| pnpm | >= 10 | 10.28.0 ✅ |
| Docker | >= 29 | 29.2.1 ✅ |

### 内存要求

| 阶段 | 内存占用 | 说明 |
|------|----------|------|
| 安装依赖 (`pnpm install`) | **低** (~500MB) | 下载包到 node_modules，安全 |
| 构建项目 (`pnpm build`) | **中** (~2-3GB) | 编译 TypeScript |
| 启动服务 (`pnpm dev`) | **高** (~8-10GB) | 运行 4 个 Node.js 服务 |

---

## 启动步骤

### 第一步：安装依赖

```bash
cd D:\Foundry
pnpm install
```

**内存占用：低，安全执行**

- 下载并安装所有 npm 包到 `node_modules` 目录
- 磁盘占用约 1-2GB，内存占用约 500MB
- 预计时间：3-5 分钟

### 第二步：启动基础设施

```bash
pnpm infra:start
```

**启动的服务：**

| 服务 | 端口 | 说明 |
|------|------|------|
| PostgreSQL | 5432 | 主数据库 |
| Redis | 6379 | 缓存 |
| RabbitMQ | 5672 | 消息队列 |
| RabbitMQ 管理界面 | 15672 | 用户名/密码: admin/admin123 |
| Grafana | 3000 | 日志可视化（Docker内） |

**验证启动成功：**
```bash
pnpm infra:status
```

### 第三步：数据库迁移

```bash
pnpm migrate:run
```

### 第四步：启动应用服务

```bash
pnpm dev
```

**启动的服务：**

| 服务 | 端口 |
|------|------|
| API Service | http://localhost:3000 |
| Gateway Service | http://localhost:3002 |
| Webhooks Service | http://localhost:3003 |
| Worker Service | http://localhost:3004 |

---

## 一键启动（推荐）

```bash
# 启动基础设施 + 等待 10 秒 + 启动开发模式
pnpm start:dev:local
```

---

## 常用命令

### 基础设施管理

```bash
pnpm infra:start      # 启动
pnpm infra:stop       # 停止
pnpm infra:restart    # 重启
pnpm infra:status     # 查看状态
pnpm infra:logs       # 查看日志
```

### 应用开发

```bash
pnpm dev              # 开发模式（热重载）
pnpm build            # 构建项目
pnpm start            # 启动生产模式
pnpm test             # 运行测试
pnpm lint             # 代码检查
```

### 数据库迁移

```bash
pnpm migrate:run      # 执行迁移
pnpm migrate:revert   # 回滚迁移
pnpm migrate:show     # 查看迁移状态
```

---

## 内存不足时的解决方案

### 方案 1：分步启动（推荐）

```bash
# 只启动基础设施
pnpm infra:start

# 只启动核心服务（不启动所有）
pnpm --filter @service/api dev
pnpm --filter @service/worker dev
```

### 方案 2：关闭其他程序

- 关闭浏览器多余标签页
- 关闭不必要的 IDE 窗口
- 结束其他 Node.js 进程

### 方案 3：增加虚拟内存

1. 右键"此电脑" → 属性 → 高级系统设置
2. 性能 → 设置 → 高级 → 虚拟内存
3. 设置为 16GB-32GB

---

## 环境变量配置

主要配置文件：`.env.shared`

关键配置项：
- `NODE_ENV` - 运行环境 (development/production)
- `DB_*` - 数据库配置
- `REDIS_*` - Redis 配置
- `RABBITMQ_*` - RabbitMQ 配置
- `JWT_*` - JWT 认证配置
- `LLM_*` - LLM API 配置

---

## 常见问题

### Q: pnpm install 失败
```bash
pnpm store prune
pnpm install
```

### Q: Docker 容器启动失败
```bash
# 检查 Docker Desktop 是否运行
# 重启 Docker Desktop 后重试
pnpm infra:start
```

### Q: 端口被占用
```bash
# Windows 查看端口占用
netstat -ano | findstr :5432

# 结束进程
taskkill /PID <进程ID> /F
```

### Q: 数据库连接失败
```bash
# 检查 PostgreSQL 是否运行
docker ps | grep postgres

# 检查配置
cat .env.shared | grep DB_
```

### Q: 内存不足导致服务崩溃
```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm dev
```

---

## 项目结构概览

```
D:\Foundry
├── apps/
│   ├── api/          # API 服务 (端口 3000)
│   ├── gateway/      # Gateway 服务 (端口 3002)
│   ├── worker/       # Worker 服务 (端口 3004)
│   └── webhooks/     # Webhooks 服务 (端口 3003)
├── client/           # 前端 React 应用
├── packages/         # 共享包
├── infrastructure/   # 基础设施配置
├── deployment/       # 部署配置
└── docs/             # 文档
```

---

## 开发调试

### 查看服务日志

```bash
# 基础设施日志
pnpm infra:logs

# 特定服务日志
docker logs service-postgres
docker logs service-redis
docker logs service-rabbitmq
```

### 数据库管理

```bash
# 连接 PostgreSQL
psql -h localhost -U postgres -d service_db

# 连接 Redis
redis-cli

# RabbitMQ 管理界面
# 访问 http://localhost:15672
# 用户名: admin, 密码: admin123
```

---

## 部署相关

### 生产环境启动

```bash
pnpm infra:prod:start
pnpm build
pnpm start
```

### 仅部署前端

```bash
python scripts/cloud-deploy/deploy-frontend-only.py
```

---

> 💡 提示：遇到问题时，先检查 `pnpm infra:status` 确认基础设施是否正常
