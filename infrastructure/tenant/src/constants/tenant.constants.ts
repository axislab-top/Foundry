export const TENANT_CLS_COMPANY_ID = 'tenant.companyId';

export const TENANT_HEADER_COMPANY_ID = 'x-company-id';

export const TENANT_QUERY_COMPANY_ID = 'companyId';

export const TENANT_REQUIRED_METADATA_KEY = 'tenantRequired';

/** 与常见 `Public()` / `SetMetadata('isPublic', true)` 对齐；公开路由不强制解析 Company ID */
export const IS_PUBLIC_METADATA_KEY = 'isPublic';

/**
 * PostgreSQL 不接受 `SET LOCAL ... = $1` / `SET ... = $1` 作为预处理语句占位符（会报 syntax error at or near "$1"）。
 * 使用 set_config 绑定参数；第三个参数 true = 仅当前事务（等同 SET LOCAL）。
 */
export const SQL_SET_LOCAL_CURRENT_TENANT = `SELECT set_config('app.current_tenant', $1::text, true)`;

/** 会话级 GUC（等同 SET，非 LOCAL），用于连接建立后整段会话默认租户等场景 */
export const SQL_SET_SESSION_CURRENT_TENANT = `SELECT set_config('app.current_tenant', $1::text, false)`;

/**
 * 事务内：仅用于「按成员关系列出当前用户可见公司」；与迁移中的 RLS OR 分支配合。
 * true = SET LOCAL，随事务结束自动恢复。
 */
export const SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER = `SELECT set_config('app.membership_listing_user', $1::text, true)`;
