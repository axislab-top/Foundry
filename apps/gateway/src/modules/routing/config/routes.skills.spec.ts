import { ROUTES } from './routes.config.js';

describe('routes.config skills & org node skills', () => {
  it('should whitelist skills CRUD and agent skill bindings', () => {
    const patterns = ROUTES.map((r) => r.rpcPattern);
    expect(patterns).toEqual(
      expect.arrayContaining([
        'skills.findAll',
        'skills.findOne',
        'skills.create',
        'skills.update',
        'skills.remove',
        'skills.validateCompanyBindings',
        'agents.bindSkills',
        'agents.unbindSkills',
        'agents.effectiveSkills',
        'organization.node.skills.list',
        'organization.node.skills.bind',
        'organization.node.skills.unbind',
      ]),
    );
  });
});
