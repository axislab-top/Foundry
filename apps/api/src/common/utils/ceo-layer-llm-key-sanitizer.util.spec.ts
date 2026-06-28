import { describe, expect, it } from '@jest/globals';
import { sanitizeCeoLayerConfigLlmKeyIds } from './ceo-layer-llm-key-sanitizer.util.js';

describe('sanitizeCeoLayerConfigLlmKeyIds', () => {
  const valid = new Set([
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ]);

  it('removes stale keyIds from strategy layers and intentLayer', () => {
    const out = sanitizeCeoLayerConfigLlmKeyIds(
      {
        strategy: {
          keyIds: ['11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'],
          llmKeyId: '33333333-3333-4333-8333-333333333333',
          contextPolicy: {
            intentLayer: {
              keyIds: ['22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444'],
              llmKeyId: '44444444-4444-4444-8444-444444444444',
              globalSettings: { modelKeyId: '44444444-4444-4444-8444-444444444444' },
            },
          },
        },
        orchestration: { keyIds: ['33333333-3333-4333-8333-333333333333'] },
      },
      valid,
    );

    expect((out.strategy as any).keyIds).toEqual(['11111111-1111-4111-8111-111111111111']);
    expect((out.strategy as any).llmKeyId).toBe('11111111-1111-4111-8111-111111111111');
    expect((out.strategy as any).contextPolicy.intentLayer.keyIds).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect((out.strategy as any).contextPolicy.intentLayer.llmKeyId).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
    expect((out.strategy as any).contextPolicy.intentLayer.globalSettings.modelKeyId).toBeUndefined();
    expect((out.orchestration as any).keyIds).toBeUndefined();
  });
});
