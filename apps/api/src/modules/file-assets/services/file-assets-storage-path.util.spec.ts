import { describe, it, expect } from '@jest/globals';
import {
  resolveFileAssetStorageKeyForRead,
  resolveFileAssetStorageKeyForWrite,
} from './file-assets-storage-path.util.js';

describe('file-assets-storage-path.util', () => {
  const cid = '005fad18-46e4-40d2-9918-fc39960cc374';

  it('maps tenant-relative memory/files path to companies prefix on read', () => {
    const rel = 'memory/files/1b0b286b-8015-463d-a684-621293c0b0ef/plan.md';
    expect(resolveFileAssetStorageKeyForRead(cid, rel)).toBe(`companies/${cid}/${rel}`);
  });

  it('passes through full companies key', () => {
    const full = `companies/${cid}/memory/files/a/b.pdf`;
    expect(resolveFileAssetStorageKeyForRead(cid, full)).toBe(full);
  });

  it('passes through legacy memory company path', () => {
    const legacy = `memory/${cid}/reports/x.pdf`;
    expect(resolveFileAssetStorageKeyForRead(cid, legacy)).toBe(legacy);
  });

  it('write uses same resolution as read for file_asset rows', () => {
    const rel = 'memory/files/uuid-1/report.pdf';
    expect(resolveFileAssetStorageKeyForWrite(cid, rel)).toBe(
      resolveFileAssetStorageKeyForRead(cid, rel),
    );
  });
});
