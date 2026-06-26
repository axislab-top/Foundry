import type { CeoV2ToolDefinition } from '@contracts/types';

export const ORCHESTRATION_TOOLS: CeoV2ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'memory.search',
      description: 'Search company memory when historical/project context is needed.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          topK: { type: 'integer', minimum: 1, maximum: 12 },
          namespacesHint: { type: 'array', items: { type: 'string' } },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'facts.company.query',
      description: 'Query real-time company/group facts for people, room members, role presence, org structure.',
      parameters: {
        type: 'object',
        properties: {
          queryType: {
            type: 'string',
            enum: [
              'company_people',
              'room_members',
              'role_presence',
              'org_structure',
              'department_roster',
              'node_roster',
            ],
          },
          roleQuery: { type: 'string' },
          ask: { type: 'string' },
        },
        required: ['queryType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'department.knowledge.query',
      description: 'Retrieve department-specific memory knowledge and execution context.',
      parameters: {
        type: 'object',
        properties: {
          department: { type: 'string' },
          query: { type: 'string' },
          topK: { type: 'integer', minimum: 1, maximum: 10 },
        },
        required: ['department', 'query'],
      },
    },
  },
];

export const MAIN_ROOM_STRATEGY_GOAL_DRAFT_FAST_REPLY = 'main_room_strategy_goal_draft';

export const MAX_ORCHESTRATION_TOOL_ROUNDS = 5;
export const MAX_ORCHESTRATION_TOOL_CALLS = 5;
export const DEFAULT_TOOL_TOKEN_BUDGET = 3200;
export const ROSTER_LINES_RENDER_MAX = 24;
export const CANONICAL_CEO_TOOL_NAMES = new Set([
  'memory.search',
  'facts.company.query',
  'department.knowledge.query',
]);

export type OrchestrationReplyProfile =
  | 'default'
  | 'direct_fact_answer'
  | 'memory_cortex_summary'
  | 'short_confirm';

export type GenerateOrchestrationModelReplyOptions = { replyProfile?: OrchestrationReplyProfile };

export type OrchestrationPolicyDecision = {
  forceFactsCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  leadToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  ceoCompanyKnowledgeMemoryOnly: boolean;
  memoryFirstOrchestration: boolean;
  suppressProfileFollowup: boolean;
  roleSpeakerRequest: boolean;
  policySource: 'builtin' | 'db';
  requestedRoles: string[];
};

export type GovernanceRule = {
  allowRoleSpeakerWithoutProfile?: boolean;
  suppressProfileFollowup?: boolean;
  forceFactsQueryTypes?: string[];
};

export type CeoGovernancePolicyV1 = {
  version: 'v1';
  requireApprovalForHighRiskChanges: boolean;
  defaults: GovernanceRule;
  roomOverrides: Record<string, GovernanceRule>;
  roleOverrides: Record<string, GovernanceRule>;
  updatedAt?: string;
};
