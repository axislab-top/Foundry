import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { CeoSupervisorAnnotation } from './ceo-state.js';
import type { BuildCeoHeartbeatGraphOptions } from './types.js';

/**
 * CEO 流水线：ingest → plan（LLM）→ validatePersist → summarize → notify。
 */
export function buildCeoHeartbeatGraph(options: BuildCeoHeartbeatGraphOptions) {
  const checkpointer = options.checkpointer ?? new MemorySaver();

  const ingestNode = async (state: typeof CeoSupervisorAnnotation.State) => options.ingest(state);
  const planNode = async (state: typeof CeoSupervisorAnnotation.State) => options.plan(state);
  const validatePersistNode = async (state: typeof CeoSupervisorAnnotation.State) =>
    options.validatePersist(state);
  const summarizeNode = async (state: typeof CeoSupervisorAnnotation.State) =>
    options.summarize(state);
  const notifyNode = async (state: typeof CeoSupervisorAnnotation.State) => options.notify(state);

  return new StateGraph(CeoSupervisorAnnotation)
    .addNode('ingest', ingestNode)
    .addNode('plan', planNode)
    .addNode('validatePersist', validatePersistNode)
    .addNode('summarize', summarizeNode)
    .addNode('notify', notifyNode)
    .addEdge(START, 'ingest')
    .addEdge('ingest', 'plan')
    .addEdge('plan', 'validatePersist')
    .addEdge('validatePersist', 'summarize')
    .addEdge('summarize', 'notify')
    .addEdge('notify', END)
    .compile({ checkpointer });
}
