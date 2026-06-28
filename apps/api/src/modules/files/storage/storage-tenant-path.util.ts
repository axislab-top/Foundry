import { BadRequestException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

const COMPANIES = 'companies/';

/**
 * Use with StorageService when the resolved object key is a read-only platform path
 * (`skills/*`, `platform/*`); the id is ignored for those keys.
 */
export const PLATFORM_SCOPE_COMPANY_ID =
  '00000000-0000-0000-0000-000000000000';

export function normalizeStorageKey(key: string): string {
  return key.replace(/^\/+/, '').replace(/\\/g, '/');
}

/** Reject path traversal and empty segments after normalize. */
export function assertSafeRelativePath(relativePath: string): void {
  const p = normalizeStorageKey(relativePath);
  if (!p || p === '.' || p === '..') {
    throwPathError('invalid_path');
  }
  const segments = p.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '') {
      throwPathError('path_traversal_or_empty_segment');
    }
  }
}

function throwPathError(code: string): never {
  const msg = `Invalid storage path: ${code}`;
  throw new BadRequestException(msg);
}

export function throwRpcPathError(code: string): never {
  throw new RpcException({ status: 400, message: `Invalid storage path: ${code}` });
}

/**
 * Resolve logical path to object key.
 * - Read: allows legacy `memory/{companyId}/...` or `companies/{companyId}/...`.
 * - Write: only `companies/{companyId}/...` (including `.../memory/...`); rejects legacy memory root for writes.
 */
export function resolveTenantObjectKey(
  companyId: string,
  rawPath: string,
  operation: 'read' | 'write',
): string {
  const p = normalizeStorageKey(rawPath);
  assertSafeRelativePath(p);

  /** 读：商城/平台级历史对象（未挂 companies/ 前缀） */
  if (
    operation === 'read' &&
    (p.startsWith('skills/') || p.startsWith('platform/'))
  ) {
    return p;
  }

  const companiesPrefix = `${COMPANIES}${companyId}/`;
  const memoryLegacy = `memory/${companyId}/`;

  if (p.startsWith(companiesPrefix)) {
    return p;
  }

  if (operation === 'read' && p.startsWith(memoryLegacy)) {
    return p;
  }

  if (operation === 'write') {
    if (p.startsWith('memory/')) {
      throwPathError(
        'writes_must_use_companies_prefix: use companies/{companyId}/memory/...',
      );
    }
    return `${companiesPrefix}${p}`;
  }

  if (p.startsWith('memory/')) {
    throwPathError(
      'ambiguous_memory_path_on_read_use_memory_companyId_or_companies_prefix',
    );
  }

  return `${companiesPrefix}${p}`;
}

/** RPC layer: same as resolveTenantObjectKey but RpcException. */
export function resolveTenantObjectKeyRpc(
  companyId: string,
  rawPath: string,
  operation: 'read' | 'write',
): string {
  try {
    return resolveTenantObjectKey(companyId, rawPath, operation);
  } catch (e) {
    if (e instanceof BadRequestException) {
      throw new RpcException({
        status: 400,
        message: (e as BadRequestException).message,
      });
    }
    throw e;
  }
}

/** List prefix: same rules as read for prefix resolution. */
export function resolveTenantListPrefix(
  companyId: string,
  rawPrefix: string | undefined,
): string | undefined {
  if (rawPrefix === undefined || rawPrefix === '') {
    return `${COMPANIES}${companyId}/`;
  }
  const normalizedInput = normalizeStorageKey(rawPrefix);
  const normalizedPrefix = normalizedInput.replace(/\/+$/, '');
  if (!normalizedPrefix) {
    return `${COMPANIES}${companyId}/`;
  }
  if (normalizedPrefix === `memory/${companyId}`) {
    return `memory/${companyId}/`;
  }
  if (normalizedPrefix === `${COMPANIES}${companyId}`) {
    return `${COMPANIES}${companyId}/`;
  }
  return resolveTenantObjectKey(companyId, normalizedPrefix, 'read');
}

export function resolveTenantListPrefixRpc(
  companyId: string,
  rawPrefix: string | undefined,
): string | undefined {
  try {
    return resolveTenantListPrefix(companyId, rawPrefix);
  } catch (e) {
    if (e instanceof BadRequestException) {
      throw new RpcException({
        status: 400,
        message: (e as BadRequestException).message,
      });
    }
    throw e;
  }
}
