import { BootstrapSkillCatalogService } from './bootstrap-skill-catalog.service.js';

describe('BootstrapSkillCatalogService', () => {
  it('binds resolved skills and skips missing global names without throwing', async () => {
    const platformSettings = {
      getEffectiveRoleDefaultGlobalSkillNames: jest.fn(async () => ['heartbeat', 'missing-skill']),
    };
    const skillsService = {
      resolveOptionalGlobalSkillIdsByNames: jest.fn(async () => ({
        skillIds: ['skill-heartbeat-id'],
        missingNames: ['missing-skill'],
      })),
    };
    const skillBindingValidator = {
      mountPlatformGlobalSkillsOnBoard: jest.fn(async () => ({ insertedOrgBindings: 1, isGlobalToggled: 0 })),
    };
    const agentSkillService = {
      bindDefaultSkillsForAgent: jest.fn(async () => undefined),
    };

    const svc = new BootstrapSkillCatalogService(
      platformSettings as any,
      skillsService as any,
      skillBindingValidator as any,
      agentSkillService as any,
    );

    const result = await svc.ensureCompanyCatalogThenBindSkillNames(
      'company-1',
      'agent-1',
      ['heartbeat', 'missing-skill'],
      'bootstrap_executor_dept',
    );

    expect(result.resolvedSkillIds).toEqual(['skill-heartbeat-id']);
    expect(result.missingNames).toEqual(['missing-skill']);
    expect(skillBindingValidator.mountPlatformGlobalSkillsOnBoard).toHaveBeenCalledWith('company-1', [
      'skill-heartbeat-id',
    ]);
    expect(agentSkillService.bindDefaultSkillsForAgent).toHaveBeenCalledWith(
      'agent-1',
      'company-1',
      ['skill-heartbeat-id'],
      'bootstrap_executor_dept',
    );
  });
});
