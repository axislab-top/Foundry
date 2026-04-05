# 2. 网关、访问控制与实时协作

## 2.1 统一入口与路由

- **ProxyController** 捕获 HTTP 请求，交由 **RoutingService**：优先匹配 **DynamicRoutesService**（数据库动态路由 + 缓存），否则回退静态路由配置。
- 按路由 `service` 代理到 **api**、**webhooks** 或 **worker**；支持 **rewritePath**、**RPC pattern 白名单**、租户相关请求头透传（如 `x-user-info`、`x-company-id`）。
- 领域 REST/RPC 路径在 `apps/gateway/src/modules/routing/config/` 下按域拆分（companies、organization、agents、skills、memory、collaboration、tasks、billing、templates、marketplace 等）。

## 2.2 终端用户认证（网关）

- 注册、登录、刷新、登出；微信 OAuth 授权与回调等（具体路由以 `apps/gateway` 内 `AuthModule` 为准）。
- 全局 **JwtAuthGuard**；部分路由使用限流等守卫。

## 2.3 安全中间件（条件生效）

以下中间件在网关中实现并挂载；为兼容纯 JWT 调用，对**未携带对应 Header** 的请求通常**跳过**校验（详见 [`architecture/overview.md`](../architecture/overview.md)）：

- **SignatureMiddleware**：HMAC 签名校验（与 API Key 权限映射相关）。
- **ReplayAttackMiddleware**：时间戳 + nonce 防重放。
- **CsrfProtectionMiddleware**：可按配置启用，且多在携带 `x-csrf-token` 时校验。
- **IpFilterMiddleware**：与 `admin/ip-filter` 管理的黑白名单配合。

## 2.4 治理与观测（网关）

- **管理 API**：动态路由 CRUD、路由缓存刷新、API Key 管理、IP 规则、审计日志查询等。
- **指标**：如 `GET /api/metrics`（Prometheus 文本格式）。
- **审计**：Audit 拦截器尽力写入审计记录（含公司维度扩展，以迁移与实体为准）。

## 2.5 实时协作（WebSocket）

- **Socket.IO** 命名空间 **`/collaboration`**：JWT 鉴权后与下游 API/RPC 协同；房间通知等可由消息侧订阅者推送（详见 [`collaboration-websocket-contract.md`](../collaboration-websocket-contract.md)）。

---

上一篇：[01-overview-and-services.md](./01-overview-and-services.md)  
下一篇：[03-tenant-account-companies.md](./03-tenant-account-companies.md)
