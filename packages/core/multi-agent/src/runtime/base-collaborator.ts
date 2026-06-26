import type { RuntimeContext } from './runtime-context.js';
import type { AgentMessage } from '../contracts/agent-message.contract.js';

export interface CollaborationResult {
  accepted: boolean;
  output?: unknown;
  error?: Error;
}

/**
 * Base collaborator receives delegated agent messages and executes task work.
 */
export abstract class BaseCollaborator {
  protected readonly context: RuntimeContext;

  constructor(context: RuntimeContext) {
    this.context = context;
  }

  public async collaborate(message: AgentMessage): Promise<CollaborationResult> {
    this.context.emitTrace({
      type: 'collaborator.start',
      messageId: message.messageId,
      intent: message.intent,
    });
    try {
      const output = await this.handle(message);
      this.context.emitTrace({
        type: 'collaborator.completed',
        messageId: message.messageId,
      });
      return { accepted: true, output };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.context.emitTrace({
        type: 'collaborator.failed',
        messageId: message.messageId,
        error: err.message,
      });
      return { accepted: false, error: err };
    }
  }

  protected abstract handle(message: AgentMessage): Promise<unknown>;
}
