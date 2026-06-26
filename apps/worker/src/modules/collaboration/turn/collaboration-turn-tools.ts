import type { CeoV2ToolDefinition } from '@contracts/types';
import { ORCHESTRATION_TOOLS } from '../pipeline-v2/pipeline-v2-orchestration.constants.js';

const COLLABORATION_TURN_BASE_TOOL_NAMES = ['memory.search', 'facts.company.query'] as const;

export const COLLABORATION_TURN_PROGRAM_TOOLS: CeoV2ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'collaboration.program.get_active',
      description:
        'Read the active collaboration Program for this room, including goalUnderstanding summary and brief.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collaboration.orchestrate',
      description:
        'Execute cross-department orchestration and dispatch. ONLY call when the user clearly wants a deliverable/report executed or explicitly asks to dispatch. Never call for greetings, concepts, or insufficient intent.',
      parameters: {
        type: 'object',
        properties: {
          goalSummary: {
            type: 'string',
            description:
              'Integrated task goal for dispatch planning (must combine history + current message; never use short confirm phrases alone).',
          },
          autoFlush: {
            type: 'boolean',
            description: 'Whether to flush dispatch to departments immediately (default true).',
          },
          aspects: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Optional structured facets: audience, timeframe, persona, purpose, etc.',
          },
        },
        required: ['goalSummary'],
      },
    },
  },
];

export const COLLABORATION_TURN_TOOLS: CeoV2ToolDefinition[] = [
  ...ORCHESTRATION_TOOLS.filter((t) =>
    COLLABORATION_TURN_BASE_TOOL_NAMES.includes(
      t.function.name as (typeof COLLABORATION_TURN_BASE_TOOL_NAMES)[number],
    ),
  ),
  ...COLLABORATION_TURN_PROGRAM_TOOLS,
];

export const COLLABORATION_TURN_ALLOWED_TOOL_NAMES = new Set(
  COLLABORATION_TURN_TOOLS.map((t) => String(t.function.name ?? '').trim()).filter(Boolean),
);

export const COLLABORATION_CANONICAL_TOOL_NAMES = new Set<string>([
  ...COLLABORATION_TURN_BASE_TOOL_NAMES,
  'collaboration.program.get_active',
  'collaboration.orchestrate',
]);
