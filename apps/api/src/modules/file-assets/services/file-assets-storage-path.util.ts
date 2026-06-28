import { normalizeStorageKey } from '../../files/storage/storage-tenant-path.util.js';

/**
 * file_asset.storage_path 存租户内相对路径（如 memory/files/{assetId}/name）。
 * 对象存储读操作需要 companies/{companyId}/... 或 legacy memory/{companyId}/...。
 */
export function resolveFileAssetStorageKeyForRead(
  companyId: string,
  storagePath: string,
): string {
  const p = normalizeStorageKey(storagePath);
  if (!p) return `companies/${companyId}/`;
  if (p.startsWith(`companies/${companyId}/`)) return p;
  if (p.startsWith(`memory/${companyId}/`)) return p;
  if (p.startsWith('skills/') || p.startsWith('platform/')) return p;
  return `companies/${companyId}/${p}`;
}

/** 写入对象存储时使用的完整键（与 registerFromAgentContent 一致）。 */
export function resolveFileAssetStorageKeyForWrite(
  companyId: string,
  storagePath: string,
): string {
  return resolveFileAssetStorageKeyForRead(companyId, storagePath);
}
