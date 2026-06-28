import { MemoryGraphService } from './memory-graph.service.js';
import { MemoryGraphRolloutService } from './memory-graph-rollout.service.js';

describe('MemoryGraphService', () => {
  it('getCausalInboundCounts aggregates caused_by and derived_from', async () => {
    const rows = [
      { entryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', c: 2 },
      { entryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', c: 1 },
    ];
    const dataSource = {
      query: jest.fn().mockResolvedValue(rows),
    } as any;
    const edgesRepo = {} as any;
    const config = {
      isMemoryGraphV2Enabled: () => true,
      get: jest.fn(),
    } as any;
    const rollout = {
      isMemoryGraphV2Effective: jest.fn().mockResolvedValue(true),
    } as any;
    const graph = new MemoryGraphService(dataSource, edgesRepo, config, rollout as MemoryGraphRolloutService);
    const m = await graph.getCausalInboundCounts('cccccccc-cccc-4ccc-8ccc-cccccccccccc', [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
    expect(m.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(2);
    expect(m.get('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBe(1);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('caused_by'),
      expect.any(Array),
    );
  });
});
