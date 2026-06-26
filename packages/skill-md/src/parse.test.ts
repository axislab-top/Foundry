import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSkillMdTemplate, parseSkillMd, parseSkillMdToDbPayload, skillRowToSkillMd } from './index.js';

describe('parseSkillMd', () => {
  it('parses frontmatter and body', () => {
    const raw = `---
name: director-task-delegator
description: Delegate tasks to team members.
category: management
implementationType: prompt
toolSchema: {}
---

# Director

Break goals into subtasks.
`;
    const { frontmatter, body } = parseSkillMd(raw);
    assert.equal(frontmatter.name, 'director-task-delegator');
    assert.equal(frontmatter.implementationType, 'prompt');
    assert.match(body, /Break goals/);
  });

  it('maps to db payload with body as promptTemplate', () => {
    const { payload } = parseSkillMdToDbPayload(defaultSkillMdTemplate('test-skill'));
    assert.equal(payload.name, 'test-skill');
    assert.equal(payload.implementationType, 'prompt');
    assert.ok(payload.promptTemplate.includes('何时使用'));
  });

  it('round-trips via skillRowToSkillMd', () => {
    const { payload } = parseSkillMdToDbPayload(defaultSkillMdTemplate('round-trip'));
    const md = skillRowToSkillMd({
      name: payload.name,
      displayName: payload.displayName,
      description: payload.description,
      promptTemplate: payload.promptTemplate,
      implementationType: payload.implementationType,
      toolSchema: payload.toolSchema,
      category: payload.category,
      icon: payload.icon,
      metadata: payload.metadata,
    });
    const again = parseSkillMd(md);
    assert.equal(again.frontmatter.name, 'round-trip');
  });
});
