import type { LayeredGraphNodeInput, LayeredGraphNodeOutput } from './types.js';

export async function specialistExecutionNode(
  input: LayeredGraphNodeInput,
): Promise<LayeredGraphNodeOutput> {
  return {
    next: 'end',
    payload: {
      ...(input.payload ?? {}),
      sourceLayer: 'specialist',
      status: 'completed',
    },
  };
}
