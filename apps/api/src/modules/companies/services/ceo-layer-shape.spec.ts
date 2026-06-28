import {

  ensureFullCeoLayerShape,

  mergeCeoLayerConfigFromTemplate,

  normalizeCeoLayerConfig,

} from '@foundry/skills';



describe('CEO layer snapshot shape (@foundry/skills)', () => {

  it('ensureFullCeoLayerShape fills missing layers when template only defines strategy', () => {

    const template = normalizeCeoLayerConfig({

      strategy: { skillIds: ['aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee'] },

    });

    const merged = mergeCeoLayerConfigFromTemplate(template, {});

    const full = ensureFullCeoLayerShape(merged);

    expect(Object.keys(full).sort()).toEqual(['orchestration', 'strategy', 'supervision']);

    expect(full.strategy).toEqual(

      expect.objectContaining({

        skillIds: ['aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee'],

      }),

    );

    expect(full.orchestration).toEqual({ skillIds: [] });

    expect(full.supervision).toEqual({ skillIds: [] });

  });



  it('merges company extras with template union skillIds across layers', () => {

    const template = normalizeCeoLayerConfig({

      strategy: { skillIds: ['t1'] },

      orchestration: { skillIds: [] },

      supervision: { skillIds: [] },

    });

    const company = normalizeCeoLayerConfig({

      strategy: { skillIds: ['c1'] },

    });

    const full = ensureFullCeoLayerShape(mergeCeoLayerConfigFromTemplate(template, company));

    expect((full.strategy as { skillIds: string[] }).skillIds.sort()).toEqual(['c1', 't1']);

  });

});


