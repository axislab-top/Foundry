import { of } from 'rxjs';
import { AgentsActiveDirectoryCacheService } from './agents-active-directory-cache.service.js';

describe('AgentsActiveDirectoryCacheService', () => {
  it('sends agents.findAll with pageSize from config', async () => {
    const send = jest.fn().mockReturnValue(of({ items: [{ id: 'a1', name: 'A', role: 'ceo' }] }));
    const apiRpc = { send };
    const config = {
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      getAgentsActiveDirectoryPageSize: () => 200,
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      setPx: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new AgentsActiveDirectoryCacheService(config as any, redis as any, apiRpc as any);
    await svc.getActiveAgents('00000000-0000-4000-8000-000000000001', { id: '00000000-0000-4000-8000-000000000002', roles: ['admin'] });
    expect(send).toHaveBeenCalledWith(
      'agents.findAll',
      expect.objectContaining({
        pageSize: 200,
        companyId: '00000000-0000-4000-8000-000000000001',
        status: 'active',
        page: 1,
      }),
    );
  });
});
