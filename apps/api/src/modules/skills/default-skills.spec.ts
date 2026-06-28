import { DIRECTOR_ROLE_DEFAULT_GLOBAL_SKILL_NAMES } from '@contracts/types';
import { getDefaultGlobalSkillNamesForRole } from './default-skills.js';

describe('getDefaultGlobalSkillNamesForRole', () => {
  it('returns director defaults from contracts in stable order', () => {
    expect(getDefaultGlobalSkillNamesForRole('director')).toEqual([...DIRECTOR_ROLE_DEFAULT_GLOBAL_SKILL_NAMES]);
  });

  it('returns a new array instance each call for director', () => {
    const a = getDefaultGlobalSkillNamesForRole('director');
    const b = getDefaultGlobalSkillNamesForRole('director');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('returns empty for ceo and unknown roles', () => {
    expect(getDefaultGlobalSkillNamesForRole('ceo')).toEqual([]);
    expect(getDefaultGlobalSkillNamesForRole('board_member')).toEqual([]);
    expect(getDefaultGlobalSkillNamesForRole('unknown')).toEqual([]);
  });

  it('returns employee defaults for executor role', () => {
    const names = getDefaultGlobalSkillNamesForRole('executor', { departmentToken: 'marketing' });
    expect(names).toContain('heartbeat');
    expect(names).toContain('employee-task-reporter');
    expect(names).toContain('marketing-campaign-planner');
  });
});
