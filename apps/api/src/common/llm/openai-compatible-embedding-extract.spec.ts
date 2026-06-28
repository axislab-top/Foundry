import { extractEmbeddingVectorFromEmbeddingsJson } from './openai-compatible-embedding-extract.js';

describe('extractEmbeddingVectorFromEmbeddingsJson', () => {
  it('parses OpenAI-style data array', () => {
    const v = extractEmbeddingVectorFromEmbeddingsJson({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });
    expect(v).toEqual([0.1, 0.2, 0.3]);
  });

  it('parses Volcano-style data object with embedding', () => {
    const v = extractEmbeddingVectorFromEmbeddingsJson({
      created: 1,
      data: { embedding: [0.039306640625, -0.000743865966796875, 0.006072998046875] },
    });
    expect(v).toHaveLength(3);
    expect(v![0]).toBeCloseTo(0.039306640625);
  });

  it('returns null for empty or invalid', () => {
    expect(extractEmbeddingVectorFromEmbeddingsJson({ data: [] })).toBeNull();
    expect(extractEmbeddingVectorFromEmbeddingsJson({ data: [{}] })).toBeNull();
    expect(extractEmbeddingVectorFromEmbeddingsJson({ data: { embedding: [] } })).toBeNull();
    expect(extractEmbeddingVectorFromEmbeddingsJson(null)).toBeNull();
  });
});
