# 3. 多租户、账户与公司

## 3.1 多租户与数据隔离

- 请求上下文中解析**公司与租户**信息；API 侧 **TenantGuard**、**TypeORM + Postgres RLS** 在会话级设置租户隔离（具体策略以 `infrastructure/postgres/migrations` 与 `@service/tenant` 实现为准）。
- 网关到 API 的头部约定与中间件解析见 `UserContextMiddleware` 等（`apps/api`）。

## 3.2 用户

- 用户注册、管理员创建、分页列表、按 ID 查询/更新/删除等（`UsersModule`）。
- 与网关配合时，用户信息经头部注入并由 API 中间件填充 `req.user`。

## 3.3 认证与校验

- **Auth**：`POST /api/auth/validate` 等供网关做登录凭证校验（`AuthModule`）。
- **OAuth**：第三方账号绑定、查找或创建用户、列举绑定账号（`OAuthModule`）。

## 3.4 公司（Companies）

- **CompaniesModule**：企业生命周期相关能力——创建、查询、更新、状态变更等；路由经网关转发至 API RPC。
- 用户、登录等事件仍由 Worker 侧监听器处理（审计、后续扩展）。

---

上一篇：[02-gateway-access-and-realtime.md](./02-gateway-access-and-realtime.md)  
下一篇：[04-organization-agents-skills.md](./04-organization-agents-skills.md)
