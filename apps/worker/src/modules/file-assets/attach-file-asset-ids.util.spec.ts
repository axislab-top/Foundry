import { attachFileAssetIdsToArtifactRows } from './attach-file-asset-ids.util.js';

describe('attachFileAssetIdsToArtifactRows', () => {
  const companyId = 'c1';

  it('matches artifact uri to registered storage path', () => {
    const rows = attachFileAssetIdsToArtifactRows(
      [{ type: 'file', uri: `companies/${companyId}/reports/out.pdf`, label: '报告' }],
      [{ storagePath: 'reports/out.pdf', fileAssetId: 'fa-1', name: 'out.pdf' }],
      companyId,
    );
    expect(rows[0]?.fileAssetId).toBe('fa-1');
  });

  it('preserves existing fileAssetId', () => {
    const rows = attachFileAssetIdsToArtifactRows(
      [{ type: 'file', uri: 'x', fileAssetId: 'existing', label: 'x' }],
      [{ storagePath: 'x', fileAssetId: 'fa-2', name: 'x' }],
      companyId,
    );
    expect(rows[0]?.fileAssetId).toBe('existing');
  });
});
