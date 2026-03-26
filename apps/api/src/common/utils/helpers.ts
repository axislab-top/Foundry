/**
 * 工具函数
 */

/**
 * 生成缓存键
 */
export function generateCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * 解析分页参数
 */
export function parsePaginationParams(
  page?: string | number,
  limit?: string | number,
  maxLimit: number = 100,
): PaginationParams {
  const pageNum = Math.max(1, parseInt(String(page || 1), 10));
  const limitNum = Math.min(
    maxLimit,
    Math.max(1, parseInt(String(limit || 20), 10)),
  );

  return {
    page: pageNum,
    limit: limitNum,
  };
}

/**
 * 计算分页偏移量
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}






































