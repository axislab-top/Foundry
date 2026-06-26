import {
  DeliverableGateService,
  hasMeaningfulDeliverableArtifacts,
} from './deliverable-gate.service.js';

describe('DeliverableGateService', () => {
  const gate = new DeliverableGateService();

  it('strict: blocks when requiresDeliverable and no artifacts', () => {
    expect(gate.evaluate({ artifacts: [], requiresDeliverable: true })).toEqual({
      allowed: false,
      reason: 'no_artifacts',
    });
  });

  it('allows when not required', () => {
    expect(gate.evaluate({ artifacts: [], requiresDeliverable: false })).toEqual({
      allowed: true,
      reason: 'not_required',
    });
  });

  it('hasMeaningfulDeliverableArtifacts accepts fileAssetId', () => {
    expect(hasMeaningfulDeliverableArtifacts([{ type: 'file', fileAssetId: 'fa-1' }])).toBe(true);
  });

  it('hasMeaningfulDeliverableArtifacts ignores empty skill shell', () => {
    expect(hasMeaningfulDeliverableArtifacts([{ type: 'skill', content: '{}' }])).toBe(false);
    expect(
      hasMeaningfulDeliverableArtifacts([{ type: 'skill', content: '市场分析框架 v1' }]),
    ).toBe(true);
  });

  it('hasMeaningfulDeliverableArtifacts ignores blocked skill json', () => {
    expect(
      hasMeaningfulDeliverableArtifacts([
        { type: 'skill', content: '{"status":"blocked","summary":"missing reviewTarget"}' },
      ]),
    ).toBe(false);
  });
});
