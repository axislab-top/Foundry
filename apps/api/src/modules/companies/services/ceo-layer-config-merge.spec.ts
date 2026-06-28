import { mergeCeoLayerConfigFromTemplate, normalizeCeoLayerConfig } from '@foundry/skills';



describe('mergeCeoLayerConfigFromTemplate', () => {

  it('fills empty company layers from template per layer', () => {

    const template = normalizeCeoLayerConfig({

      strategy: { skillIds: ['a', 'b'], modelName: 'm1' },

      orchestration: { skillIds: ['c'] },

      supervision: { skillIds: ['d'] },

    });

    const merged = mergeCeoLayerConfigFromTemplate(template, {});

    expect(merged.strategy).toEqual(expect.objectContaining({ skillIds: ['a', 'b'], modelName: 'm1' }));

    expect(merged.orchestration).toEqual(expect.objectContaining({ skillIds: ['c'] }));

    expect(merged.supervision).toEqual(expect.objectContaining({ skillIds: ['d'] }));

  });



  it('unions skillIds per layer and preserves company-only fields', () => {

    const template = normalizeCeoLayerConfig({

      strategy: { skillIds: ['t1'], temperature: 0.2 },

      orchestration: { skillIds: ['t2'] },

      supervision: { skillIds: ['t3'] },

    });

    const company = normalizeCeoLayerConfig({

      strategy: { skillIds: ['c1'], systemPrompt: 'ceo-only' },

      orchestration: { skillIds: [] },

      supervision: { skillIds: ['c3'] },

    });

    const merged = mergeCeoLayerConfigFromTemplate(template, company);

    expect((merged.strategy as any).skillIds.sort()).toEqual(['c1', 't1'].sort());

    expect((merged.strategy as any).systemPrompt).toBe('ceo-only');

    expect((merged.strategy as any).temperature).toBe(0.2);

    expect((merged.orchestration as any).skillIds).toEqual(['t2']);

    expect((merged.supervision as any).skillIds.sort()).toEqual(['c3', 't3'].sort());

  });



  it('company non-empty modelName overrides template (Admin / stored snapshot wins)', () => {

    const template = normalizeCeoLayerConfig({

      strategy: { modelName: 'Qwen3-30B-A3B', skillIds: ['s1'] },

      orchestration: { modelName: 'QwQ-32B', skillIds: ['s2'] },

      supervision: { modelName: 'Qwen3-235B-A22B', skillIds: ['s3'] },

    });

    const company = normalizeCeoLayerConfig({

      strategy: { modelName: 'Qwen3-Embedding-8B', skillIds: ['c1'] },

      orchestration: { modelName: 'legacy-wrong-model', skillIds: [] },

      supervision: { modelName: 'legacy-heavy', skillIds: ['c3'] },

    });

    const merged = mergeCeoLayerConfigFromTemplate(template, company);

    expect((merged.strategy as any).modelName).toBe('Qwen3-Embedding-8B');

    expect((merged.orchestration as any).modelName).toBe('legacy-wrong-model');

    expect((merged.supervision as any).modelName).toBe('legacy-heavy');

  });



  it('keeps template modelName when company omits or blanks modelName', () => {

    const template = normalizeCeoLayerConfig({

      strategy: { modelName: 'QwQ-32B', skillIds: ['s2'] },

    });

    const company = normalizeCeoLayerConfig({

      strategy: { skillIds: ['c1'], modelName: '   ' },

    });

    const merged = mergeCeoLayerConfigFromTemplate(template, company);

    expect((merged.strategy as any).modelName).toBe('QwQ-32B');

  });

});


