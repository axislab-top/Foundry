import { ROUTES, findRoute } from './routes.config.js';

describe('routes.config agents & skills', () => {
  it('should contain agents and skills rpc patterns', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'agents.findAll',
        'agents.auditLogs',
        'agents.batchRecruit',
        'agents.effectiveSkills',
        'agents.findOne',
        'agents.create',
        'agents.update',
        'agents.remove',
        'agents.approve',
        'agents.updateStatus',
        'agents.assignToNode',
        'agents.bindSkills',
        'agents.unbindSkills',
        'skills.findAll',
        'skills.findOne',
        'skills.create',
        'skills.update',
        'skills.remove',
      ]),
    );
  });

  it('should match agents audit-logs before generic :id', () => {
    const auditIndex = ROUTES.findIndex(
      (r) => r.path === '/v1/agents/audit-logs' && r.rpcPattern === 'agents.auditLogs',
    );
    const idIndex = ROUTES.findIndex(
      (r) => r.path === '/v1/agents/:id' && r.rpcPattern === 'agents.findOne',
    );
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThanOrEqual(0);
    expect(auditIndex).toBeLessThan(idIndex);

    const matched = findRoute('/v1/agents/audit-logs');
    expect(matched?.route.rpcPattern).toBe('agents.auditLogs');
  });

  it('should match batch-recruit before generic :id', () => {
    const matched = findRoute('/v1/agents/batch-recruit');
    expect(matched?.route.rpcPattern).toBe('agents.batchRecruit');
  });

  it('should match effective-skills before generic :id', () => {
    const effIndex = ROUTES.findIndex(
      (r) =>
        r.path === '/v1/agents/:id/effective-skills' && r.rpcPattern === 'agents.effectiveSkills',
    );
    const idIndex = ROUTES.findIndex(
      (r) => r.path === '/v1/agents/:id' && r.rpcPattern === 'agents.findOne',
    );
    expect(effIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThanOrEqual(0);
    expect(effIndex).toBeLessThan(idIndex);
  });
});
