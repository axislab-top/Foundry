import { adminAuthedRequestJson } from '../../../../shared/api/client';

type PaginatedResponse<T> = {
  items?: T[];
  total?: number;
};

/** Fetch every page of an admin list endpoint (pageSize capped at 100 server-side). */
export async function fetchAllAdminListPages<T>(
  buildPath: (page: number, pageSize: number) => string,
  pageSize = 100
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let total = Infinity;

  while (items.length < total) {
    const resp = await adminAuthedRequestJson<PaginatedResponse<T>>(buildPath(page, pageSize));
    const batch = resp.items ?? [];
    items.push(...batch);
    total = resp.total ?? items.length;
    if (!batch.length || batch.length < pageSize) break;
    page += 1;
  }

  return items;
}
