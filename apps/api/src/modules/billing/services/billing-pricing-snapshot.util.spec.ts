import {
  isCompleteLlmPricingSnapshotJson,
  tryComputeCostFromPricingSnapshotJson,
} from './billing-pricing-snapshot.util.js';

describe('tryComputeCostFromPricingSnapshotJson', () => {
  it('computes LLM cost from snapshot ppm fields', () => {
    const out = tryComputeCostFromPricingSnapshotJson(
      {
        recordType: 'llm',
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      } as any,
      {
        inputPricePerMillion: '3',
        outputPricePerMillion: '5',
        currency: 'USD',
      },
    );
    expect(out).toEqual({ cost: 3 + 2.5, currency: 'USD' });
  });

  it('accepts snake_case ppm keys', () => {
    const out = tryComputeCostFromPricingSnapshotJson(
      { recordType: 'llm', inputTokens: 100, outputTokens: 0 } as any,
      { input_price_per_million: '10', output_price_per_million: '20' },
    );
    expect(out?.cost).toBeCloseTo(0.001, 8);
  });
});

describe('isCompleteLlmPricingSnapshotJson', () => {
  it('returns true when ppm fields present', () => {
    expect(
      isCompleteLlmPricingSnapshotJson({
        inputPricePerMillion: '1',
        outputPricePerMillion: '2',
      }),
    ).toBe(true);
  });

  it('returns false for incomplete payloads', () => {
    expect(isCompleteLlmPricingSnapshotJson(null)).toBe(false);
    expect(isCompleteLlmPricingSnapshotJson({ inputPricePerMillion: '1' })).toBe(false);
  });
});
