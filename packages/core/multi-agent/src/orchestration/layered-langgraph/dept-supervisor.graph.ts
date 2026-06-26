import type { LayeredGraphNodeInput, LayeredGraphNodeOutput } from './types.js';

export async function deptSuperviseNode(input: LayeredGraphNodeInput): Promise<LayeredGraphNodeOutput> {
  return {
    next: 'specialist',
    payload: {
      ...(input.payload ?? {}),
      sourceLayer: 'dept',
    },
  };
}
