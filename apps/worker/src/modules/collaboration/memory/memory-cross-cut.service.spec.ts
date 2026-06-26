import { MemoryCrossCutService } from './memory-cross-cut.service.js';

describe('MemoryCrossCutService tenant isolation', () => {
  function makeService() {
    const config = {
      isMemoryRetrievalDeduplicationEnabled: () => true,
      isMemoryRetrievalLeadRedisCacheEnabled: () => false,
      isCollabMemoryLayeringEnabled: () => false,
      getCollaborationMentionRpcTimeoutMs: () => 3000,
    } as any;
    const apiRpc = { send: jest.fn() } as any;
    const redisCache = { get: jest.fn(), setPx: jest.fn() } as any;
    return new MemoryCrossCutService(config, apiRpc, redisCache);
  }

  it('scopes in-process trace dedupe cache by companyId + traceId', async () => {
    const svc = makeService();
    const fetcherA = jest.fn(async () => ({
      hits: [{ id: 'a1', content: 'company-a', score: 1 }],
      promptContext: 'ctx-a',
      hitCount: 1,
    }));
    const fetcherB = jest.fn(async () => ({
      hits: [{ id: 'b1', content: 'company-b', score: 1 }],
      promptContext: 'ctx-b',
      hitCount: 1,
    }));

    const firstA = await svc.getOrRetrieveForTrace('company-a', 'trace-1', fetcherA);
    const dupA = await svc.getOrRetrieveForTrace('company-a', 'trace-1', fetcherA);
    const firstB = await svc.getOrRetrieveForTrace('company-b', 'trace-1', fetcherB);

    expect(firstA.duplicateSkipped).toBe(false);
    expect(firstA.promptContext).toBe('ctx-a');
    expect(dupA.duplicateSkipped).toBe(true);
    expect(fetcherA).toHaveBeenCalledTimes(1);

    expect(firstB.duplicateSkipped).toBe(false);
    expect(firstB.promptContext).toBe('ctx-b');
    expect(fetcherB).toHaveBeenCalledTimes(1);
  });
});
