import {
  isCeoLayerScopedContext,
  selectPoolBindingsForAgent,
  shouldEnforceCeoLayerKeyPool,
} from './ceo-llm-key-pool-bindings.js';

describe('ceo-llm-key-pool-bindings', () => {
  const b = (llmKeyId: string, ceoLayer: string, sortOrder: number) => ({
    llmKeyId,
    ceoLayer,
    sortOrder,
  });

  it('CEO + replay 只保留 replay 层 binding', () => {
    const bindings = [b('mimo', 'heavy', 0), b('glm', 'replay', 1)];
    const out = selectPoolBindingsForAgent({ role: 'ceo', safeContext: 'replay', bindings });
    expect(out.map((x) => x.llmKeyId)).toEqual(['glm']);
  });

  it('CEO + replay 无 replay 绑定时池为空（不把 heavy 混进来）', () => {
    const bindings = [b('mimo', 'heavy', 0)];
    const out = selectPoolBindingsForAgent({ role: 'ceo', safeContext: 'replay', bindings });
    expect(out).toEqual([]);
  });

  it('CEO + intent 只保留 intent 层', () => {
    const bindings = [b('a', 'replay', 0), b('b', 'intent', 1)];
    const out = selectPoolBindingsForAgent({ role: 'ceo', safeContext: 'intent', bindings });
    expect(out.map((x) => x.llmKeyId)).toEqual(['b']);
  });

  it('未指定 context 时按 V2 层顺序（intent→replay→strategy→…→heavy）扁平合并', () => {
    const bindings = [b('h', 'heavy', 0), b('r', 'replay', 1), b('s', 'strategy', 2)];
    const out = selectPoolBindingsForAgent({ role: 'ceo', safeContext: '', bindings });
    expect(out.map((x) => x.llmKeyId)).toEqual(['r', 's', 'h']);
  });

  it('isCeoLayerScopedContext', () => {
    expect(isCeoLayerScopedContext('replay')).toBe(true);
    expect(isCeoLayerScopedContext('heavy')).toBe(true);
    expect(isCeoLayerScopedContext('')).toBe(false);
  });

  it('shouldEnforceCeoLayerKeyPool：层 scoped 但池为空时不强制过滤', () => {
    expect(shouldEnforceCeoLayerKeyPool(true, 0)).toBe(false);
    expect(shouldEnforceCeoLayerKeyPool(true, 1)).toBe(true);
    expect(shouldEnforceCeoLayerKeyPool(false, 0)).toBe(false);
  });
});
