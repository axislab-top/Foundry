import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SkillToolSnapshot } from '@contracts/events';
import { ToolRegistry } from './tool-registry.js';
import {
  buildEffectiveOpenAiTools,
  collectBoundMcpToolsFromSnapshots,
  filterSnapshotsBySkillIds,
} from './effective-capability-policy.js';

function snap(partial: Partial<SkillToolSnapshot> & { id: string; name: string }): SkillToolSnapshot {
  return {
    description: partial.description ?? 'Catalog',
    toolSchema: { type: 'object', properties: {} },
    promptTemplate: partial.promptTemplate ?? null,
    implementationType: partial.implementationType ?? 'prompt',
    handlerConfig: null,
    requiredPermissions: [],
    version: 1,
    isPublic: true,
    isSystem: false,
    ...partial,
  };
}

describe('effective-capability-policy', () => {
  it('filterSnapshotsBySkillIds keeps only configured ids', () => {
    const a = snap({ id: 'a', name: 'skill-a' });
    const b = snap({ id: 'b', name: 'skill-b' });
    const out = filterSnapshotsBySkillIds([a, b], ['b']);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, 'b');
  });

  it('collectBoundMcpToolsFromSnapshots dedupes by name', () => {
    const s1 = snap({
      id: '1',
      name: 's1',
      boundMcpTools: [{ name: 'mcp.foo', description: 'Foo', inputSchema: {} }],
    } as SkillToolSnapshot);
    const s2 = snap({
      id: '2',
      name: 's2',
      boundMcpTools: [{ name: 'mcp.foo', description: 'Foo dup', inputSchema: {} }],
    } as SkillToolSnapshot);
    const mcp = collectBoundMcpToolsFromSnapshots([s1, s2]);
    assert.equal(mcp.length, 1);
    assert.equal(mcp[0]?.name, 'mcp.foo');
  });

  it('buildEffectiveOpenAiTools exposes MCP only from snapshot bindings', () => {
    const registry = new ToolRegistry();
    registry.registerMcpTools({
      protocol: 'MCP-v1',
      companyId: 'c1',
      agentId: 'ceo',
      layer: 'strategy',
      tools: [
        {
          name: 'mcp.agent_wide',
          description: 'Should not appear',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      securityProfile: 'safe',
      source: 'test',
      registeredAt: new Date().toISOString(),
    });

    const withMcp = snap({
      id: 'skill-b',
      name: 'skill-b',
      boundMcpTools: [{ name: 'mcp.from_skill', description: 'From skill', inputSchema: {} }],
    } as SkillToolSnapshot);
    const withoutMcp = snap({ id: 'skill-a', name: 'skill-a' });

    const result = buildEffectiveOpenAiTools(registry, {
      snapshots: [withoutMcp, withMcp],
      configuredSkillIds: ['skill-a', 'skill-b'],
      progressiveDisclosure: true,
    });

    const names = result.injectedToolNames;
    assert.ok(names.includes('skill-a'));
    assert.ok(names.includes('skill-b'));
    assert.ok(names.includes('mcp.from_skill'));
    assert.ok(!names.includes('mcp.agent_wide'));
    assert.deepEqual(result.boundMcpToolNames, ['mcp.from_skill']);
  });

  it('retainToolNames filters merged tools', () => {
    const registry = new ToolRegistry();
    const s = snap({
      id: 's1',
      name: 'director-task-delegator',
      promptTemplate: 'Long body should not be in description',
      boundMcpTools: [{ name: 'mcp.extra', description: 'x', inputSchema: {} }],
    } as SkillToolSnapshot);

    const result = buildEffectiveOpenAiTools(registry, {
      snapshots: [s],
      configuredSkillIds: ['s1'],
      progressiveDisclosure: true,
      retainToolNames: new Set(['mcp.extra']),
    });

    assert.deepEqual(result.injectedToolNames, ['mcp.extra']);
  });

  it('progressiveDisclosure omits promptTemplate from skill function description', () => {
    const registry = new ToolRegistry();
    const s = snap({
      id: 's1',
      name: 'report-skill',
      description: 'Short catalog',
      promptTemplate: 'Very long instructions that must not appear in tool description',
    });

    const result = buildEffectiveOpenAiTools(registry, {
      snapshots: [s],
      progressiveDisclosure: true,
    });

    const skillFn = result.tools.find((t) => t.function.name === 'report-skill');
    assert.ok(skillFn);
    assert.ok(skillFn!.function.description.includes('Short catalog'));
    assert.ok(!skillFn!.function.description.includes('Very long instructions'));
  });

  it('enabledToolsets filters skills by metadata.requiresToolsets', () => {
    const registry = new ToolRegistry();
    const open = snap({
      id: 'open',
      name: 'open-skill',
      handlerConfig: { metadata: {} },
    });
    const gated = snap({
      id: 'gated',
      name: 'gated-skill',
      handlerConfig: { metadata: { requiresToolsets: ['finance'] } },
    });

    const result = buildEffectiveOpenAiTools(registry, {
      snapshots: [open, gated],
      enabledToolsets: ['finance'],
      progressiveDisclosure: true,
    });

    assert.ok(result.injectedToolNames.includes('open-skill'));
    assert.ok(result.injectedToolNames.includes('gated-skill'));

    const noFinance = buildEffectiveOpenAiTools(registry, {
      snapshots: [open, gated],
      enabledToolsets: ['ops'],
      progressiveDisclosure: true,
    });
    assert.ok(noFinance.injectedToolNames.includes('open-skill'));
    assert.ok(!noFinance.injectedToolNames.includes('gated-skill'));
  });

  it('toolSearch collapses large tool surfaces to skill catalog + foundry.tool_catalog', () => {
    const registry = new ToolRegistry();
    const snapshots: SkillToolSnapshot[] = [];
    for (let i = 0; i < 30; i++) {
      snapshots.push(
        snap({
          id: `s${i}`,
          name: `skill-${i}`,
          boundTools: [{ name: `tool.t${i}`, description: 't', inputSchema: {} }],
        } as SkillToolSnapshot),
      );
    }

    const result = buildEffectiveOpenAiTools(registry, {
      snapshots,
      progressiveDisclosure: true,
      toolSearch: { enabled: true, threshold: 10 },
    });

    const names = result.injectedToolNames;
    assert.ok(names.includes('foundry.tool_catalog'));
    assert.ok(names.includes('skill-0'));
    assert.ok(!names.includes('tool.t0'));
  });
});
