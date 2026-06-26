import { memoryReferencesFromSearchHits } from './memory-references-from-hits.util.js';

describe('memoryReferencesFromSearchHits', () => {
  it('maps API hits to MemoryReference shape', () => {
    const refs = memoryReferencesFromSearchHits([
      { id: 'e1', score: 0.88, namespace: 'session:r1', sourceType: 'chat', content: 'hello world', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(refs).toEqual([
      expect.objectContaining({
        memoryEntryId: 'e1',
        score: 0.88,
        namespace: 'session:r1',
        sourceType: 'chat',
        snippet: 'hello world',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    ]);
  });
});
