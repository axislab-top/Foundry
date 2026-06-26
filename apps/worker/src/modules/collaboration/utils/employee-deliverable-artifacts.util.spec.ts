import {
  mapSkillResultToDeliverableArtifacts,
  toCollaborationDeliverableArtifactRows,
} from './employee-deliverable-artifacts.util.js';

describe('employee-deliverable-artifacts.util', () => {
  it('maps skill result with nested artifacts and uri', () => {
    const rows = toCollaborationDeliverableArtifactRows(
      mapSkillResultToDeliverableArtifacts(
        {
          summary: 'done',
          uri: 'https://example.com/report',
          artifacts: [{ type: 'file', content: 'report body', uri: 'https://example.com/file' }],
        },
        'research_skill',
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.type).toBe('skill');
    expect(rows.some((r) => r.uri?.includes('example.com'))).toBe(true);
  });
});
