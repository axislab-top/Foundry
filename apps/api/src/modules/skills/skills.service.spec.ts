import { skillToSnapshot } from './services/skills.service.js';
import type { Skill } from './entities/skill.entity.js';

describe('SkillsModule helpers', () => {
  it('skillToSnapshot maps entity to contract SkillToolSnapshot', () => {
    const skill = {
      id: 's1',
      companyId: null,
      name: 'echo',
      category: 'coding',
      description: 'd',
      toolSchema: { type: 'object', properties: {} },
      promptTemplate: 'p',
      implementationType: 'builtin' as const,
      handlerConfig: null,
      requiredPermissions: ['a'],
      version: 2,
      isPublic: true,
      isSystem: false,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Skill;

    const snap = skillToSnapshot(skill);
    expect(snap.id).toBe('s1');
    expect(snap.name).toBe('echo');
    expect(snap.requiredPermissions).toEqual(['a']);
    expect(snap.version).toBe(2);
  });
});
