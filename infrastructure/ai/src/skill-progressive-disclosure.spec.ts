import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SkillToolSnapshot } from '@contracts/events';
import {
  buildSkillInstructionsPayload,
  hasPromptBody,
  legacySkillFunctionDescription,
  shouldExpandOnSkillNameCall,
  skillCatalogDescription,
  snapshotsIncludePlanABindings,
  toSkillCatalogEntry,
} from './skill-progressive-disclosure.js';

const baseSnap = (): SkillToolSnapshot => ({
  id: 'sk-1',
  name: 'demo-skill',
  description: 'Short catalog line',
  toolSchema: { type: 'object', properties: {} },
  promptTemplate: '# Full body\n\nDo the thing.',
  implementationType: 'prompt',
  handlerConfig: null,
  requiredPermissions: [],
  version: 1,
  isPublic: true,
  isSystem: false,
  boundTools: [{ name: 'tool.foo', description: 'Foo', inputSchema: {} }],
});

describe('skill-progressive-disclosure', () => {
  it('skillCatalogDescription never uses promptTemplate', () => {
    const snap = baseSnap();
    assert.equal(skillCatalogDescription(snap), 'Short catalog line');
    snap.description = null;
    assert.equal(skillCatalogDescription(snap), 'demo-skill');
  });

  it('hasPromptBody and shouldExpandOnSkillNameCall', () => {
    const snap = baseSnap();
    assert.equal(hasPromptBody(snap), true);
    assert.equal(shouldExpandOnSkillNameCall(snap), true);
    assert.equal(shouldExpandOnSkillNameCall(snap, { progressiveDisclosure: false }), false);
    snap.promptTemplate = '  ';
    assert.equal(hasPromptBody(snap), false);
  });

  it('buildSkillInstructionsPayload includes bound tools', () => {
    const payload = buildSkillInstructionsPayload(baseSnap(), { taskId: 't1' });
    assert.equal(payload.kind, 'skill_instructions');
    assert.equal(payload.skillName, 'demo-skill');
    assert.ok(payload.instructions.includes('Full body'));
    assert.deepEqual(payload.boundTools, ['tool.foo']);
  });

  it('toSkillCatalogEntry omits promptTemplate', () => {
    const entry = toSkillCatalogEntry(baseSnap());
    assert.equal(entry.name, 'demo-skill');
    assert.equal(entry.description, 'Short catalog line');
    assert.ok(!('promptTemplate' in entry));
  });

  it('legacySkillFunctionDescription falls back to template when description empty', () => {
    const snap = baseSnap();
    snap.description = null;
    assert.ok(legacySkillFunctionDescription(snap).includes('Full body'));
  });
});

describe('tool-registry progressive disclosure', () => {
  it('exposes boundTools for prompt implementationType', async () => {
    const { ToolRegistry } = await import('./tool-registry.js');
    const registry = new ToolRegistry();
    const fns = registry.snapshotsToOpenAiFunctions(
      [
        {
          ...baseSnap(),
          implementationType: 'prompt',
          boundTools: [{ name: 'tool.foo', description: 'Foo', inputSchema: {} }],
        },
      ],
      { progressiveDisclosure: true },
    );
    const names = fns.map((f) => f.function.name);
    assert.ok(names.includes('demo-skill'));
    assert.ok(names.includes('tool.foo'));
  });

  it('snapshotsIncludePlanABindings detects Plan A binding arrays', () => {
    assert.equal(snapshotsIncludePlanABindings([]), true);
    assert.equal(
      snapshotsIncludePlanABindings([{ ...baseSnap(), boundTools: [], boundMcpTools: [] }]),
      true,
    );
    const legacyOnly = { ...baseSnap(), boundTools: undefined, boundMcpTools: undefined };
    delete (legacyOnly as { boundTools?: unknown }).boundTools;
    assert.equal(snapshotsIncludePlanABindings([legacyOnly]), false);
  });
});
