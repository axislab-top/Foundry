import {
  computeAllowedHeavyPipelineKinds,
  resolveHeavyPipelineKindOrThrow,
} from './main-room-heavy-pipeline-entry.util.js';
import { ReplayExecutionDelegateError } from '../main-room-replay-delegate-errors.js';

describe('main-room-heavy-pipeline-entry.util', () => {
  it('resolveHeavyPipelineKindOrThrow: invoke false ignores kind', () => {
    const allowed = new Set(['full'] as const);
    expect(
      resolveHeavyPipelineKindOrThrow({
        invokeExecutionLayers: false,
        decisionKind: 'full',
        allowed,
      }),
    ).toBe('full');
  });

  it('resolveHeavyPipelineKindOrThrow: contract violation when kind not allowed', () => {
    const allowed = new Set(['full'] as const);
    expect(() =>
      resolveHeavyPipelineKindOrThrow({
        invokeExecutionLayers: true,
        decisionKind: 'dispatch_plan_compile_and_flush',
        allowed,
      }),
    ).toThrow(ReplayExecutionDelegateError);
  });

  it('computeAllowedHeavyPipelineKinds adds dispatch plan kinds when v2 enabled', () => {
    const allowed = computeAllowedHeavyPipelineKinds({
      dispatchPlanV2Enabled: true,
    });
    expect(allowed.has('dispatch_plan_compile_and_flush')).toBe(true);
    expect(allowed.has('dispatch_plan_revise')).toBe(true);
  });

  it('computeAllowedHeavyPipelineKinds only includes full when v2 disabled', () => {
    const allowed = computeAllowedHeavyPipelineKinds({});
    expect([...allowed]).toEqual(['full']);
  });
});
