# TenantModule 最终验收报告

## 验收结论

- 结论：通过（TenantModule 范围）
- 模式：全局严格模式（缺失 `companyId` 拒绝 + membership 强制校验）
- 隔离策略：`Shared Schema + CLS + PostgreSQL RLS (FORCE)`

## 验收清单与证据

- Tenant 解析（Header/JWT claim/Query/Subdomain）
  - 证据：`apps/api/src/common/guards/tenant-resolution.strategy.spec.ts`
  - 结果：通过
- TenantGuard 严格校验（缺失 companyId 拒绝、越权拒绝）
  - 证据：`apps/api/src/common/guards/tenant.guard.spec.ts`
  - 结果：通过
- Membership 严格校验（company_memberships + owner fallback）
  - 证据：`apps/api/src/common/guards/tenant.service.spec.ts`
  - 结果：通过
- CLS 及 TypeORM 会话变量注入
  - 证据：`apps/api/src/common/guards/tenant-typeorm-context-bootstrapper.spec.ts`
  - 结果：通过
- RLS 读隔离、跨租户写入阻断
  - 证据：`apps/api/src/common/guards/tenant-rls.integration.spec.ts`
  - 结果：通过
- Gateway HTTP 路径透传 companyId
  - 证据：`apps/gateway/src/modules/routing/proxy.controller.e2e.spec.ts`
  - 结果：通过
- Gateway RPC payload/actor 透传 companyId
  - 证据：`apps/gateway/src/modules/routing/routing.service.spec.ts`
  - 结果：通过
- Worker 事件上下文隔离（runWithCompanyId）
  - 证据：`apps/worker/src/modules/users/listeners/user-created.tenant.spec.ts`
  - 结果：通过
- 缓存隔离（业务缓存）
  - 证据：`apps/api/src/modules/users/users.service.ts` + `users.service.spec.ts`
  - 结果：通过（用户模块）
- 日志/审计租户字段
  - 证据：`apps/gateway/src/common/interceptors/logging.interceptor.ts`、
    `apps/gateway/src/modules/audit/services/audit.service.ts`、
    `apps/gateway/src/modules/audit/entities/audit-log.entity.ts`
  - 结果：通过

## 已执行命令（关键）

- `pnpm --filter @service/api test -- tenant.guard.spec.ts tenant.service.spec.ts tenant-resolution.strategy.spec.ts tenant-typeorm-context-bootstrapper.spec.ts tenant-rls.integration.spec.ts`
- `pnpm --filter @service/gateway test -- routing.service.spec.ts proxy.controller.e2e.spec.ts`
- `pnpm --filter @service/worker test -- user-created.tenant.spec.ts`
- `pnpm --filter @service/gateway build`
- `pnpm --filter @service/worker build`

## 迁移与结构变更

- `infrastructure/postgres/migrations/1767865000000_AddTenantFoundationAndRls.ts`
  - 新建 `companies`、`company_memberships`
  - 启用并强制 RLS
- `infrastructure/postgres/migrations/1767866000000_AddCompanyIdToAuditLogs.ts`
  - `audit_logs` 新增 `company_id` 与索引
- 新增租户基础库：`infrastructure/tenant`

## 风险与后续建议

- 当前“缓存租户前缀”已覆盖业务用户模块；平台级安全缓存（nonce/api_key）为全局键，属于平台域，不参与公司业务数据隔离。
- 下一阶段开发 `Companies/Agents/Memory/Billing` 时，需沿用：
  - 业务缓存统一 `company:${companyId}:...`
  - 事件契约始终携带 `companyId`
  - 新业务表启用 RLS + policy
