import { ROUTES } from './routes.config.js';

describe('routes.config memory', () => {
  it('should expose memory RPC routes', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'memory.entries.store',
        'memory.search',
        'memory.summarize',
        'memory.document.ingest',
        'memory.document.ingestAsync',
        'organization.node.knowledgeSummary',
        'agents.memoryStats',
      ]),
    );
  });
});
