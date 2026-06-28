import { ROUTES } from './routes.config.js';
import { ALLOWED_RPC_PATTERNS } from './rpc-patterns.config.js';

describe('routes.config file-assets', () => {
  it('should expose file-assets RPC routes', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'fileAssets.findAll',
        'fileAssets.getStats',
        'fileAssets.findOne',
        'fileAssets.update',
        'fileAssets.remove',
        'fileAssets.getDownloadUrl',
        'fileAssets.ingest',
      ]),
    );
  });

  it('should allow file-assets patterns in RPC whitelist', () => {
    expect(ALLOWED_RPC_PATTERNS).toEqual(
      expect.arrayContaining([
        'fileAssets.register',
        'fileAssets.markIngestStatus',
      ]),
    );
  });

  it('should expose HTTP upload route', () => {
    const upload = ROUTES.find(
      (r) => r.path === '/v1/file-assets/upload' && r.transport === 'http',
    );
    expect(upload).toBeDefined();
    expect(upload?.methods).toContain('POST');
  });

  it('should expose HTTP download route', () => {
    const download = ROUTES.find(
      (r) => r.path === '/v1/file-assets/:id/download' && r.transport === 'http',
    );
    expect(download).toBeDefined();
    expect(download?.methods).toContain('GET');
    expect(download?.rewritePath).toBe('/api/file-assets/:id/download');
  });
});
