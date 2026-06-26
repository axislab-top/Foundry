import { buildAudienceRoutingMemoryDigest } from './audience-routing-memory-digest.js';
import { normalizeMemoryRetrievalSkipReason } from '../memory/memory-retrieval-skip-reason.js';
import { redisUrlFingerprint, redactRedisUrlForLog } from '../../../common/cache/redis-cache.service.js';

describe('collaboration correlation & memory helpers', () => {
  it('buildAudienceRoutingMemoryDigest respects digest length', () => {
    const hits = [
      { id: 'a', content: 'x'.repeat(500), namespace: 'ns' },
      { id: 'b', content: 'short', namespace: 'ns2' },
    ];
    const d = buildAudienceRoutingMemoryDigest(hits, 'digest');
    expect(d.length).toBeLessThanOrEqual(2400);
    expect(d).toContain('[a]');
  });

  it('normalizeMemoryRetrievalSkipReason maps orchestration_assemble', () => {
    expect(normalizeMemoryRetrievalSkipReason('orchestration_assemble')).toBe('duplicate');
  });

  it('redactRedisUrlForLog does not expose hostname', () => {
    const u = 'redis://127.0.0.1:6379/0';
    expect(redactRedisUrlForLog(u)).not.toContain('127.0.0.1');
    expect(redisUrlFingerprint(u)).toHaveLength(16);
  });
});
