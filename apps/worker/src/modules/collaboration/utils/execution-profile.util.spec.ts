import {
  resolveExecutionProfile,
  soloDirectorMustUseDeliverableSkill,
} from './execution-profile.util.js';

describe('execution-profile.util', () => {
  it('solo_director when department has zero employees', () => {
    expect(resolveExecutionProfile({ assigneeRole: 'director', departmentEmployeeCount: 0 })).toBe(
      'solo_director',
    );
  });

  it('director_delegates when employees exist', () => {
    expect(resolveExecutionProfile({ assigneeRole: 'director', departmentEmployeeCount: 2 })).toBe(
      'director_delegates',
    );
  });

  it('employee for executor assignee', () => {
    expect(resolveExecutionProfile({ assigneeRole: 'executor', departmentEmployeeCount: 0 })).toBe(
      'employee',
    );
  });

  it('solo_director requires deliverable skill path', () => {
    expect(soloDirectorMustUseDeliverableSkill('solo_director')).toBe(true);
    expect(soloDirectorMustUseDeliverableSkill('director_delegates')).toBe(false);
  });
});
