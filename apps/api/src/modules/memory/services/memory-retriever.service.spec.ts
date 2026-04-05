import { MemoryRetrieverService } from './memory-retriever.service.js';
import { MemoryAccessService } from './memory-access.service.js';
import type { MessagingService } from '@service/messaging';

describe('MemoryRetrieverService', () => {
  it('masks sensitive hits for non-privileged actor', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          id: '1',
          collectionId: 'c1',
          namespace: 'company',
          content: 'secret',
          metadata: { a: 1 },
          sourceType: 'manual',
          isSensitive: true,
          score: 0.9,
        },
      ]),
    } as any;
    const embedding = {
      embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0.01)),
    } as any;
    const config = {
      getMemoryConfig: () => ({
        hybridVectorWeight: 0.72,
        hybridFullTextSearch: true,
        ragMinScore: 0,
        ragQueryTimeoutMs: 5000,
      }),
    } as any;
    const access = new MemoryAccessService();
    const roomMembersRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as any;
    const messaging: Pick<MessagingService, 'publish'> = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;

    const retriever = new MemoryRetrieverService(
      dataSource,
      roomMembersRepo,
      embedding,
      config,
      access,
      messaging as MessagingService,
    );

    const hits = await retriever.search('q', {
      companyId: 'co1',
      actor: { id: 'u1', roles: ['member'] },
    });

    expect(hits[0].redacted).toBe(true);
    expect(hits[0].content).toContain('敏感记忆');
  });

  it('allows session namespace when actor is active room member', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as any;
    const embedding = {
      embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0.01)),
    } as any;
    const config = {
      getMemoryConfig: () => ({
        hybridVectorWeight: 0.72,
        hybridFullTextSearch: true,
        ragMinScore: 0,
        ragQueryTimeoutMs: 5000,
      }),
    } as any;
    const access = new MemoryAccessService();
    const roomMembersRepo = {
      find: jest.fn().mockResolvedValue([{ roomId: 'room-1' }]),
    } as any;
    const messaging: Pick<MessagingService, 'publish'> = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;
    const retriever = new MemoryRetrieverService(
      dataSource,
      roomMembersRepo,
      embedding,
      config,
      access,
      messaging as MessagingService,
    );
    await expect(
      retriever.search('q', {
        companyId: 'co1',
        actor: { id: 'u1', roles: ['member'] },
        namespaces: ['session:room-1'],
      }),
    ).resolves.toEqual([]);
  });

  it('forbids session namespace when actor is not room member', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as any;
    const embedding = {
      embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0.01)),
    } as any;
    const config = {
      getMemoryConfig: () => ({
        hybridVectorWeight: 0.72,
        hybridFullTextSearch: true,
        ragMinScore: 0,
        ragQueryTimeoutMs: 5000,
      }),
    } as any;
    const access = new MemoryAccessService();
    const roomMembersRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as any;
    const messaging: Pick<MessagingService, 'publish'> = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;
    const retriever = new MemoryRetrieverService(
      dataSource,
      roomMembersRepo,
      embedding,
      config,
      access,
      messaging as MessagingService,
    );
    await expect(
      retriever.search('q', {
        companyId: 'co1',
        actor: { id: 'u1', roles: ['member'] },
        namespaces: ['session:room-1'],
      }),
    ).rejects.toMatchObject({ response: { code: 'MEMORY_NAMESPACE_FORBIDDEN' } });
  });
});
