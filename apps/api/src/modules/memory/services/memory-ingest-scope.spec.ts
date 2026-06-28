import { BadRequestException } from '@nestjs/common';
import { MemoryService } from './memory.service.js';

describe('MemoryService.assertMemoryIngestStoragePathForCompany', () => {
  const cid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('allows companies/{id}/ prefix', () => {
    expect(() =>
      MemoryService.assertMemoryIngestStoragePathForCompany(
        cid,
        `companies/${cid}/memory/doc.txt`,
      ),
    ).not.toThrow();
  });

  it('allows legacy memory/{id}/ prefix', () => {
    expect(() =>
      MemoryService.assertMemoryIngestStoragePathForCompany(cid, `memory/${cid}/x.txt`),
    ).not.toThrow();
  });

  it('rejects other company id in path', () => {
    expect(() =>
      MemoryService.assertMemoryIngestStoragePathForCompany(
        cid,
        'companies/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/memory/x.txt',
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects bare uploads path', () => {
    expect(() =>
      MemoryService.assertMemoryIngestStoragePathForCompany(cid, 'uploads/x.txt'),
    ).toThrow(BadRequestException);
  });
});
