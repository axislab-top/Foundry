import { adminAuthedRequestJson } from '../../shared/api/client';
import type {
  CreatePlatformUserPayload,
  ListPlatformUsersFilters,
  ListPlatformUsersResult,
  PlatformUser,
  UpdatePlatformUserPayload,
  UserAdminContext,
  UserMembershipsResult,
} from './types';

const BASE_PATH = '/api/v1/users';

function mapApiError(message: string): string {
  if (message.includes('邮箱已存在')) return '邮箱已存在';
  if (message.includes('用户名已存在')) return '用户名已存在';
  if (message.includes('Insufficient permissions') || message.includes('Forbidden')) {
    return '无用户管理权限';
  }
  if (message.includes('RECORD_NOT_FOUND') || message.includes('用户不存在')) {
    return '用户不存在';
  }
  return message;
}

function wrapError(e: unknown): Error {
  if (e instanceof Error) {
    return new Error(mapApiError(e.message));
  }
  return new Error('请求失败');
}

function buildQuery(filters: ListPlatformUsersFilters): string {
  const query = new URLSearchParams();
  if (filters.page != null) query.set('page', String(filters.page));
  if (filters.pageSize != null) query.set('pageSize', String(filters.pageSize));
  if (filters.sortBy) query.set('sortBy', filters.sortBy);
  if (filters.sortOrder) query.set('sortOrder', filters.sortOrder);
  if (filters.search?.trim()) query.set('search', filters.search.trim());
  if (filters.enabled !== undefined) query.set('enabled', String(filters.enabled));
  if (filters.deleted) query.set('deleted', filters.deleted);
  if (filters.includeStats) query.set('includeStats', 'true');
  const suffix = query.toString();
  return suffix ? `${BASE_PATH}?${suffix}` : BASE_PATH;
}

export async function listPlatformUsers(
  filters: ListPlatformUsersFilters = {},
): Promise<ListPlatformUsersResult> {
  try {
    const result = await adminAuthedRequestJson<ListPlatformUsersResult>(buildQuery(filters));
    return {
      items: result.items ?? [],
      total: result.total ?? 0,
      page: result.page ?? filters.page ?? 1,
      pageSize: result.pageSize ?? filters.pageSize ?? 20,
      totalPages: result.totalPages ?? 1,
    };
  } catch (e) {
    throw wrapError(e);
  }
}

export async function getPlatformUser(id: string): Promise<PlatformUser> {
  try {
    return await adminAuthedRequestJson<PlatformUser>(`${BASE_PATH}/${id}`);
  } catch (e) {
    throw wrapError(e);
  }
}

export async function getUserAdminContext(userId: string): Promise<UserAdminContext> {
  try {
    return await adminAuthedRequestJson<UserAdminContext>(
      `${BASE_PATH}/${encodeURIComponent(userId)}/context`,
    );
  } catch (e) {
    throw wrapError(e);
  }
}

export async function getUserMemberships(userId: string): Promise<UserMembershipsResult> {
  try {
    return await adminAuthedRequestJson<UserMembershipsResult>(
      `${BASE_PATH}/${encodeURIComponent(userId)}/memberships`,
    );
  } catch (e) {
    throw wrapError(e);
  }
}

export async function createPlatformUser(
  payload: CreatePlatformUserPayload,
): Promise<PlatformUser> {
  try {
    return await adminAuthedRequestJson<PlatformUser>(BASE_PATH, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw wrapError(e);
  }
}

export async function updatePlatformUser(
  id: string,
  payload: UpdatePlatformUserPayload,
): Promise<PlatformUser> {
  try {
    return await adminAuthedRequestJson<PlatformUser>(`${BASE_PATH}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw wrapError(e);
  }
}

export async function deletePlatformUser(id: string): Promise<void> {
  try {
    await adminAuthedRequestJson<null>(`${BASE_PATH}/${id}`, { method: 'DELETE' });
  } catch (e) {
    throw wrapError(e);
  }
}

export async function listAllPlatformUsersForExport(
  filters: Omit<ListPlatformUsersFilters, 'page' | 'pageSize'>,
): Promise<PlatformUser[]> {
  const pageSize = 100;
  const items: PlatformUser[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await listPlatformUsers({ ...filters, page, pageSize, includeStats: true });
    items.push(...result.items);
    totalPages = result.totalPages || Math.max(1, Math.ceil(result.total / pageSize));
    page += 1;
  } while (page <= totalPages);

  return items;
}
