import type { SkillToolSnapshot } from '@contracts/events';
import {
  isDirectorManagementSkillName,
  isNonDeliverableQuerySkillName,
  pickDeliverableExecutionSkillName,
} from './execution-skill-picker.util.js';

describe('execution-skill-picker.util', () => {
  const snap = (name: string, promptTemplate?: string | null): SkillToolSnapshot =>
    ({
      id: name,
      name,
      description: null,
      toolSchema: { type: 'object', properties: {} },
      promptTemplate: promptTemplate ?? null,
      implementationType: 'builtin',
      handlerConfig: null,
      requiredPermissions: [],
      version: 1,
      isPublic: true,
      isSystem: false,
    }) as SkillToolSnapshot;

  it('skips director management and query skills for deliverable picking', () => {
    expect(
      pickDeliverableExecutionSkillName([
        snap('director-task-delegator'),
        snap('department.knowledge.query'),
      ]),
    ).toBeNull();
    expect(
      pickDeliverableExecutionSkillName([
        snap('department.knowledge.query'),
        snap('memory.search'),
      ]),
    ).toBeNull();
  });

  it('prefers prompt-based skills', () => {
    expect(
      pickDeliverableExecutionSkillName([
        snap('echo'),
        snap('product-roadmap-prioritizer', '---\nname: product-roadmap-prioritizer\n---\nDo work'),
      ]),
    ).toBe('product-roadmap-prioritizer');
  });

  it('identifies director management skill names', () => {
    expect(isDirectorManagementSkillName('director-task-delegator')).toBe(true);
    expect(isDirectorManagementSkillName('product-roadmap-prioritizer')).toBe(false);
  });

  it('identifies non-deliverable query skill names', () => {
    expect(isNonDeliverableQuerySkillName('department.knowledge.query')).toBe(true);
    expect(isNonDeliverableQuerySkillName('product-roadmap-prioritizer')).toBe(false);
  });
});
