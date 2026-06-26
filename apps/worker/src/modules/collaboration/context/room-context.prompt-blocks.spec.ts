import { buildCeoSpeakerPromptLine } from './room-context.service.js';

describe('buildCeoSpeakerPromptLine', () => {
  it('binds first person to the CEO row in directory', () => {
    const line = buildCeoSpeakerPromptLine('ceo-uuid', [
      {
        memberType: 'agent',
        memberId: 'ceo-uuid',
        displayName: 'F5',
        roleLabel: 'CEO',
      },
      { memberType: 'human', memberId: 'u1', displayName: 'Alice', roleLabel: '主群owner' },
    ]);
    expect(line).toContain('ceo-uuid');
    expect(line).toContain('F5');
    expect(line).toContain('CEO');
    expect(line).toContain('【speaker】');
  });

  it('returns fallback when ceo id not in directory', () => {
    const line = buildCeoSpeakerPromptLine('missing', [
      { memberType: 'agent', memberId: 'other', displayName: 'X', roleLabel: 'r' },
    ]);
    expect(line).toContain('missing');
    expect(line).toContain('未含');
  });
});
