import type { AgentMessage } from '../contracts/agent-message.contract.js';
import type { RuntimeContext } from './runtime-context.js';

export interface AgentMessageDispatcher {
  dispatch(message: AgentMessage, context: RuntimeContext): Promise<void>;
}
