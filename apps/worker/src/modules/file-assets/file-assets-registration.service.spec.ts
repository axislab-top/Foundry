import { of, throwError } from 'rxjs';
import { FileAssetsRegistrationService } from './file-assets-registration.service.js';

describe('FileAssetsRegistrationService', () => {
  const companyId = '11111111-1111-1111-1111-111111111111';

  function buildService(send: jest.Mock) {
    const apiRpc = { send } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-actor',
      getApiRpcTimeoutMs: () => 5000,
    } as any;
    return new FileAssetsRegistrationService(apiRpc, config);
  }

  it('falls back to text registration when path registration fails', async () => {
    const md = '# 交付报告\n\n'.padEnd(200, '分析内容');
    const send = jest.fn((pattern: string) => {
      if (pattern === 'fileAssets.register') {
        return throwError(() => new Error('storage missing'));
      }
      if (pattern === 'fileAssets.registerFromContent') {
        return of({ id: 'fa-text-1', name: 'deliverable.md' });
      }
      return of({});
    });
    const svc = buildService(send);

    const registered = await svc.registerFromArtifacts(
      { companyId, agentId: 'agent-1', taskId: 'task-1', skillName: 'reporter' },
      [
        { type: 'file', uri: `companies/${companyId}/memory/files/missing/report.pdf` },
        { type: 'skill', content: md },
      ],
      {},
    );

    expect(registered).toHaveLength(1);
    expect(registered[0].fileAssetId).toBe('fa-text-1');
    expect(send).toHaveBeenCalledWith('fileAssets.register', expect.anything());
    expect(send).toHaveBeenCalledWith('fileAssets.registerFromContent', expect.anything());
  });

  it('skips text registration when path registration succeeds', async () => {
    const send = jest.fn((pattern: string) => {
      if (pattern === 'fileAssets.register') {
        return of({ id: 'fa-path-1', name: 'report.pdf' });
      }
      return of({});
    });
    const svc = buildService(send);

    const registered = await svc.registerFromArtifacts(
      { companyId, agentId: 'agent-1', taskId: 'task-1' },
      [
        { type: 'file', uri: `companies/${companyId}/memory/files/a/report.pdf` },
        { type: 'skill', content: '# 报告\n\n'.padEnd(200, 'x') },
      ],
      {},
    );

    expect(registered).toHaveLength(1);
    expect(registered[0].fileAssetId).toBe('fa-path-1');
    expect(send).not.toHaveBeenCalledWith('fileAssets.registerFromContent', expect.anything());
  });
});
