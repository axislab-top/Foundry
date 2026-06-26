import { shouldSkipReplayToolLoop } from './context-grounding-plan.js';

describe('shouldSkipReplayToolLoop', () => {
  it('returns false when planner has factsQueryTypes', () => {
    expect(
      shouldSkipReplayToolLoop({
        plan: {
          prefetchBlocks: ['speaker', 'transcript', 'org_snapshot'],
          factsQueryTypes: ['org_structure'],
          toolPolicy: 'tools_allowed',
          confidence: 0.9,
          source: 'llm',
        },
        diagnostics: { prefetchBlocks: ['speaker', 'transcript', 'org_snapshot'] },
      }),
    ).toBe(false);
  });

  it('returns true when all non-transcript prefetch blocks are satisfied', () => {
    expect(
      shouldSkipReplayToolLoop({
        plan: {
          prefetchBlocks: ['speaker', 'transcript', 'org_snapshot'],
          factsQueryTypes: [],
          toolPolicy: 'tools_allowed',
          confidence: 0.9,
          source: 'llm',
        },
        diagnostics: { prefetchBlocks: ['speaker', 'transcript', 'org_snapshot'] },
      }),
    ).toBe(true);
  });

  it('returns false when a required block is missing from diagnostics', () => {
    expect(
      shouldSkipReplayToolLoop({
        plan: {
          prefetchBlocks: ['speaker', 'transcript', 'memory'],
          factsQueryTypes: [],
          toolPolicy: 'tools_allowed',
          confidence: 0.9,
          source: 'llm',
        },
        diagnostics: { prefetchBlocks: ['speaker', 'transcript'] },
      }),
    ).toBe(false);
  });
});
