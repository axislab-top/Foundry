import { ToolRegistry } from '@service/ai';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';

describe('redteam: ceo mcp isolation', () => {
  function mkTool(name: string): McpToolDefinition {
    return {
      name,
      description: `${name} test tool`,
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string' },
        },
      },
      transport: {
        kind: 'http',
        url: 'https://example.com/mcp',
        method: 'POST',
      },
      securityProfile: 'safe',
    };
  }

  async function bindTools(params: {
    registry: ToolRegistry;
    companyId: string;
    agentId: string;
    layer?: string;
    tools: McpToolDefinition[];
  }): Promise<void> {
    await params.registry.registerMcpTools({
      protocol: 'MCP-v1',
      companyId: params.companyId,
      agentId: params.agentId,
      layer: params.layer ?? null,
      tools: params.tools,
      securityProfile: 'safe',
      source: 'redteam_test',
      registeredAt: new Date().toISOString(),
    });
  }

  it('未绑定 MCP tool 被 prompt 诱导调用时必须失败', async () => {
    const registry = new ToolRegistry();
    const companyId = 'c-1';
    const agentId = 'a-1';
    const inducedTool = 'mcp.steal.secrets';

    expect(() => {
      registry.assertMcpToolBound(companyId, agentId, inducedTool);
    }).toThrow(/MCP_TOOL_NOT_BOUND|not bound/i);
  });

  it('绑定后的 MCP tool 在正确 Agent/Layer 可通过校验', async () => {
    const registry = new ToolRegistry();
    const companyId = 'c-1';
    const agentId = 'ceo-1';
    const layer = 'heavy';
    const tool = mkTool('mcp.heavy.search');

    await bindTools({
      registry,
      companyId,
      agentId,
      layer,
      tools: [tool],
    });

    expect(() => {
      registry.assertMcpToolBound(companyId, agentId, tool.name, layer);
    }).not.toThrow();
  });

  it('跨 layer 调用（L1 tool 在 L3 执行）必须失败', async () => {
    const registry = new ToolRegistry();
    const companyId = 'c-1';
    const agentId = 'ceo-1';
    const l1Tool = mkTool('mcp.classifier.route');

    await bindTools({
      registry,
      companyId,
      agentId,
      layer: 'classifier',
      tools: [l1Tool],
    });

    expect(() => {
      registry.assertMcpToolBound(companyId, agentId, l1Tool.name, 'heavy');
    }).toThrow(/MCP_TOOL_NOT_BOUND|not bound/i);
  });
});

