# TenantModule 验收说明

## 当前策略（最终）

- 多租户模式：`Shared Schema + company_id + PostgreSQL RLS + NestJS CLS`
- 严格模式全局生效：
  - `TENANT_REQUIRED_BY_DEFAULT` 默认开启（仅当显式设置 `false` 才关闭）
  - `TENANT_MEMBERSHIP_ENFORCED` 默认开启（仅当显式设置 `false` 才关闭）

## 上下文传播

- Gateway：
  - 透传 `x-company-id`
  - RPC payload 附带 `companyId`
- API：
  - `UserContextMiddleware` 读取 `x-company-id` 并写入 `request.companyId`
  - `TenantGuard` 校验 membership 并写入 CLS
- Worker：
  - 监听器从事件读取 `companyId` 并写入 CLS 作用域
  - 并发消息通过 `runWithCompanyId` 保证上下文隔离

## 数据库隔离

- 迁移文件：`infrastructure/postgres/migrations/1767865000000_AddTenantFoundationAndRls.ts`
- 审计增强迁移：`infrastructure/postgres/migrations/1767866000000_AddCompanyIdToAuditLogs.ts`
- 核心表：`companies`、`company_memberships`
- 已启用：`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- Policy 基于：`current_setting('app.current_tenant', true)`

## 验收测试

- 单元测试：
  - `apps/api/src/common/guards/tenant.guard.spec.ts`
  - `apps/api/src/common/guards/tenant.service.spec.ts`
  - `apps/api/src/common/guards/tenant-resolution.strategy.spec.ts`
  - `apps/api/src/common/guards/tenant-typeorm-context-bootstrapper.spec.ts`
  - `apps/gateway/src/modules/routing/routing.service.spec.ts`（RPC payload `companyId`）
  - `apps/worker/src/modules/users/listeners/user-created.tenant.spec.ts`
- 集成测试：
  - `apps/api/src/common/guards/tenant-rls.integration.spec.ts`
- E2E 测试：
  - `apps/gateway/src/modules/routing/proxy.controller.e2e.spec.ts`

## 缓存/日志/审计

- 缓存：
  - 业务缓存（用户模块）统一为 `company:${companyId}:...` 前缀
  - 平台级安全缓存（如 nonce、api_key）保持全局前缀，不参与公司数据隔离
- 日志：
  - Gateway 日志记录统一附带 `companyId`
- 审计：
  - `audit_logs` 增加 `company_id` 字段并建立索引

## 运行建议

- 先确保测试数据库可连接（`TEST_DB_*` 环境变量）
- 再运行：
  - `pnpm --filter @service/api test -- tenant`
  - `pnpm test --filter tenant-rls.integration.spec.ts`（或项目测试命令按需筛选）

## 验收通过判定

- 缺失 companyId 请求被拒绝（严格模式）
- 非本公司用户访问被拒绝（membership）
- RLS 读隔离生效
- RLS 跨租户写入被拒绝
- Gateway HTTP/RPC 路径均透传 `companyId`
- Worker 事件上下文支持 `companyId` 隔离
