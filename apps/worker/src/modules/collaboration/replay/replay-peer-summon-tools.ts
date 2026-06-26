import type { CeoV2ToolDefinition } from '@contracts/types';

/**
 * 主群 CEO replay 层固定注入的 Agent 间协调工具（不依赖 Skill 绑定）。
 * 执行走 AgentExecutionService → API internal `/internal/tools/collaboration/send-to-agent`。
 */
export const REPLAY_PEER_SUMMON_TOOLS: CeoV2ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'tool.organization_node_agents',
      description:
        'List agents under an organization node (department). Use before message_send_to_agent when targetAgentId is unknown.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Organization node UUID' },
          includeSelf: { type: 'boolean' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tool.message_send_to_agent',
      description:
        'Ask a colleague agent to speak in the main room. Required before claiming you @ them. One director per turn for sequential intros.',
      parameters: {
        type: 'object',
        properties: {
          companyId: { type: 'string' },
          senderAgentId: { type: 'string' },
          targetAgentId: { type: 'string' },
          roomId: { type: 'string' },
          content: { type: 'string' },
          expectReply: { type: 'boolean' },
          anchorMessageId: { type: 'string' },
          threadId: { type: 'string' },
        },
        required: ['targetAgentId', 'content'],
      },
    },
  },
];

export const REPLAY_PEER_SUMMON_TOOL_NAMES = new Set(
  REPLAY_PEER_SUMMON_TOOLS.map((t) => t.function.name),
);
