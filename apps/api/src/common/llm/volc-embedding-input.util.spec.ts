import {
  embeddingsPathExpectsStringInputOnly,
  inferEmbeddingDimensionsFromModelName,
  isVolcArkVisionEmbeddingModelName,
  isVolcengineArkEmbeddingsBaseUrl,
} from './volc-embedding-input.util.js';

describe('isVolcArkVisionEmbeddingModelName', () => {
  it('matches doubao vision embedding id', () => {
    expect(isVolcArkVisionEmbeddingModelName('doubao-embedding-vision-251215')).toBe(true);
  });

  it('is false for text embedding', () => {
    expect(isVolcArkVisionEmbeddingModelName('doubao-embedding-text-240515')).toBe(false);
  });
});

describe('isVolcengineArkEmbeddingsBaseUrl', () => {
  it('detects Volces Ark base', () => {
    expect(isVolcengineArkEmbeddingsBaseUrl('https://ark.cn-beijing.volces.com/api/v3')).toBe(true);
  });

  it('is false for OpenAI', () => {
    expect(isVolcengineArkEmbeddingsBaseUrl('https://api.openai.com/v1')).toBe(false);
  });
});

describe('embeddingsPathExpectsStringInputOnly', () => {
  it('is true for Volcano plain /embeddings', () => {
    expect(
      embeddingsPathExpectsStringInputOnly('https://ark.cn-beijing.volces.com/api/v3/embeddings'),
    ).toBe(true);
  });

  it('is false for Volcano multimodal', () => {
    expect(
      embeddingsPathExpectsStringInputOnly('https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal'),
    ).toBe(false);
  });

  it('is false for OpenAI', () => {
    expect(embeddingsPathExpectsStringInputOnly('https://api.openai.com/v1/embeddings')).toBe(false);
  });
});

describe('inferEmbeddingDimensionsFromModelName', () => {
  it('returns 2048 for embedding-vision models', () => {
    expect(inferEmbeddingDimensionsFromModelName('doubao-embedding-vision-251215')).toBe(2048);
  });

  it('returns null when unknown', () => {
    expect(inferEmbeddingDimensionsFromModelName('text-embedding-3-small')).toBeNull();
  });
});
