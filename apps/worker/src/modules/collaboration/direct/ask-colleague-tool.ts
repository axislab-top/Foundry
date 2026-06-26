import type { OpenAiFunctionTool } from '@service/ai';

export const ASK_COLLEAGUE_TOOL_NAME = 'tool.ask_colleague';

export const ASK_COLLEAGUE_TOOL: OpenAiFunctionTool = {
  type: 'function',
  function: {
    name: ASK_COLLEAGUE_TOOL_NAME,
    description:
      'Delegate a question or task to a department expert colleague. This is your PRIMARY workflow tool. ' +
      'For any substantive request, you should ask the relevant department(s) first, then synthesize their answers into your final response. ' +
      'You can call this tool multiple times to ask different colleagues in parallel.',
    parameters: {
      type: 'object',
      properties: {
        targetAgentId: {
          type: 'string',
          description: 'The UUID of the colleague agent to ask. Preferred over targetAgentName for precision.',
        },
        targetAgentName: {
          type: 'string',
          description:
            'The name of the colleague agent to ask (case-insensitive match against the Organization directory). ' +
            'Use the department name or agent name from the Organization section of your system prompt.',
        },
        question: {
          type: 'string',
          description: 'The specific question or task to delegate. Be clear and provide enough context for the colleague to give a useful answer.',
        },
      },
      required: ['question'],
    },
  },
};
