import type { OpenAiFunctionTool } from '@service/ai';
import { applyCeoV2ToolSurface } from './ceo-v2-tool-surface.util.js';

function tool(name: string): OpenAiFunctionTool {
  return { type: 'function', function: { name, description: 'd', parameters: {} } };
}

describe('applyCeoV2ToolSurface', () => {
  it('returns unchanged when mode is off', () => {
    const tools = [tool('a'), tool('b')];
    const out = applyCeoV2ToolSurface({
      layer: 'orchestration',
      mode: 'off',
      allowlist: ['a'],
      tools,
    });
    expect(out.tools).toHaveLength(2);
    expect(out.droppedByAllowlist).toEqual([]);
  });

  it('filters to allowlist in warn mode', () => {
    const out = applyCeoV2ToolSurface({
      layer: 'orchestration',
      mode: 'warn',
      allowlist: ['keep'],
      tools: [tool('keep'), tool('drop')],
    });
    expect(out.tools.map((t) => t.function.name)).toEqual(['keep']);
    expect(out.droppedByAllowlist).toEqual(['drop']);
  });

  it('throws in strict mode when disallowed tools present', () => {
    expect(() =>
      applyCeoV2ToolSurface({
        layer: 'supervision',
        mode: 'strict',
        allowlist: ['x'],
        tools: [tool('x'), tool('y')],
      }),
    ).toThrow(/strict_violation/);
  });
});
