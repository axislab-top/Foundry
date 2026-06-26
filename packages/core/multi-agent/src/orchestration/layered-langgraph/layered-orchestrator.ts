import { createAgentMessage, MessageIntent } from '../../contracts/agent-message.contract.js';
import type { AgentMessageDispatcher } from '../../runtime/agent-message-dispatcher.js';
import { RuntimeContext } from '../../runtime/runtime-context.js';
import { ceoBreakdownNode } from './ceo-orchestrator.graph.js';
import { deptSuperviseNode } from './dept-supervisor.graph.js';
import { specialistExecutionNode } from './specialist-execution.graph.js';
import type { LayeredGraphNodeInput, LayeredGraphNodeOutput } from './types.js';

export class LayeredLangGraphOrchestrator {
  constructor(private readonly dispatcher: AgentMessageDispatcher) {}

  public async run(goal: string, initialContext: RuntimeContext): Promise<LayeredGraphNodeOutput> {
    return RuntimeContext.run(initialContext, async () => {
      const context = RuntimeContext.current();
      if (!context) throw new Error('Runtime context is missing');

      let state: LayeredGraphNodeOutput = await ceoBreakdownNode({ goal, context });

      while (state.next !== 'end' && state.next !== 'human') {
        const toAgentId =
          state.nextLayerAgentId ??
          (state.next === 'dept' ? 'dept-supervisor' : 'specialist-executor');
        const msg = createAgentMessage({
          traceId: context.traceId,
          fromAgentId: context.currentAgentId,
          toAgentId,
          intent: MessageIntent.TASK_DELEGATE,
          payload: {
            layer: state.next,
            state: state.payload,
          },
          context: { companyId: context.companyId },
        });
        await this.dispatcher.dispatch(msg, context);
        context.emitTrace({
          type: 'layered.dispatch',
          layer: state.next,
          toAgentId,
          messageId: msg.messageId,
        });

        state =
          state.next === 'dept'
            ? await deptSuperviseNode({
                context,
                payload: state.payload,
              } as LayeredGraphNodeInput)
            : await specialistExecutionNode({
                context,
                payload: state.payload,
              } as LayeredGraphNodeInput);
      }

      context.emitTrace({ type: 'layered.completed', next: state.next });
      return state;
    });
  }
}
