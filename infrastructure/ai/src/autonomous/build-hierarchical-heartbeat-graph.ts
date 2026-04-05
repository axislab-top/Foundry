import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { CeoSupervisorAnnotation } from './ceo-state.js';
import type { BuildHierarchicalHeartbeatGraphOptions } from './types.js';

/**
 * 层级自治流水线：ingest → plan → hierarchicalExpand → validatePersist → summarize → notify。
 */
export function buildHierarchicalHeartbeatGraph(options: BuildHierarchicalHeartbeatGraphOptions) {
  const checkpointer = options.checkpointer ?? new MemorySaver();

  const ingestNode = async (state: typeof CeoSupervisorAnnotation.State) => options.ingest(state);
  const planNode = async (state: typeof CeoSupervisorAnnotation.State) => options.plan(state);
  const hierarchicalExpandNode = async (state: typeof CeoSupervisorAnnotation.State) =>
    options.hierarchicalExpand(state);
  const validatePersistNode = async (state: typeof CeoSupervisorAnnotation.State) =>
    options.validatePersist(state);
  const summarizeNode = async (state: typeof CeoSupervisorAnnotation.State) =>
    options.summarize(state);
  const notifyNode = async (state: typeof CeoSupervisorAnnotation.State) => options.notify(state);

  return new StateGraph(CeoSupervisorAnnotation)
    .addNode('ingest', ingestNode)
    .addNode('plan', planNode)
    .addNode('hierarchicalExpand', hierarchicalExpandNode)
    .addNode('validatePersist', validatePersistNode)
    .addNode('summarize', summarizeNode)
    .addNode('notify', notifyNode)
    .addEdge(START, 'ingest')
    .addEdge('ingest', 'plan')
    .addEdge('plan', 'hierarchicalExpand')
    .addEdge('hierarchicalExpand', 'validatePersist')
    .addEdge('validatePersist', 'summarize')
    .addEdge('summarize', 'notify')
    .addEdge('notify', END)
    .compile({ checkpointer });
}
