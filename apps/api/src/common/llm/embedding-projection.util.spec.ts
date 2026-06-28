import { clearEmbeddingProjectionMatrixCache, projectEmbeddingLinearDown } from './embedding-projection.util.js';

describe('projectEmbeddingLinearDown', () => {
  afterEach(() => {
    clearEmbeddingProjectionMatrixCache();
  });

  it('returns same length copy when from === to', () => {
    const v = [0.1, 0.2, 0.3];
    const o = projectEmbeddingLinearDown(v, 3, 3);
    expect(o).toEqual(v);
    expect(o).not.toBe(v);
  });

  it('projects 2048 -> 1536 with stable L2 norm', () => {
    const v = Array.from({ length: 2048 }, (_, i) => (i === 0 ? 1 : 0));
    const o = projectEmbeddingLinearDown(v, 2048, 1536, 'test-seed');
    expect(o.length).toBe(1536);
    const n = Math.sqrt(o.reduce((s, x) => s + x * x, 0));
    expect(n).toBeCloseTo(1, 5);
  });

  it('is deterministic for same seed', () => {
    const v = Array.from({ length: 64 }, (_, i) => Math.sin(i));
    const a = projectEmbeddingLinearDown(v, 64, 32, 's1');
    const b = projectEmbeddingLinearDown(v, 64, 32, 's1');
    expect(a).toEqual(b);
  });
});
