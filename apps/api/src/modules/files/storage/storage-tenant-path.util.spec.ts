import {
  resolveTenantObjectKey,
  resolveTenantListPrefix,
  normalizeStorageKey,
} from './storage-tenant-path.util.js';

describe('storage-tenant-path.util', () => {
  const cid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('normalizeStorageKey strips leading slashes', () => {
    expect(normalizeStorageKey('/x/y')).toBe('x/y');
  });

  it('write maps bare path under companies', () => {
    expect(resolveTenantObjectKey(cid, 'uploads/a.txt', 'write')).toBe(
      `companies/${cid}/uploads/a.txt`,
    );
  });

  it('write rejects legacy memory root', () => {
    expect(() =>
      resolveTenantObjectKey(cid, `memory/${cid}/x`, 'write'),
    ).toThrow();
  });

  it('read allows legacy memory path', () => {
    expect(resolveTenantObjectKey(cid, `memory/${cid}/x`, 'read')).toBe(
      `memory/${cid}/x`,
    );
  });

  it('read allows new memory path', () => {
    expect(
      resolveTenantObjectKey(cid, `companies/${cid}/memory/x`, 'read'),
    ).toBe(`companies/${cid}/memory/x`);
  });

  it('read passes through legacy platform skills/ key', () => {
    expect(resolveTenantObjectKey(cid, 'skills/global/a.zip', 'read')).toBe(
      'skills/global/a.zip',
    );
  });

  it('write maps skills/ relative path under tenant companies prefix', () => {
    expect(resolveTenantObjectKey(cid, 'skills/a.zip', 'write')).toBe(
      `companies/${cid}/skills/a.zip`,
    );
  });

  it('rejects path traversal', () => {
    expect(() => resolveTenantObjectKey(cid, '../x', 'write')).toThrow();
  });

  it('list prefix allows trailing slash for legacy memory path', () => {
    expect(resolveTenantListPrefix(cid, `memory/${cid}/`)).toBe(`memory/${cid}/`);
  });
});
