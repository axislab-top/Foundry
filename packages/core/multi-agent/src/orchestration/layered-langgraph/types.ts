import type { AgentMessage } from '../../contracts/agent-message.contract.js';
import type { RuntimeContext } from '../../runtime/runtime-context.js';

export type GraphLayer = 'ceo' | 'dept' | 'specialist';

export interface LayeredGraphNodeInput {
  goal?: string;
  task?: Record<string, unknown>;
  context: RuntimeContext;
  payload?: Record<string, unknown>;
}

export interface LayeredGraphNodeOutput {
  next: GraphLayer | 'human' | 'end';
  payload: Record<string, unknown>;
  approvalRequest?: Record<string, unknown>;
  nextLayerAgentId?: string;
}

export interface LayeredDispatchEnvelope {
  layer: GraphLayer;
  message: AgentMessage;
}
