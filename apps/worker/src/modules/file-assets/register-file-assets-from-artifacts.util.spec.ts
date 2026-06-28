import {
  collectFileRegisterCandidates,
  collectTextContentRegisterCandidates,
  extractStoragePathFromUri,
  isFileLikeArtifact,
} from './register-file-assets-from-artifacts.util.js';

describe('register-file-assets-from-artifacts.util', () => {
  const companyId = '11111111-1111-1111-1111-111111111111';

  it('extractStoragePathFromUri resolves companies prefix', () => {
    expect(
      extractStoragePathFromUri(
        `companies/${companyId}/memory/files/a/report.pdf`,
        companyId,
      ),
    ).toBe('memory/files/a/report.pdf');
  });

  it('isFileLikeArtifact detects file type with uri', () => {
    expect(isFileLikeArtifact({ type: 'file', uri: 'x.pdf' })).toBe(true);
    expect(isFileLikeArtifact({ type: 'skill', content: 'x' })).toBe(false);
  });

  it('collectFileRegisterCandidates dedupes paths', () => {
    const artifacts = [
      { type: 'file', uri: `companies/${companyId}/memory/files/a/a.pdf` },
      { type: 'file', uri: `companies/${companyId}/memory/files/a/a.pdf` },
    ];
    const out = collectFileRegisterCandidates(artifacts, {}, companyId);
    expect(out).toHaveLength(1);
    expect(out[0].ingest).toBe(true);
  });

  it('collectTextContentRegisterCandidates picks markdown skill output when no file uri', () => {
    const md = '# 竞品分析\n\n'.padEnd(200, '正文内容');
    const artifacts = [{ type: 'skill', content: md }];
    const pathOut = collectFileRegisterCandidates(artifacts, {}, companyId);
    const textOut = collectTextContentRegisterCandidates(
      artifacts,
      { skillName: 'employee-task-reporter', taskId: 'task-1' },
      pathOut,
    );
    expect(textOut).toHaveLength(1);
    expect(textOut[0].name).toContain('employee-task-reporter');
    expect(textOut[0].ingest).toBe(true);
  });

  it('collectTextContentRegisterCandidates still collects when path candidates exist (for fallback registration)', () => {
    const artifacts = [
      { type: 'file', uri: `companies/${companyId}/memory/files/a/a.pdf` },
      { type: 'skill', content: '# 报告\n\n'.padEnd(200, '正文') },
    ];
    const pathOut = collectFileRegisterCandidates(artifacts, {}, companyId);
    const textOut = collectTextContentRegisterCandidates(artifacts, { skillName: 'reporter' }, pathOut);
    expect(pathOut).toHaveLength(1);
    expect(textOut).toHaveLength(1);
  });

  it('collectTextContentRegisterCandidates rejects incomplete JSON placeholder', () => {
    const placeholder = JSON.stringify({
      approvalReady: false,
      blockers: ['缺少 thesis'],
      executiveSummary: '因缺少参数无法形成有效判断',
    });
    const artifacts = [{ type: 'skill', content: placeholder }];
    const textOut = collectTextContentRegisterCandidates(artifacts, {}, []);
    expect(textOut).toHaveLength(0);
  });
});
