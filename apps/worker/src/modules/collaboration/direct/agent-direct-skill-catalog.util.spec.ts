import {
  buildDirectAgentSkillUsageGuidance,
} from './agent-direct-skill-catalog.util.js';

describe('agent-direct-skill-catalog.util', () => {
  it('usage guidance does not list skill names (tools are source of truth)', () => {
    const text = buildDirectAgentSkillUsageGuidance({ usesToolCatalog: false, skillCount: 3 });
    expect(text).toContain('function tool');
    expect(text).not.toContain('- echo:');
    expect(text).not.toContain('foundry.tool_catalog');
  });

  it('mentions tool_catalog when many skills', () => {
    const text = buildDirectAgentSkillUsageGuidance({ usesToolCatalog: true, skillCount: 40 });
    expect(text).toContain('foundry.tool_catalog');
  });
});
